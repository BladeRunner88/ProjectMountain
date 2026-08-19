"""The OT historian export: part catalogue and machine cycles.

XML, naive timestamps with no offset at all, and asset tags masked to their last four
characters. Two seeded gaps live here, and they are deliberately different in kind:

  * a **silence**: one supplier's sensors stop reporting for seven hours, then resume;
  * a **divergence**: one supplier's cycles are missing for a whole day while the MES
    still shows production runs on those machines. Nothing is broken in either feed on
    its own — only comparing them reveals it.
"""

import random
from datetime import datetime, time, timedelta
from pathlib import Path
from typing import Any
from xml.etree import ElementTree

from app.pipeline.generate.messiness import mask_tag
from app.pipeline.scale import Scale
from app.pipeline.world import QUIET_SUPPLIER, WINDOW_DAYS, WINDOW_START, World

SILENCE_DAY_OFFSET = 30
SILENCE_START_HOUR = 2
SILENCE_HOURS = 7

DIVERGENCE_SUPPLIER = "SKF"
DIVERGENCE_DAY_OFFSET = 45

_OUTCOMES = ("in_tolerance", "in_tolerance", "in_tolerance", "out_of_tolerance", "aborted")
_HISTORIAN_TIME_FORMAT = "%Y-%m-%d %H:%M:%S"

# The channels the historian records per machine. Unit and nominal band come from the
# historian's own tag configuration, which is the only place they are written down.
CHANNELS: tuple[tuple[str, str, float, float, float], ...] = (
    ("spindle_temp_c", "degC", 62.0, 8.0, 1.2),
    ("vibration_mm_s", "mm/s", 2.4, 0.9, 0.35),
    ("cycle_time_s", "s", 11.5, 1.8, 0.6),
    ("pressure_bar", "bar", 6.2, 0.7, 0.2),
    # Return-line pressure. A hydraulic circuit has both, and a panel that
    # shows a supply/return pair needs the plant to actually measure both.
    ("return_pressure_bar", "bar", 1.8, 0.35, 0.12),
    ("oee_pct", "%", 78.0, 9.0, 2.5),
)
_SAMPLE_RATES = (0.2, 0.5, 1.0, 2.0)


def generate(world: World, scale: Scale, rng: random.Random, output: Path) -> dict[str, Any]:
    """Write scada_historian.xml and report which windows were deliberately left empty."""
    root = ElementTree.Element("historian")
    _write_parts(root, world)
    channels = _write_channels(root, world, rng)
    written = _write_cycles(root, world, scale, rng)

    ElementTree.indent(root, space=" ")
    ElementTree.ElementTree(root).write(output, encoding="utf-8", xml_declaration=True)

    return {
        "parts": len(world.components),
        "channels": channels,
        "cycles": written,
        "silence_supplier": QUIET_SUPPLIER,
        "divergence_supplier": DIVERGENCE_SUPPLIER,
    }


def _write_parts(root: ElementTree.Element, world: World) -> None:
    catalogue = ElementTree.SubElement(root, "parts")
    spellings = {supplier.name: supplier.historian_spelling for supplier in world.suppliers}
    for component in world.components:
        part = ElementTree.SubElement(catalogue, "part")
        ElementTree.SubElement(part, "part_number").text = component.part_number
        ElementTree.SubElement(part, "part_name").text = component.part_name
        # The historian's own spelling of the supplier, which the MES does not share.
        ElementTree.SubElement(part, "supplier").text = spellings[component.supplier]
        ElementTree.SubElement(part, "nominal_cycle_seconds").text = str(
            component.nominal_cycle_seconds
        )


def _write_channels(root: ElementTree.Element, world: World, rng: random.Random) -> int:
    """One tag row per machine per channel — the historian's own configuration export.

    Written here rather than derived later because a sensor that no system declares is a
    sensor the product invented, and inventing entities is the one thing this pipeline
    must never do.
    """
    tags = ElementTree.SubElement(root, "channels")
    written = 0
    for asset in world.assets:
        for channel, unit, baseline, amplitude, noise in CHANNELS:
            tag = ElementTree.SubElement(tags, "channel")
            ElementTree.SubElement(tag, "channel_id").text = f"{asset.historian_tag}:{channel}"
            ElementTree.SubElement(tag, "tag").text = mask_tag(asset.asset_tag)
            ElementTree.SubElement(tag, "channel_name").text = channel
            ElementTree.SubElement(tag, "unit").text = unit
            ElementTree.SubElement(tag, "sample_rate_hz").text = str(rng.choice(_SAMPLE_RATES))
            # The seeded shape of this signal, so a reading can be reproduced from a
            # timestamp instead of being stored per tick.
            ElementTree.SubElement(tag, "baseline").text = str(baseline)
            ElementTree.SubElement(tag, "amplitude").text = str(amplitude)
            ElementTree.SubElement(tag, "noise_sigma").text = str(noise)
            ElementTree.SubElement(tag, "status").text = (
                "degraded" if asset.status == "maintenance" else "healthy"
            )
            written += 1
    return written


def _write_cycles(root: ElementTree.Element, world: World, scale: Scale, rng: random.Random) -> int:
    cycles = ElementTree.SubElement(root, "cycles")
    silence = _silence_window()
    divergence = _divergence_window()

    written = 0
    for index in range(scale.machine_cycles):
        component = rng.choice(world.components)
        asset = rng.choice(world.assets)
        occurred = _moment(rng)

        if _suppressed(component.supplier, occurred, silence, divergence):
            continue

        _write_cycle(cycles, index, component, asset, occurred, rng)
        written += 1
    return written


def _write_cycle(
    parent: ElementTree.Element,
    index: int,
    component: Any,
    asset: Any,
    occurred: datetime,
    rng: random.Random,
) -> None:
    cycle = ElementTree.SubElement(parent, "cycle")
    ElementTree.SubElement(cycle, "cycle_id").text = f"CYC-{index + 1:06d}"
    ElementTree.SubElement(cycle, "part_id").text = component.part_number
    # Masked: the historian never holds a full asset tag.
    ElementTree.SubElement(cycle, "tag").text = mask_tag(asset.asset_tag)
    # No offset, no zone. Ingest has to assume one, and record that it did.
    ElementTree.SubElement(cycle, "timestamp").text = occurred.strftime(_HISTORIAN_TIME_FORMAT)
    ElementTree.SubElement(cycle, "cycle_seconds").text = str(
        round(component.nominal_cycle_seconds * rng.uniform(0.85, 1.35), 2)
    )
    ElementTree.SubElement(cycle, "scrap_count").text = str(rng.randint(0, 3))
    ElementTree.SubElement(cycle, "outcome").text = rng.choice(_OUTCOMES)


def _suppressed(
    supplier: str,
    occurred: datetime,
    silence: tuple[datetime, datetime],
    divergence: tuple[datetime, datetime],
) -> bool:
    if supplier == QUIET_SUPPLIER and silence[0] <= occurred < silence[1]:
        return True
    return supplier == DIVERGENCE_SUPPLIER and divergence[0] <= occurred < divergence[1]


def _silence_window() -> tuple[datetime, datetime]:
    start = datetime.combine(WINDOW_START, time(SILENCE_START_HOUR)) + timedelta(
        days=SILENCE_DAY_OFFSET
    )
    return start, start + timedelta(hours=SILENCE_HOURS)


def _divergence_window() -> tuple[datetime, datetime]:
    start = datetime.combine(WINDOW_START, time(0)) + timedelta(days=DIVERGENCE_DAY_OFFSET)
    return start, start + timedelta(days=1)


def _moment(rng: random.Random) -> datetime:
    return datetime.combine(WINDOW_START, time(0)) + timedelta(
        days=rng.randint(0, WINDOW_DAYS - 1),
        seconds=rng.randint(0, 24 * 3600 - 1),
    )
