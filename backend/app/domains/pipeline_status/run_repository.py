"""Pipeline run history. Reads the API-owned database, not the warehouse."""

from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.domains.pipeline_status.models import PipelineRun


class PipelineRunRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def latest(self) -> PipelineRun | None:
        """The most recent completed run, successful or not."""
        stmt = (
            select(PipelineRun)
            .where(PipelineRun.finished_at.is_not(None))
            .order_by(desc(PipelineRun.started_at))
            .limit(1)
        )
        return self._session.scalar(stmt)

    def recent(self, *, limit: int, offset: int) -> list[PipelineRun]:
        stmt = (
            select(PipelineRun).order_by(desc(PipelineRun.started_at)).limit(limit).offset(offset)
        )
        return list(self._session.scalars(stmt))

    def count(self) -> int:
        return len(list(self._session.scalars(select(PipelineRun.id))))
