"""Objects that come from the world's fixed vocabulary rather than from a matched row.

Plants, lines, suppliers, inspection stations and maintenance vendors are named the same
way by every feed. They still become graph objects, because the things that *are* matched
need something to point at.
"""

from typing import Any

from app.pipeline.resolve.graph_builder import GraphBuilder
from app.pipeline.world import (
    INLINE_STATION,
    LAB_STATION,
    LINE_NAMES,
    PLANTS,
    PRODUCT_FAMILIES,
)

PLANT_TIMEZONES: dict[str, str] = {
    "Stuttgart": "Europe/Berlin",
    "Brno": "Europe/Prague",
    "Monterrey": "America/Monterrey",
    "Coventry": "Europe/London",
    "Gothenburg": "Europe/Stockholm",
    "Windsor": "America/Toronto",
}

# Nominal takt per line, seconds. Fixed rather than sampled: it is a design parameter of
# the line, not an observation.
_BASE_TAKT_SECONDS = 42.0
_TAKT_STEP_SECONDS = 3.5


def plant_ids(builder: GraphBuilder) -> dict[str, str]:
    ids = {}
    for index, plant in enumerate(PLANTS):
        object_id = f"plant_{index + 1:02d}"
        builder.add_object(
            object_id,
            "Plant",
            {
                "name": plant.name,
                "country": plant.country,
                "timezone": PLANT_TIMEZONES.get(plant.name, "UTC"),
                "unit_system": plant.unit_system,
            },
        )
        ids[plant.name] = object_id
    return ids


def line_ids(builder: GraphBuilder, plants: dict[str, str]) -> dict[str, str]:
    """One line per name, assigned round-robin to plants — and linked to its plant."""
    ids = {}
    plant_names = [plant.name for plant in PLANTS]
    for index, line in enumerate(LINE_NAMES):
        object_id = f"line_{index + 1:03d}"
        plant_name = plant_names[index % len(plant_names)]
        builder.add_object(
            object_id,
            "ProductionLine",
            {
                "name": line,
                "plant": plant_name,
                "product_family": PRODUCT_FAMILIES[index % len(PRODUCT_FAMILIES)],
                "takt_seconds": round(_BASE_TAKT_SECONDS + index * _TAKT_STEP_SECONDS, 1),
            },
        )
        builder.add_link(object_id, plants[plant_name], "PART_OF")
        ids[line] = object_id
    return ids


def station_ids(builder: GraphBuilder) -> dict[str, str]:
    ids = {}
    for index, station in enumerate((INLINE_STATION, LAB_STATION)):
        object_id = f"station_{index + 1:02d}"
        builder.add_object(object_id, "InspectionStation", {"name": station})
        ids[station] = object_id
    return ids


def vendor_ids(builder: GraphBuilder, vendor_names: list[str]) -> dict[str, str]:
    ids = {}
    for index, vendor in enumerate(sorted(set(vendor_names))):
        object_id = f"vendor_{index + 1:02d}"
        builder.add_object(object_id, "MaintenanceVendor", {"name": vendor})
        ids[vendor] = object_id
    return ids


def operator_ids(builder: GraphBuilder, rows: list[Any]) -> dict[str, str]:
    """Operators are named by the MES asset register and nowhere else."""
    ids = {}
    names = sorted({str(row.operator) for row in rows if row.operator})
    for index, name in enumerate(names):
        object_id = f"operator_{index + 1:04d}"
        builder.add_object(
            object_id,
            "Operator",
            {"name": name, "plant": None, "role": None, "shift": None},
        )
        ids[name] = object_id
    return ids
