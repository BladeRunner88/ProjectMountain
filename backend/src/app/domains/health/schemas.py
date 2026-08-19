"""Wire contract for the liveness and readiness endpoints."""

from pydantic import BaseModel


class CheckResponse(BaseModel):
    """Liveness. Deliberately has exactly one field — see the router docstring."""

    status: str


class HealthResponse(BaseModel):
    """Readiness: real counts, so it fails loudly when the pipeline has not been run."""

    entity_count: int
    relationship_count: int
    source_count: int
    event_count: int
    # None when nothing has been ingested at all — a rate over zero records is not 0.0.
    sync_success_rate: float | None
