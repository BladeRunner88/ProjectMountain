"""The service contractor export: callouts against equipment.

The contractor runs its own numbering. `EQ-000123-M` and the plant's `AST-000123` share no
text at all and are the same asset — only the digits inside them agree. Dates carry no
time of day, because a callout is logged against a day.
"""

import csv
import random
from datetime import timedelta
from pathlib import Path
from typing import Any

from app.pipeline.generate.messiness import numeric_core
from app.pipeline.scale import Scale
from app.pipeline.world import WINDOW_DAYS, WINDOW_START, World

HEADERS = ("callout_id", "vendor", "equipment_ref", "service_date", "billing_status", "hours")

_VENDORS = (
    "Rhein Industrial Service",
    "Moravia Maintenance",
    "Norte Servicios Industriales",
    "Midlands Plant Care",
    "Vasteras Teknik",
    "Great Lakes Machine Services",
)
_BILLING = ("invoiced", "pending", "disputed")
_BILLING_WEIGHTS = (78, 17, 5)


def generate(world: World, scale: Scale, rng: random.Random, output: Path) -> dict[str, Any]:
    serviced = rng.sample(world.assets, min(scale.contractor_callouts, len(world.assets)))

    with output.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(HEADERS)
        for index, asset in enumerate(serviced):
            writer.writerow(
                [
                    f"CO-{index + 1:06d}",
                    rng.choice(_VENDORS),
                    # The contractor's own reference. Same digits, different decoration.
                    f"EQ-{numeric_core(asset.asset_tag)}-M",
                    (WINDOW_START + timedelta(days=rng.randint(0, WINDOW_DAYS - 1))).isoformat(),
                    rng.choices(_BILLING, weights=_BILLING_WEIGHTS)[0],
                    round(rng.uniform(0.5, 12.0), 1),
                ]
            )
    return {"rows": len(serviced), "vendors": len(_VENDORS)}


def vendor_names() -> tuple[str, ...]:
    """The maintenance vendors, for the resolve stage to mint objects from."""
    return _VENDORS
