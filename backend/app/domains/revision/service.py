"""Revision rules: the queue's state machine and the audit chain's transaction boundary."""

from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session

from app.core.pagination import LimitOffset
from app.db.retry import with_write_retry
from app.domains.revision.exceptions import (
    IdempotencyKeyReusedError,
    QueueItemAlreadyResolvedError,
    QueueItemNotFoundError,
)
from app.domains.revision.models import RevisionAuditEntry, RevisionQueueItem
from app.domains.revision.repository import RevisionAuditRepository, RevisionQueueRepository
from app.domains.revision.schemas import (
    STAGE_AFTER,
    AuditEntryRecord,
    ChainVerification,
    QueueActionPayload,
    QueueItemPayload,
    QueueItemRecord,
)
from app.domains.revision.seal import compute_seal

TERMINAL_STAGES = frozenset({"resolved-correct", "resolved-wrong", "overruled", "closed"})


class RevisionService:
    def __init__(
        self,
        session: Session,
        queue: RevisionQueueRepository,
        audit: RevisionAuditRepository,
    ) -> None:
        self._session = session
        self._queue = queue
        self._audit = audit

    def raise_item(self, payload: QueueItemPayload) -> QueueItemRecord:
        def _persist() -> RevisionQueueItem:
            item = RevisionQueueItem(stage="open", **payload.model_dump())
            self._queue.add(item)
            self._session.commit()
            return item

        # Safe to replay: builds a fresh row and commits, no side effect inside.
        return _to_item_record(with_write_retry(_persist))

    def list_items(
        self, *, stage: str | None, priority: str | None, page: LimitOffset
    ) -> tuple[list[QueueItemRecord], int]:
        items, total = self._queue.list(
            stage=stage, priority=priority, limit=page.limit, offset=page.offset
        )
        return [_to_item_record(item) for item in items], total

    def act(self, item_id: UUID, payload: QueueActionPayload) -> QueueItemRecord:
        """Apply a decision, and seal it into the audit chain.

        The item's move and the audit entry are one transaction on purpose: a decision
        that changed the queue without leaving a sealed record — or the reverse — would
        make the chain a description of something other than what happened.
        """
        item = self._queue.get(item_id)
        if item is None:
            raise QueueItemNotFoundError(str(item_id))

        # Checked before the terminal-stage guard, deliberately. A client retrying a
        # request whose response it never saw would otherwise be told 409 for a decision
        # it made itself — the exact case an idempotency key exists to prevent.
        if payload.idempotency_key is not None:
            already = self._queue.by_idempotency_key(payload.idempotency_key)
            if already is not None:
                if already.id != item_id:
                    raise IdempotencyKeyReusedError(payload.idempotency_key)
                return _to_item_record(already)

        if item.stage in TERMINAL_STAGES:
            raise QueueItemAlreadyResolvedError(str(item_id), item.stage)

        occurred_at = datetime.now(UTC)
        entry_payload: dict[str, Any] = {
            "queue_item_id": str(item_id),
            "note": payload.note,
            "from_stage": item.stage,
            "to_stage": STAGE_AFTER[payload.action],
        }

        def _persist() -> RevisionQueueItem:
            # Read inside the block: a replay after a conflict must chain onto whatever
            # the winning transaction left behind, not onto the state seen before it.
            previous = self._audit.last()
            sequence = 1 if previous is None else previous.sequence + 1
            prev_seal = None if previous is None else previous.seal

            current = self._queue.get(item_id)
            if current is None:  # pragma: no cover - the row cannot vanish mid-request
                raise QueueItemNotFoundError(str(item_id))
            current.stage = STAGE_AFTER[payload.action]
            current.owner = payload.actor
            if payload.action in {"approve", "reject", "correct"}:
                current.resolved_at = occurred_at
            if payload.idempotency_key is not None:
                current.idempotency_key = payload.idempotency_key

            self._audit.add(
                RevisionAuditEntry(
                    sequence=sequence,
                    queue_item_id=str(item_id),
                    actor=payload.actor,
                    action=payload.action,
                    occurred_at=occurred_at,
                    payload=entry_payload,
                    seal=compute_seal(
                        sequence=sequence,
                        actor=payload.actor,
                        action=payload.action,
                        occurred_at=occurred_at,
                        payload=entry_payload,
                        prev_seal=prev_seal,
                    ),
                    prev_seal=prev_seal,
                )
            )
            self._session.commit()
            return current

        return _to_item_record(with_write_retry(_persist))

    def audit(self) -> list[AuditEntryRecord]:
        return [_to_audit_record(entry) for entry in self._audit.chain()]

    def verify(self) -> ChainVerification:
        """Re-walk the chain and recompute every seal.

        This is what makes the chain worth storing. It catches a row edited directly in
        the database — the case an application-level check can never see.
        """
        entries = self._audit.chain()
        prev_seal: str | None = None
        for entry in entries:
            expected = compute_seal(
                sequence=entry.sequence,
                actor=entry.actor,
                action=entry.action,
                occurred_at=entry.occurred_at,
                payload=entry.payload,
                prev_seal=prev_seal,
            )
            if entry.prev_seal != prev_seal or entry.seal != expected:
                return ChainVerification(
                    intact=False, entries=len(entries), broken_at=entry.sequence
                )
            prev_seal = entry.seal
        return ChainVerification(intact=True, entries=len(entries), broken_at=None)


def _to_item_record(item: RevisionQueueItem) -> QueueItemRecord:
    return QueueItemRecord(
        id=str(item.id),
        source_tab=item.source_tab,
        kind=item.kind,
        subject_id=item.subject_id,
        priority=item.priority,
        stage=item.stage,
        owner=item.owner,
        summary=item.summary,
        detail=item.detail,
        resolved_at=_stamp(item.resolved_at),
    )


def _to_audit_record(entry: RevisionAuditEntry) -> AuditEntryRecord:
    return AuditEntryRecord(
        id=str(entry.id),
        sequence=entry.sequence,
        queue_item_id=entry.queue_item_id,
        actor=entry.actor,
        action=entry.action,
        occurred_at=_stamp(entry.occurred_at) or "",
        payload=entry.payload,
        seal=entry.seal,
        prev_seal=entry.prev_seal,
    )


def _stamp(moment: datetime | None) -> str | None:
    """Naive-UTC ISO with a trailing Z, matching every other timestamp on the wire."""
    if moment is None:
        return None
    return moment.astimezone(UTC).replace(tzinfo=None).isoformat() + "Z"
