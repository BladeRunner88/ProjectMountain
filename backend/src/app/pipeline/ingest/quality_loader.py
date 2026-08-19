"""Reads the two quality feeds into clean.batches.

Both land in one table because they describe the same kind of event. What differs is
carried as data — `inspection_station`, `disposition_raw` next to `disposition`,
`unit_original` next to `quantity_kg` — rather than as two shapes a consumer must join.
"""

import csv
from collections.abc import Callable, Iterator
from pathlib import Path
from typing import Any

from app.pipeline.ingest.counters import IngestCounters
from app.pipeline.ingest.timestamps import Instant, from_iso_with_offset, from_lab_local
from app.pipeline.manifest import QC_INLINE_FILE, QC_LAB_FILE, SOURCES
from app.pipeline.vocabulary import canonical_disposition, to_kilograms
from app.pipeline.world import INLINE_STATION, LAB_STATION

_INLINE_PROVENANCE = (QC_INLINE_FILE, SOURCES[QC_INLINE_FILE]["department"])
_LAB_PROVENANCE = (QC_LAB_FILE, SOURCES[QC_LAB_FILE]["department"])


def load_inline(path: Path, counters: IngestCounters) -> list[tuple[Any, ...]]:
    """Inline QC: canonical dispositions, explicit UTC offsets."""
    rows = []
    for record in _records(path):
        row = _batch(
            batch_id=record["batch_id"],
            station=INLINE_STATION,
            asset_ref=record["asset_ref"],
            part_name=record["part_name"],
            plant=record["plant"],
            quantity=record["quantity"],
            unit=record["uom"],
            disposition_raw=record["status"],
            occurred=_parse(from_iso_with_offset, record["created_at"]),
            provenance=_INLINE_PROVENANCE,
            source_file=QC_INLINE_FILE,
            counters=counters,
        )
        if row is not None:
            rows.append(row)
    return rows


def load_lab(path: Path, counters: IngestCounters) -> list[tuple[Any, ...]]:
    """The lab: its own vocabulary, plant-local wall clock, some rows with no time at all."""
    rows = []
    for record in _records(path):
        row = _batch(
            batch_id=record["batch_id"],
            station=LAB_STATION,
            asset_ref=record["equipment"],
            part_name=record["part_name"],
            plant=record["plant"],
            quantity=record["value"],
            unit=record["uom"],
            disposition_raw=record["result"],
            occurred=_parse(from_lab_local, record["local_datetime"], record["plant"]),
            provenance=_LAB_PROVENANCE,
            source_file=QC_LAB_FILE,
            counters=counters,
        )
        if row is not None:
            rows.append(row)
    return rows


def _records(path: Path) -> Iterator[dict[str, str]]:
    with path.open(encoding="utf-8", newline="") as handle:
        yield from csv.DictReader(handle)


def _parse(parser: Callable[..., Instant], *arguments: str) -> Instant | None:
    """None when the feed offered something unparseable, so the caller can count it."""
    try:
        return parser(*arguments)
    except ValueError:
        return None


def _batch(
    *,
    batch_id: str,
    station: str,
    asset_ref: str,
    part_name: str,
    plant: str,
    quantity: str,
    unit: str,
    disposition_raw: str,
    occurred: Instant | None,
    provenance: tuple[str, str],
    source_file: str,
    counters: IngestCounters,
) -> tuple[Any, ...] | None:
    """One batch row, or None when the feed gave something unusable.

    A row is dropped rather than guessed at. Every drop is counted, and the count is what
    /connectors turns into a degraded or failed status — a silently discarded row would
    make a broken feed look healthy.
    """
    if occurred is None:
        counters.rejected(source_file)
        return None

    try:
        quantity_kg = to_kilograms(float(quantity), unit)
    except (ValueError, KeyError):
        counters.rejected(source_file)
        return None

    disposition = canonical_disposition(disposition_raw)
    if disposition is None:
        counters.rejected(source_file)
        return None

    counters.timestamp(assumed=occurred.tz_assumed)
    counters.unit_conversions += 1
    counters.status_values_mapped += 1
    counters.kept(source_file)

    return (
        batch_id,
        station,
        asset_ref,
        part_name,
        plant,
        float(quantity),
        unit,
        round(quantity_kg, 4),
        disposition_raw,
        disposition,
        occurred.at,
        occurred.tz_assumed,
        *provenance,
    )
