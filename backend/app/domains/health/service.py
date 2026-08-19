"""Readiness rules: what the counts mean."""

from app.domains.health.repository import HealthRepository
from app.domains.health.schemas import HealthResponse
from app.domains.sources.catalog import SOURCES

_ROUNDING = 4


class HealthService:
    def __init__(self, repository: HealthRepository) -> None:
        self._repository = repository

    def readiness(self) -> HealthResponse:
        stats = self._repository.pipeline_stats()
        failed = stats.get("records_failed_to_parse", 0)
        total = stats.get("records_ingested", 0) + failed

        return HealthResponse(
            entity_count=self._repository.count_objects(),
            relationship_count=self._repository.count_links(),
            # The manifest is the source of truth for how many feeds exist, not a query:
            # a feed that delivered nothing is still a configured source.
            source_count=len(SOURCES),
            event_count=self._repository.count_events(),
            sync_success_rate=round((total - failed) / total, _ROUNDING) if total else None,
        )
