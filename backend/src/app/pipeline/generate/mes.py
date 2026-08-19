"""The plant MES export: asset register, production runs, operators.

JSON, explicit UTC timestamps, full asset tags. The best-behaved of the six feeds — which
is what makes the others' failures visible by contrast.
"""

import json
import random
from datetime import datetime, time, timedelta
from pathlib import Path
from typing import Any

from app.pipeline.generate.messiness import messy_case, messy_pad
from app.pipeline.scale import Scale
from app.pipeline.world import WINDOW_DAYS, WINDOW_START, World

# The spike the work-order push precedes. Confined to one line so the anomaly has a
# subject a reader can name.
SPIKE_LINE = "Final assembly"
SPIKE_DAY_OFFSET = 61
SPIKE_HOUR = 14

_DEVICES = ("hmi-panel", "handheld", "line-controller", "supervisor-console")


def generate(world: World, scale: Scale, rng: random.Random, output: Path) -> dict[str, Any]:
    """Write mes_platform.json and return the spike instant the CMMS must anticipate."""
    spike_at = datetime.combine(WINDOW_START, time(SPIKE_HOUR)) + timedelta(days=SPIKE_DAY_OFFSET)

    payload = {
        "assets": _assets(world, rng),
        "production_runs": _runs(world, scale, rng) + _spike_runs(world, scale, rng, spike_at),
    }
    output.write_text(json.dumps(payload, indent=1), encoding="utf-8")
    return {
        "spike_at": spike_at,
        "assets": len(payload["assets"]),
        "runs": len(payload["production_runs"]),
    }


def _assets(world: World, rng: random.Random) -> list[dict[str, Any]]:
    return [
        {
            "asset_id": asset.asset_tag,
            # Casing and padding vary by who typed it. The name itself does not.
            "asset_name": messy_pad(messy_case(asset.asset_name, rng), rng),
            "historian_tag": asset.historian_tag,
            "serial": asset.serial,
            "plant": asset.plant,
            "unit_system": asset.unit_system,
            "status": asset.status,
            "operator": asset.operator,
            "commissioned_at": asset.commissioned_at.isoformat(),
        }
        for asset in world.assets
    ]


def _runs(world: World, scale: Scale, rng: random.Random) -> list[dict[str, Any]]:
    runs = []
    for index in range(scale.production_runs):
        asset = rng.choice(world.assets)
        component = rng.choice(world.components)
        started = _moment(rng)
        runs.append(_run(index, asset, component, started, rng))
    return runs


def _spike_runs(
    world: World, scale: Scale, rng: random.Random, spike_at: datetime
) -> list[dict[str, Any]]:
    """A burst of runs on one line within the hour after the work orders went out."""
    spike_assets = [
        asset for asset in world.assets if _line_of(world, asset.machine_id) == SPIKE_LINE
    ]
    if not spike_assets:
        spike_assets = world.assets

    runs = []
    for index in range(scale.run_spike):
        asset = rng.choice(spike_assets)
        component = rng.choice(world.components)
        started = spike_at + timedelta(minutes=rng.randint(0, 55))
        runs.append(_run(scale.production_runs + index, asset, component, started, rng))
    return runs


def _run(
    index: int,
    asset: Any,
    component: Any,
    started: datetime,
    rng: random.Random,
) -> dict[str, Any]:
    declared = rng.randint(20, 400)
    return {
        "run_id": f"RUN-{index + 1:06d}",
        "asset_id": asset.asset_tag,
        "part_name": component.part_name,
        "supplier": component.supplier,
        "started_at": started.isoformat(),
        "ended_at": (started + timedelta(minutes=rng.randint(5, 240))).isoformat(),
        "declared_cycles": declared,
        "device": rng.choice(_DEVICES),
        "operator": asset.operator,
    }


def _moment(rng: random.Random) -> datetime:
    return datetime.combine(WINDOW_START, time(0)) + timedelta(
        days=rng.randint(0, WINDOW_DAYS - 1),
        minutes=rng.randint(0, 24 * 60 - 1),
    )


def _line_of(world: World, machine_id: str) -> str:
    return next(machine.line for machine in world.machines if machine.machine_id == machine_id)
