"""Wire contract for pipeline and normalisation metrics."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from app.core.traced import Traced


class StatsResponse(BaseModel):
    """What the pipeline did, and two counts that quantify how fragmented the data is."""

    ingestion: dict[str, int]
    resolution: dict[str, int]
    source_divergences_unresolved: int
    entities_in_only_one_source: int


class PipelineStage(BaseModel):
    """One stage of the pipeline, and what the last run of it actually did.

    Four stages, because there are four. The browser drew twelve — Data Observer, Context
    Engine, Pattern Learning and so on — none of which correspond to code that runs. This
    reports what executed.
    """

    order: int
    name: str
    description: str
    state: str = Field(description="ok, failed, or never-run")
    last_run_at: datetime | None
    duration_seconds: float | None
    records: Traced[int | None]


class PipelineRunSummary(BaseModel):
    """One execution of the pipeline."""

    id: str
    started_at: datetime
    finished_at: datetime | None
    duration_seconds: float | None
    stage: str
    scale: str
    succeeded: bool
    stats: dict[str, Any]
    error: str | None
