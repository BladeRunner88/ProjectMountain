"""Storage contract for the revision queue and its audit chain.

Everything the other surfaces raise — an unresolved conflict, a rule below its accuracy
floor, an unbound Meaning field, a prediction that resolved wrong — lands here as a row a
person must act on. The queue was previously derived in the browser, which meant a
reload erased every decision anyone had made.
"""

from datetime import datetime
from typing import Any

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDMixin
from app.db.json_text import JsonText

_ID = 120
_SHORT = 120
_LONG = 4000


class RevisionQueueItem(UUIDMixin, TimestampMixin, Base):
    """One thing awaiting a human decision."""

    __tablename__ = "revision_queue_items"

    # Which surface raised it: model | identity | meaning | detection | prediction |
    # exposure | trust.
    source_tab: Mapped[str] = mapped_column(String(_SHORT))
    # conflict | tuning | unbound-field | prediction-wrong | single-source | ...
    kind: Mapped[str] = mapped_column(String(_SHORT))
    # The graph entity, rule or finding the item is about. Cross-file, so not an FK.
    subject_id: Mapped[str] = mapped_column(String(_ID))
    # critical | standard | backlog
    priority: Mapped[str] = mapped_column(String(_SHORT))
    # open | under-review | resolved-correct | resolved-wrong | overruled | closed
    stage: Mapped[str] = mapped_column(String(_SHORT), default="open")
    owner: Mapped[str | None] = mapped_column(String(_SHORT))
    summary: Mapped[str] = mapped_column(String(_LONG))
    # The impact preview and recommendation the UI renders. Shape varies by `kind`, and
    # it is read back whole with the item, never queried across rows.
    detail: Mapped[dict[str, Any]] = mapped_column(JsonText, default=dict)
    # Supplied by the client on the action call so a retried POST cannot double-apply a
    # decision. Unique, so the second attempt collides instead of inserting.
    idempotency_key: Mapped[str | None] = mapped_column(String(_ID), unique=True)
    resolved_at: Mapped[datetime | None]


class RevisionAuditEntry(UUIDMixin, TimestampMixin, Base):
    """One hash-chained link in the audit trail.

    `prev_seal` is the previous entry's `seal`, so re-walking the chain and recomputing
    each seal detects any row that was altered after the fact. That verification is the
    reason the chain exists; without persistence it verified only what the current
    browser tab happened to have generated.
    """

    __tablename__ = "revision_audit_entries"

    # Monotonic per chain. Explicit rather than relying on insertion order, because the
    # seal covers it and a columnar store gives no ordering guarantee on its own.
    sequence: Mapped[int] = mapped_column(unique=True)
    queue_item_id: Mapped[str | None] = mapped_column(String(_ID))
    actor: Mapped[str] = mapped_column(String(_SHORT))
    # approve | reject | correct | annotate | defer
    action: Mapped[str] = mapped_column(String(_SHORT))
    occurred_at: Mapped[datetime]
    payload: Mapped[dict[str, Any]] = mapped_column(JsonText, default=dict)
    # Hex digest over (prev_seal, sequence, actor, action, occurred_at, payload).
    seal: Mapped[str] = mapped_column(String(_ID))
    # Null on the genesis entry only.
    prev_seal: Mapped[str | None] = mapped_column(String(_ID))
