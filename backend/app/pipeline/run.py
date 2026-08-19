"""Pipeline entry point.

    python -m app.pipeline.run --stage all --scale full

The four stages run in order and each reads what the previous one wrote. Every execution
is recorded in `app.pipeline_runs`, so the API can report when the warehouse was last
built and whether the build succeeded — rather than inferring it from row counts.
"""

import argparse
import logging
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path
from time import perf_counter
from typing import Any
from uuid import uuid4

from sqlalchemy import Engine, create_engine

from app.core.config import Settings, get_settings
from app.core.logging import configure_logging
from app.db.session import AppSessionFactory, duckdb_config
from app.domains.pipeline_status.models import PipelineRun
from app.pipeline.findings.run_findings import compute_all
from app.pipeline.generate.run_generate import generate_all
from app.pipeline.ingest.run_ingest import ingest_all
from app.pipeline.resolve.run_resolve import resolve_all
from app.pipeline.scale import SCALES, Scale

logger = logging.getLogger(__name__)

STAGES = ("generate", "ingest", "resolve", "findings", "all")


def main(argv: list[str] | None = None) -> int:
    arguments = _parse(argv)
    settings = get_settings()
    configure_logging(settings.log_level)

    warehouse = _warehouse_path(settings)
    raw_directory = warehouse.parent / "raw"
    scale = SCALES[arguments.scale]

    run = _start_run(arguments.stage, scale)
    try:
        stats = run_pipeline(arguments.stage, scale, warehouse, raw_directory)
    except Exception as error:
        _finish_run(run, succeeded=False, stats={}, error=repr(error))
        logger.exception("pipeline failed")
        raise
    _finish_run(run, succeeded=True, stats=stats, error=None)

    logger.info("pipeline complete: %s", stats)
    return 0


def run_pipeline(stage: str, scale: Scale, warehouse: Path, raw_directory: Path) -> dict[str, Any]:
    """Run one stage, or all four in order. Returns what each stage reported."""
    stats: dict[str, Any] = {"stage": stage, "scale": scale.name}
    timings: dict[str, float] = {}
    engine = _warehouse_engine(warehouse)
    try:
        if stage in ("generate", "all"):
            with _timed("generate", timings):
                _, report = generate_all(scale, raw_directory)
            stats["generate"] = {name: _serialisable(info) for name, info in report.items()}

        with engine.begin() as connection:
            if stage in ("ingest", "all"):
                with _timed("ingest", timings):
                    stats["ingest"] = ingest_all(connection, raw_directory).as_stats()
            if stage in ("resolve", "all"):
                with _timed("resolve", timings):
                    stats["resolve"] = resolve_all(connection).stats
            if stage in ("findings", "all"):
                with _timed("findings", timings):
                    stats["findings"] = {"count": len(compute_all(connection))}
    finally:
        engine.dispose()

    # Per stage, not per run. Reporting the whole run's duration against each stage would
    # claim four measurements where only one was taken.
    stats["durations_seconds"] = timings
    return stats


@contextmanager
def _timed(name: str, into: dict[str, float]) -> Iterator[None]:
    started = perf_counter()
    try:
        yield
    finally:
        into[name] = round(perf_counter() - started, 3)


def _warehouse_engine(warehouse: Path) -> Engine:
    warehouse.parent.mkdir(parents=True, exist_ok=True)
    return create_engine(
        f"duckdb:///{warehouse}",
        # The pipeline is the only writer of this file, and it must match the
        # configuration any co-resident reader in this process presents.
        connect_args={"config": duckdb_config(get_settings())},
    )


def _warehouse_path(settings: Settings) -> Path:
    """Where the pipeline writes — not necessarily what the API is currently reading."""
    return Path(settings.pipeline_output_url.removeprefix("duckdb:///"))


def _start_run(stage: str, scale: Scale) -> PipelineRun:
    run = PipelineRun(
        id=uuid4(),
        started_at=datetime.now(UTC),
        stage=stage,
        scale=scale.name,
        succeeded=False,
        stats={},
    )
    with AppSessionFactory() as session:
        session.add(run)
        session.commit()
    return run


def _finish_run(
    run: PipelineRun, *, succeeded: bool, stats: dict[str, Any], error: str | None
) -> None:
    with AppSessionFactory() as session:
        stored = session.get(PipelineRun, run.id)
        if stored is None:
            return
        stored.finished_at = datetime.now(UTC)
        stored.succeeded = succeeded
        stored.stats = stats
        stored.error = error
        session.commit()


def _serialisable(info: Any) -> Any:
    """Stage reports carry datetimes; the run record is JSON."""
    if isinstance(info, dict):
        return {key: _serialisable(value) for key, value in info.items()}
    if isinstance(info, datetime):
        return info.isoformat()
    return info


def _parse(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build the Isildur warehouse.")
    parser.add_argument("--stage", choices=STAGES, default="all")
    parser.add_argument("--scale", choices=sorted(SCALES), default="full")
    return parser.parse_args(argv)


if __name__ == "__main__":
    raise SystemExit(main())
