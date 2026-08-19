"""The CMMS export: work orders.

Excel, so timestamps arrive as serial numbers counted from 1899-12-30 rather than as
dates. The CMMS is also the one system that holds the historian tag verbatim, which makes
it the only feed that can be joined on an identifier instead of a fuzzy match.

A block of orders is raised shortly before the MES production spike. The findings engine
must report that the two co-occurred and stop there — a work order preceding a burst of
runs is not evidence that it caused them.
"""

import random
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any

from openpyxl import Workbook

from app.pipeline.scale import Scale
from app.pipeline.world import WINDOW_DAYS, WINDOW_START, World

EXCEL_EPOCH = date(1899, 12, 30)
TRIGGER_LEAD_MINUTES = (10, 35)

_HEADERS = (
    "work_order",
    "historian_tag",
    "wo_type",
    "priority",
    "plant",
    "scheduled_at",
    "raised_by",
)
_TYPES = ("preventive", "corrective", "inspection", "calibration", "lubrication")
_PRIORITIES = ("P1", "P2", "P3", "P4")
_TYPE_WEIGHTS = (46, 24, 16, 8, 6)


def generate(
    world: World,
    scale: Scale,
    rng: random.Random,
    output: Path,
    spike_at: datetime,
) -> dict[str, Any]:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "WorkOrders"
    sheet.append(list(_HEADERS))

    for index in range(scale.work_orders):
        _append(sheet, index, world, _moment(rng), rng)

    for index in range(scale.work_order_trigger):
        raised = spike_at - timedelta(minutes=rng.randint(*TRIGGER_LEAD_MINUTES))
        _append(sheet, scale.work_orders + index, world, raised, rng)

    workbook.save(output)
    return {"rows": scale.work_orders + scale.work_order_trigger, "spike_at": spike_at}


def _append(sheet: Any, index: int, world: World, scheduled: datetime, rng: random.Random) -> None:
    asset = rng.choice(world.assets)
    sheet.append(
        [
            f"WO-{index + 1:06d}",
            # Verbatim. This is the one genuinely shared key across two systems.
            asset.historian_tag,
            rng.choices(_TYPES, weights=_TYPE_WEIGHTS)[0],
            rng.choice(_PRIORITIES),
            asset.plant,
            _to_excel_serial(scheduled),
            asset.operator,
        ]
    )


def _to_excel_serial(moment: datetime) -> float:
    """Excel stores a datetime as days since 1899-12-30, with time as the fraction."""
    delta = moment - datetime.combine(EXCEL_EPOCH, datetime.min.time())
    return delta.days + delta.seconds / 86_400


def _moment(rng: random.Random) -> datetime:
    return datetime.combine(WINDOW_START, datetime.min.time()) + timedelta(
        days=rng.randint(0, WINDOW_DAYS - 1),
        minutes=rng.randint(0, 24 * 60 - 1),
    )
