"""Revision persistence. Stages rows; the service owns the transaction."""

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.domains.revision.models import RevisionAuditEntry, RevisionQueueItem


class RevisionQueueRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def add(self, item: RevisionQueueItem) -> None:
        """Stage only. The service commits."""
        self._session.add(item)

    def get(self, item_id: UUID) -> RevisionQueueItem | None:
        return self._session.get(RevisionQueueItem, item_id)

    def list(
        self, *, stage: str | None, priority: str | None, limit: int, offset: int
    ) -> tuple[list[RevisionQueueItem], int]:
        """A page of the queue, and how many items match the filter.

        The total is counted separately rather than inferred from the page, so a client
        showing "12 of 340" is not quietly showing "12 of 12".
        """
        statement = select(RevisionQueueItem)
        if stage:
            statement = statement.where(RevisionQueueItem.stage == stage)
        if priority:
            statement = statement.where(RevisionQueueItem.priority == priority)

        total = self._session.scalar(select(func.count()).select_from(statement.subquery()))
        page = statement.order_by(RevisionQueueItem.created_at).limit(limit).offset(offset)
        return list(self._session.scalars(page)), int(total or 0)

    def by_idempotency_key(self, key: str) -> RevisionQueueItem | None:
        return self._session.scalar(
            select(RevisionQueueItem).where(RevisionQueueItem.idempotency_key == key)
        )


class RevisionAuditRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def add(self, entry: RevisionAuditEntry) -> None:
        """Stage only. The service commits."""
        self._session.add(entry)

    def chain(self) -> list[RevisionAuditEntry]:
        """The whole chain in sequence order — the only order it can be verified in."""
        return list(
            self._session.scalars(select(RevisionAuditEntry).order_by(RevisionAuditEntry.sequence))
        )

    def last(self) -> RevisionAuditEntry | None:
        return self._session.scalar(
            select(RevisionAuditEntry).order_by(RevisionAuditEntry.sequence.desc()).limit(1)
        )
