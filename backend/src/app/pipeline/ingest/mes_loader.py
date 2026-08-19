"""Reads mes_platform.json into raw.mes_* and clean.assets / clean.runs."""

import json
from pathlib import Path
from typing import Any

from app.pipeline.ingest.counters import IngestCounters
from app.pipeline.ingest.timestamps import from_iso_with_offset
from app.pipeline.manifest import MES_FILE, SOURCES
from app.pipeline.vocabulary import canonical_supplier

_DEPARTMENT = SOURCES[MES_FILE]["department"]
_PROVENANCE = (MES_FILE, _DEPARTMENT)


def load(path: Path, counters: IngestCounters) -> dict[str, list[tuple[Any, ...]]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    return {
        "raw.mes_assets": _raw_assets(payload["assets"]),
        "raw.mes_runs": _raw_runs(payload["production_runs"]),
        "clean.assets": _clean_assets(payload["assets"], counters),
        "clean.runs": _clean_runs(payload["production_runs"], counters),
    }


def _raw_assets(assets: list[dict[str, Any]]) -> list[tuple[Any, ...]]:
    return [
        (
            asset["asset_id"],
            asset["asset_name"],
            asset["historian_tag"],
            asset["serial"],
            asset["plant"],
            asset["unit_system"],
            asset["status"],
            asset["operator"],
            asset["commissioned_at"],
            *_PROVENANCE,
        )
        for asset in assets
    ]


def _raw_runs(runs: list[dict[str, Any]]) -> list[tuple[Any, ...]]:
    return [
        (
            run["run_id"],
            run["asset_id"],
            run["part_name"],
            run["supplier"],
            run["started_at"],
            run["ended_at"],
            run["declared_cycles"],
            run["device"],
            run["operator"],
            *_PROVENANCE,
        )
        for run in runs
    ]


def _clean_assets(assets: list[dict[str, Any]], counters: IngestCounters) -> list[tuple[Any, ...]]:
    rows = []
    for asset in assets:
        commissioned = from_iso_with_offset(asset["commissioned_at"])
        counters.timestamp(assumed=commissioned.tz_assumed)
        rows.append(
            (
                asset["asset_id"],
                # Casing and padding are how one system happens to have written it down.
                # The comparable name is the trimmed one; the original stays in raw.
                asset["asset_name"].strip(),
                asset["historian_tag"],
                asset["serial"],
                asset["plant"],
                asset["unit_system"],
                asset["status"],
                asset["operator"],
                commissioned.at,
                *_PROVENANCE,
            )
        )
        counters.kept(MES_FILE)
    return rows


def _clean_runs(runs: list[dict[str, Any]], counters: IngestCounters) -> list[tuple[Any, ...]]:
    rows = []
    for run in runs:
        started = from_iso_with_offset(run["started_at"])
        ended = from_iso_with_offset(run["ended_at"])
        counters.timestamp(assumed=started.tz_assumed)
        counters.timestamp(assumed=ended.tz_assumed)
        rows.append(
            (
                run["run_id"],
                run["asset_id"],
                run["part_name"],
                run["supplier"],
                canonical_supplier(run["supplier"]),
                started.at,
                ended.at,
                run["declared_cycles"],
                run["device"],
                run["operator"],
                *_PROVENANCE,
            )
        )
        counters.kept(MES_FILE)
    return rows
