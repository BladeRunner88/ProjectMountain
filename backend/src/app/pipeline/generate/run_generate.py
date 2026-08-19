"""Stage 1 — synthesize the six vendor exports.

Each feed gets its own RNG stream, derived from the run seed and the feed's name. Adding
or resizing one feed therefore cannot shift the contents of another, which is what makes
`--scale small` produce the same *kinds* of data as `--scale full` rather than a
different world.
"""

import random
from pathlib import Path
from typing import Any

from app.pipeline.build_world import build_world
from app.pipeline.generate import contractor, maintenance, mes, quality, scada
from app.pipeline.manifest import (
    CONTRACTOR_FILE,
    MAINTENANCE_FILE,
    MES_FILE,
    QC_INLINE_FILE,
    QC_LAB_FILE,
    SCADA_FILE,
)
from app.pipeline.scale import Scale
from app.pipeline.world import SEED, World


def _stream(name: str) -> random.Random:
    """An independent, reproducible RNG per feed."""
    return random.Random(f"{SEED}:{name}")


def generate_all(scale: Scale, raw_directory: Path) -> tuple[World, dict[str, Any]]:
    """Write all six feeds. Returns the ground truth and a report of what was written."""
    raw_directory.mkdir(parents=True, exist_ok=True)
    for existing in raw_directory.glob("*"):
        if existing.is_file():
            existing.unlink()

    world = build_world(machine_count=scale.machines, rng=_stream("world"))

    mes_report = mes.generate(world, scale, _stream("mes"), raw_directory / MES_FILE)
    report: dict[str, Any] = {
        MES_FILE: mes_report,
        SCADA_FILE: scada.generate(world, scale, _stream("scada"), raw_directory / SCADA_FILE),
        QC_INLINE_FILE: quality.generate_inline(
            world, scale, _stream("qc_inline"), raw_directory / QC_INLINE_FILE
        ),
        QC_LAB_FILE: quality.generate_lab(
            world, scale, _stream("qc_lab"), raw_directory / QC_LAB_FILE
        ),
        MAINTENANCE_FILE: maintenance.generate(
            world,
            scale,
            _stream("maintenance"),
            raw_directory / MAINTENANCE_FILE,
            spike_at=mes_report["spike_at"],
        ),
        CONTRACTOR_FILE: contractor.generate(
            world, scale, _stream("contractor"), raw_directory / CONTRACTOR_FILE
        ),
    }
    return world, report
