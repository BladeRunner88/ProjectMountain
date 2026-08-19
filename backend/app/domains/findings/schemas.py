"""Wire contract for computed operational findings."""

from typing import Any

from pydantic import BaseModel


class FindingWindow(BaseModel):
    """The time span the finding was computed over."""

    start: str
    end: str


class FindingEntity(BaseModel):
    """A thing the finding is about. `type` is a display label, not always an ontology type."""

    type: str
    name: str


class Finding(BaseModel):
    """One computed discrepancy, with the evidence that produced it.

    Every number in `computed` is a real calculation over the normalised tables — nothing
    here is asserted. The language stops at co-occurrence and never claims causation.
    """

    id: str
    finding_type: str
    title: str
    description: str
    sources: list[str]
    computed: dict[str, Any]
    window: FindingWindow
    entities: list[FindingEntity]
    reviewer_status: str
    # Populated once a human reviews it. Nothing writes these today — see Phase 6.
    reviewed_by: str | None
    reviewed_at: str | None
    evidence: dict[str, Any]


class WindowContext(BaseModel):
    """Everything every source recorded inside a window, so a reader can judge the finding."""

    batches: list[dict[str, Any]]
    cycles: list[dict[str, Any]]
    runs: list[dict[str, Any]]
    work_orders: list[dict[str, Any]]


class FindingDetail(Finding):
    """One finding plus the surrounding activity from every other source."""

    # None when the finding's own window is unparseable — better than an invented span.
    context: WindowContext | None
