"""Assembles the pipeline statistics response."""

from app.domains.pipeline_status.repository import PipelineStatsRepository
from app.domains.pipeline_status.schemas import StatsResponse


class PipelineStatsService:
    def __init__(self, repository: PipelineStatsRepository) -> None:
        self._repository = repository

    def stats(self) -> StatsResponse:
        return StatsResponse(
            ingestion=self._repository.ingestion_stats(),
            resolution=self._repository.resolution_stats(),
            source_divergences_unresolved=self._repository.count_open_source_divergences(),
            entities_in_only_one_source=self._repository.count_assets_seen_in_one_source_only(),
        )
