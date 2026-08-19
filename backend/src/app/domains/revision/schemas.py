"""Wire contract for the revision queue and its audit chain."""

from typing import Any, Literal

from pydantic import BaseModel, Field

_SHORT = 120
_LONG = 4000

SourceTab = Literal["model", "identity", "meaning", "detection", "prediction", "exposure", "trust"]
Priority = Literal["critical", "standard", "backlog"]
Stage = Literal["open", "under-review", "resolved-correct", "resolved-wrong", "overruled", "closed"]
Action = Literal["approve", "reject", "correct", "annotate", "defer"]

# Which stage each action moves an item to. A table rather than a chain of ifs, because
# this mapping is the queue's entire state machine and belongs somewhere readable.
STAGE_AFTER: dict[str, str] = {
    "approve": "resolved-correct",
    "reject": "resolved-wrong",
    "correct": "overruled",
    # Neither closes the item: an annotation is a note, and a deferral is a decision to
    # decide later. Both still belong in the audit chain.
    "annotate": "under-review",
    "defer": "under-review",
}
CLOSING_ACTIONS = frozenset({"approve", "reject", "correct"})


class QueueItemPayload(BaseModel):
    """A thing raised for a human to decide."""

    source_tab: SourceTab
    kind: str = Field(min_length=1, max_length=_SHORT)
    subject_id: str = Field(min_length=1, max_length=_SHORT)
    priority: Priority = "standard"
    summary: str = Field(min_length=1, max_length=_LONG)
    detail: dict[str, Any] = Field(default_factory=dict)


class QueueItemRecord(BaseModel):
    """A stored queue item, as read back."""

    id: str
    source_tab: SourceTab
    kind: str
    subject_id: str
    priority: Priority
    stage: Stage
    owner: str | None
    summary: str
    detail: dict[str, Any]
    resolved_at: str | None


class QueueActionPayload(BaseModel):
    """A decision on a queue item."""

    action: Action
    actor: str = Field(min_length=1, max_length=_SHORT)
    note: str | None = Field(default=None, max_length=_LONG)
    # Supplied by the client so a retried POST cannot apply the same decision twice.
    # Optional, because a caller that does not supply one simply gets no protection —
    # refusing the request outright would break a plain curl against the API.
    idempotency_key: str | None = Field(default=None, max_length=_SHORT)


class AuditEntryRecord(BaseModel):
    """One link in the audit chain."""

    id: str
    sequence: int
    queue_item_id: str | None
    actor: str
    action: Action
    occurred_at: str
    payload: dict[str, Any]
    seal: str
    prev_seal: str | None


class ChainVerification(BaseModel):
    """The result of re-walking the chain and recomputing every seal."""

    intact: bool
    entries: int
    # The first sequence number whose recomputed seal does not match what is stored, or
    # whose prev_seal does not match the entry before it. None when the chain is intact.
    broken_at: int | None
