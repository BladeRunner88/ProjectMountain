"""Pipeline execution history and normalisation metrics."""

from fastapi import APIRouter, status

from app.api.deps import PaginationDep
from app.core.pagination import Page
from app.domains.pipeline_status.deps import PipelineRunServiceDep, PipelineStatsServiceDep
from app.domains.pipeline_status.schemas import (
    PipelineRunSummary,
    PipelineStage,
    StatsResponse,
)

stats_router = APIRouter(prefix="/stats", tags=["stats"])
pipeline_router = APIRouter(prefix="/pipeline", tags=["pipeline"])


@stats_router.get("", status_code=status.HTTP_200_OK)
def get_stats(service: PipelineStatsServiceDep) -> StatsResponse:
    """How much was ingested, how much resolved, and how much only one source can see."""
    return service.stats()


@pipeline_router.get("/stages", status_code=status.HTTP_200_OK)
def get_stages(service: PipelineRunServiceDep) -> list[PipelineStage]:
    """The four stages that run, and what the last run of each actually did."""
    return service.stages()


@pipeline_router.get("/runs", status_code=status.HTTP_200_OK)
def get_runs(service: PipelineRunServiceDep, pagination: PaginationDep) -> Page[PipelineRunSummary]:
    """Every recorded pipeline execution, most recent first."""
    return service.runs(pagination)
