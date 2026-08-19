"""The two quality feeds: inline QC and the metrology lab.

Same real events, recorded twice, incompatibly. That is the point of having two:

  * **Inline QC** writes canonical dispositions and explicit UTC offsets.
  * **The lab** writes its own vocabulary (RELEASED / REJECTED / HOLD_FOR_REVIEW), local
    wall-clock time with no offset, quantities in whatever unit the plant works in, and a
    handful of rows with an empty timestamp.

The seeded incident lives in the lab feed: for five days one plant's release rate drops
sharply. Nothing about the row shape changes, so only a rate computed per plant per day
finds it.
"""

import csv
import random
from datetime import datetime, time, timedelta
from pathlib import Path
from typing import Any

from app.pipeline.generate.messiness import mask_tag
from app.pipeline.scale import Scale
from app.pipeline.world import DEGRADED_PLANT, WINDOW_DAYS, WINDOW_START, World

DEGRADED_DAY_OFFSET = 70
DEGRADED_DAYS = 5

# Inline QC states its offset. These are the ones its exporters are configured with.
_INLINE_OFFSETS = ("+00:00", "+01:00", "-06:00", "+02:00")
_INLINE_DISPOSITIONS = ("pass", "rework", "scrap")
_INLINE_WEIGHTS = (82, 13, 5)

_LAB_RESULTS = ("RELEASED", "REJECTED", "HOLD_FOR_REVIEW")
_LAB_WEIGHTS = (80, 14, 6)
# During the incident, releases collapse. Not to zero — a feed that stops entirely is a
# different finding, and this one has to be found by rate rather than by absence.
_LAB_DEGRADED_WEIGHTS = (20, 68, 12)
_LAB_TIME_FORMAT = "%m/%d/%Y %H:%M"

_METRIC_UNITS = ("kg", "g", "t")
_IMPERIAL_UNITS = ("lb", "oz")

# A batch has a real mass. Each recording system writes that same mass in whatever unit it
# works in — which is the entire point of the two feeds disagreeing. Picking a number and
# a unit independently would make a 400-tonne batch sit next to a 400-gram one and turn
# the reconciled total into nonsense.
_BATCH_MASS_KG = (1.0, 400.0)
_KG_PER_UNIT = {"kg": 1.0, "g": 0.001, "t": 1000.0, "lb": 0.45359237, "oz": 0.028349523125}

INLINE_HEADERS = (
    "batch_id",
    "asset_ref",
    "part_name",
    "status",
    "plant",
    "quantity",
    "uom",
    "created_at",
)
LAB_HEADERS = (
    "batch_id",
    "equipment",
    "part_name",
    "result",
    "plant",
    "value",
    "uom",
    "local_datetime",
)


def generate_inline(world: World, scale: Scale, rng: random.Random, output: Path) -> dict[str, Any]:
    with output.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(INLINE_HEADERS)
        for index in range(scale.inline_batches):
            asset = rng.choice(world.assets)
            component = rng.choice(world.components)
            occurred = _moment(rng)
            unit = rng.choice(_units_for(asset.unit_system))
            writer.writerow(
                [
                    f"IQ-{index + 1:07d}",
                    mask_tag(asset.asset_tag),
                    component.part_name,
                    rng.choices(_INLINE_DISPOSITIONS, weights=_INLINE_WEIGHTS)[0],
                    asset.plant,
                    _mass_as(unit, rng),
                    unit,
                    occurred.isoformat() + rng.choice(_INLINE_OFFSETS),
                ]
            )
    return {"rows": scale.inline_batches}


def generate_lab(world: World, scale: Scale, rng: random.Random, output: Path) -> dict[str, Any]:
    degraded_start, degraded_end = _degraded_window()

    with output.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(LAB_HEADERS)

        for index in range(scale.lab_batches):
            asset = rng.choice(world.assets)
            component = rng.choice(world.components)
            occurred = _moment(rng)
            degraded = asset.plant == DEGRADED_PLANT and degraded_start <= occurred < degraded_end
            unit = rng.choice(_units_for(asset.unit_system))
            writer.writerow(
                [
                    f"LB{index + 1:07d}",
                    mask_tag(asset.asset_tag),
                    component.part_name,
                    rng.choices(
                        _LAB_RESULTS,
                        weights=_LAB_DEGRADED_WEIGHTS if degraded else _LAB_WEIGHTS,
                    )[0],
                    asset.plant,
                    _mass_as(unit, rng),
                    unit,
                    # Local wall clock, no offset. Ingest must assume the plant's.
                    occurred.strftime(_LAB_TIME_FORMAT),
                ]
            )

        _write_malformed(writer, world, scale, rng)

    return {
        "rows": scale.lab_batches,
        "malformed": scale.lab_malformed,
        "degraded_plant": DEGRADED_PLANT,
    }


def _write_malformed(writer: Any, world: World, scale: Scale, rng: random.Random) -> None:
    """Rows with no timestamp at all — the kind every real export contains a few of."""
    for index in range(scale.lab_malformed):
        asset = rng.choice(world.assets)
        unit = rng.choice(_units_for(asset.unit_system))
        writer.writerow(
            [
                f"LB{scale.lab_batches + index + 1:07d}",
                mask_tag(asset.asset_tag),
                rng.choice(world.components).part_name,
                rng.choice(_LAB_RESULTS),
                asset.plant,
                _mass_as(unit, rng),
                unit,
                "",
            ]
        )


def _degraded_window() -> tuple[datetime, datetime]:
    start = datetime.combine(WINDOW_START, time(0)) + timedelta(days=DEGRADED_DAY_OFFSET)
    return start, start + timedelta(days=DEGRADED_DAYS)


def _units_for(unit_system: str) -> tuple[str, ...]:
    return _METRIC_UNITS if unit_system == "metric" else _IMPERIAL_UNITS


def _mass_as(unit: str, rng: random.Random) -> float:
    """A batch mass, expressed in `unit`. The underlying mass is the same either way."""
    kilograms = rng.uniform(*_BATCH_MASS_KG)
    return round(kilograms / _KG_PER_UNIT[unit], 3)


def _moment(rng: random.Random) -> datetime:
    return datetime.combine(WINDOW_START, time(0)) + timedelta(
        days=rng.randint(0, WINDOW_DAYS - 1),
        minutes=rng.randint(0, 24 * 60 - 1),
    )
