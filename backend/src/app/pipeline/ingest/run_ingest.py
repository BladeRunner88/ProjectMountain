"""Stage 2 — load the six vendor exports into raw.* and clean.*.

Each feed is read by its own loader; this module only decides the order, writes the rows
in bulk, and records what the run cost. One `executemany` per table rather than a row at a
time: on a columnar engine the difference is orders of magnitude.
"""

from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlalchemy import Connection

from app.pipeline.bulk import insert_rows
from app.pipeline.ingest import (
    field_inventory,
    mes_loader,
    plan_loader,
    quality_loader,
    scada_loader,
)
from app.pipeline.ingest.counters import IngestCounters
from app.pipeline.ingest.schema import create_all
from app.pipeline.manifest import (
    CONTRACTOR_FILE,
    MAINTENANCE_FILE,
    MES_FILE,
    QC_INLINE_FILE,
    QC_LAB_FILE,
    SCADA_FILE,
    SOURCES,
)


def ingest_all(connection: Connection, raw_directory: Path) -> IngestCounters:
    counters = IngestCounters()
    create_all(connection)

    batches: dict[str, list[tuple[Any, ...]]] = {}
    batches.update(mes_loader.load(raw_directory / MES_FILE, counters))
    batches.update(scada_loader.load(raw_directory / SCADA_FILE, counters))
    batches["clean.batches"] = quality_loader.load_inline(
        raw_directory / QC_INLINE_FILE, counters
    ) + quality_loader.load_lab(raw_directory / QC_LAB_FILE, counters)
    batches["clean.work_orders"] = plan_loader.load_work_orders(
        raw_directory / MAINTENANCE_FILE, counters
    )
    batches["clean.callouts"] = plan_loader.load_callouts(raw_directory / CONTRACTOR_FILE, counters)
    batches["clean.source_fields"] = _observe_fields(raw_directory)

    for table, rows in batches.items():
        insert_rows(connection, table, rows)

    _write_stats(connection, counters)
    return counters


def _observe_fields(raw_directory: Path) -> list[tuple[Any, ...]]:
    """One row per field per feed, read from the files themselves.

    Ingest is the only place that opens all six, and the vendor's own field names live
    nowhere else — `raw.*` holds the loader's names, and only for the two feeds that
    have raw tables at all.
    """
    return [
        (field, filename, SOURCES[filename]["department"])
        for filename in SOURCES
        for field in field_inventory.observe(raw_directory / filename)
    ]


def _write_stats(connection: Connection, counters: IngestCounters) -> None:
    insert_rows(
        connection,
        "main.pipeline_stats",
        [(key, value) for key, value in counters.as_stats().items()],
    )

    synced_at = datetime.now(UTC).replace(microsecond=0).isoformat()
    insert_rows(
        connection,
        "main.connector_status",
        [
            (
                source_file,
                meta["owner"],
                meta["department"],
                meta["format"],
                meta["describes"],
                counters.source(source_file).records,
                counters.source(source_file).failed,
                synced_at,
            )
            for source_file, meta in SOURCES.items()
        ],
    )
