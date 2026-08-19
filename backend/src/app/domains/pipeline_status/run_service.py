"""What the pipeline last did, reported from its own run history."""

from typing import Any

from app.core.pagination import LimitOffset, Page
from app.core.traced import observed
from app.domains.pipeline_status.models import PipelineRun
from app.domains.pipeline_status.run_repository import PipelineRunRepository
from app.domains.pipeline_status.schemas import PipelineRunSummary, PipelineStage
from app.domains.pipeline_status.stages import STAGES

_NEVER_RUN = "never-run"
_OK = "ok"
_FAILED = "failed"
_COMPUTED_BY = "pipeline run record"


class PipelineRunService:
    def __init__(self, repository: PipelineRunRepository) -> None:
        self._repository = repository

    def stages(self) -> list[PipelineStage]:
        latest = self._repository.latest()
        return [self._stage(stage_def, latest) for stage_def in STAGES]

    def runs(self, pagination: LimitOffset) -> Page[PipelineRunSummary]:
        runs = self._repository.recent(limit=pagination.limit, offset=pagination.offset)
        return Page[PipelineRunSummary](
            items=[_summarise(run) for run in runs],
            total=self._repository.count(),
            limit=pagination.limit,
            offset=pagination.offset,
        )

    def _stage(self, stage_def: Any, latest: PipelineRun | None) -> PipelineStage:
        if latest is None:
            return PipelineStage(
                order=stage_def.order,
                name=stage_def.name,
                description=stage_def.description,
                # Not "ok with zero records". Nothing has ever run, and saying so is the
                # difference between a working pipeline and one nobody has started.
                state=_NEVER_RUN,
                last_run_at=None,
                duration_seconds=None,
                records=observed(None, computed_by=_COMPUTED_BY),
            )

        stats = latest.stats or {}
        reported = stats.get(stage_def.stats_key)
        ran = reported is not None
        durations = stats.get("durations_seconds") or {}
        return PipelineStage(
            order=stage_def.order,
            name=stage_def.name,
            description=stage_def.description,
            state=_OK
            if latest.succeeded and ran
            else (_FAILED if not latest.succeeded else _NEVER_RUN),
            last_run_at=latest.finished_at,
            duration_seconds=durations.get(stage_def.stats_key),
            records=observed(
                _record_count(reported),
                unit="records",
                computed_by=_COMPUTED_BY,
                as_of=latest.finished_at,
                derived_from=[str(latest.id)],
            ),
        )


def _record_count(reported: Any) -> int | None:
    """How many rows a stage reported, when it reported a number at all."""
    if not isinstance(reported, dict):
        return None
    for key in ("records_ingested", "count"):
        value = reported.get(key)
        if isinstance(value, int):
            return value
    return None


def _duration(run: PipelineRun) -> float | None:
    if run.finished_at is None:
        return None
    return round((run.finished_at - run.started_at).total_seconds(), 3)


def _summarise(run: PipelineRun) -> PipelineRunSummary:
    return PipelineRunSummary(
        id=str(run.id),
        started_at=run.started_at,
        finished_at=run.finished_at,
        duration_seconds=_duration(run),
        stage=run.stage,
        scale=run.scale,
        succeeded=run.succeeded,
        stats=run.stats or {},
        error=run.error,
    )
