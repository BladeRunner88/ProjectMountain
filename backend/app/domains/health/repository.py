"""Counts behind /health. Queries only — no rules, no commits."""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.warehouse.clean_tables import EVENT_TABLES
from app.db.warehouse.graph_tables import links, objects
from app.db.warehouse.meta_tables import pipeline_stats


class HealthRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def count_objects(self) -> int:
        return self._session.scalar(select(func.count()).select_from(objects)) or 0

    def count_links(self) -> int:
        return self._session.scalar(select(func.count()).select_from(links)) or 0

    def count_events(self) -> int:
        """Every observation the pipeline ingested, across all five event tables."""
        return sum(
            self._session.scalar(select(func.count()).select_from(table)) or 0
            for table in EVENT_TABLES
        )

    def pipeline_stats(self) -> dict[str, int]:
        rows = self._session.execute(select(pipeline_stats.c.key, pipeline_stats.c.value)).all()
        return dict(rows)  # type: ignore[arg-type]  # Row is a 2-tuple here
