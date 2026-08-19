"""Pipeline-statistics dependencies."""

from typing import Annotated

from fastapi import Depends

from app.api.deps import SessionDep, WarehouseSessionDep
from app.domains.pipeline_status.repository import PipelineStatsRepository
from app.domains.pipeline_status.run_repository import PipelineRunRepository
from app.domains.pipeline_status.run_service import PipelineRunService
from app.domains.pipeline_status.service import PipelineStatsService


def get_pipeline_stats_service(session: WarehouseSessionDep) -> PipelineStatsService:
    return PipelineStatsService(PipelineStatsRepository(session))


def get_pipeline_run_service(session: SessionDep) -> PipelineRunService:
    """Run history lives in the API-owned database, not the warehouse."""
    return PipelineRunService(PipelineRunRepository(session))


PipelineStatsServiceDep = Annotated[PipelineStatsService, Depends(get_pipeline_stats_service)]
PipelineRunServiceDep = Annotated[PipelineRunService, Depends(get_pipeline_run_service)]
