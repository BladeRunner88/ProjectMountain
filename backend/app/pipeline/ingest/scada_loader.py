"""Reads scada_historian.xml into raw.scada_* and clean.components / clean.cycles."""

import hashlib
from pathlib import Path
from typing import Any
from xml.etree import ElementTree

from app.pipeline.ingest.counters import IngestCounters
from app.pipeline.ingest.timestamps import from_historian
from app.pipeline.manifest import SCADA_FILE, SOURCES
from app.pipeline.vocabulary import canonical_supplier

_PROVENANCE = (SCADA_FILE, SOURCES[SCADA_FILE]["department"])

# Cycle lengths for the seeded signal shape, in seconds. Spread so that channels on one
# machine do not all peak together, which would look like a fault rather than a rhythm.
_PERIOD_CHOICES = (900, 1_800, 3_600, 7_200, 14_400)


def load(path: Path, counters: IngestCounters) -> dict[str, list[tuple[Any, ...]]]:
    # The file is produced by this pipeline's own generate stage into a gitignored
    # directory; it is never user input and never fetched. defusedxml would be the answer
    # for an untrusted document, but adding it is a dependency change.
    root = ElementTree.parse(path).getroot()  # noqa: S314
    components = _components(root, counters)
    supplier_by_part = {row[0]: row[3] for row in components}

    # Parsed once. Walking the tree separately for the raw and clean rows meant 45,000
    # elements visited twice and seven `find` calls per element on each pass.
    cycles = _parse_cycles(root)
    channels = _channels(root, counters)
    return {
        "raw.scada_components": [
            (row[0], row[1], row[2], row[4], *_PROVENANCE) for row in components
        ],
        "clean.components": [(*row, *_PROVENANCE) for row in components],
        "raw.scada_channels": [(*row, *_PROVENANCE) for row in channels],
        "clean.sensor_profiles": [_profile(row) for row in channels],
        "raw.scada_cycles": _raw_cycles(cycles),
        "clean.cycles": _clean_cycles(cycles, supplier_by_part, counters),
    }


def _channels(root: ElementTree.Element, counters: IngestCounters) -> list[tuple[Any, ...]]:
    """The historian's own tag configuration — one row per machine per channel."""
    rows = []
    for channel in root.findall("./channels/channel"):
        rows.append(
            (
                _text(channel, "channel_id"),
                _text(channel, "tag"),
                _text(channel, "channel_name"),
                _text(channel, "unit"),
                float(_text(channel, "sample_rate_hz")),
                float(_text(channel, "baseline")),
                float(_text(channel, "amplitude")),
                float(_text(channel, "noise_sigma")),
                _text(channel, "status"),
            )
        )
        counters.kept(SCADA_FILE)
    return rows


def _profile(row: tuple[Any, ...]) -> tuple[Any, ...]:
    """Add the derived period and phase a reading can be reconstructed from.

    Both are functions of the channel id, so a sensor always has the same signal shape and
    no per-tick row ever has to be stored — a reading is computed from a timestamp instead.
    """
    digest = hashlib.blake2b(str(row[0]).encode(), digest_size=8).digest()
    seed = int.from_bytes(digest, "big")
    period_seconds = float(_PERIOD_CHOICES[seed % len(_PERIOD_CHOICES)])
    return (
        row[0],
        row[1],
        row[2],
        row[3],
        row[4],
        row[5],
        row[6],
        period_seconds,
        float(seed % int(period_seconds)),
        row[7],
        row[8],
        *_PROVENANCE,
    )


def _components(root: ElementTree.Element, counters: IngestCounters) -> list[tuple[Any, ...]]:
    rows = []
    for part in root.findall("./parts/part"):
        supplier_raw = _text(part, "supplier")
        rows.append(
            (
                _text(part, "part_number"),
                _text(part, "part_name"),
                supplier_raw,
                canonical_supplier(supplier_raw),
                float(_text(part, "nominal_cycle_seconds")),
            )
        )
        counters.kept(SCADA_FILE)
    return rows


def _parse_cycles(root: ElementTree.Element) -> list[dict[str, str]]:
    """Every cycle element as a plain dict, read in a single pass over the tree."""
    return [
        {child.tag: (child.text or "").strip() for child in cycle}
        for cycle in root.findall("./cycles/cycle")
    ]


def _raw_cycles(cycles: list[dict[str, str]]) -> list[tuple[Any, ...]]:
    return [
        (
            cycle["cycle_id"],
            cycle["part_id"],
            cycle["tag"],
            cycle["timestamp"],
            float(cycle["cycle_seconds"]),
            int(cycle["scrap_count"]),
            cycle["outcome"],
            *_PROVENANCE,
        )
        for cycle in cycles
    ]


def _clean_cycles(
    cycles: list[dict[str, str]],
    supplier_by_part: dict[str, str],
    counters: IngestCounters,
) -> list[tuple[Any, ...]]:
    rows = []
    for cycle in cycles:
        part_number = cycle["part_id"]
        occurred = from_historian(cycle["timestamp"])
        counters.timestamp(assumed=occurred.tz_assumed)
        rows.append(
            (
                cycle["cycle_id"],
                part_number,
                cycle["tag"],
                # The historian names the supplier on the part, not the cycle. Carrying it
                # down here is what lets a silence be attributed to a supplier at all.
                supplier_by_part.get(part_number, ""),
                occurred.at,
                occurred.tz_assumed,
                float(cycle["cycle_seconds"]),
                int(cycle["scrap_count"]),
                cycle["outcome"],
                *_PROVENANCE,
            )
        )
        counters.kept(SCADA_FILE)
    return rows


def _text(element: ElementTree.Element, tag: str) -> str:
    found = element.find(tag)
    return (found.text or "").strip() if found is not None else ""
