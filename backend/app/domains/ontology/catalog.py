"""The manufacturing ontology — schema only.

Two strictly separate levels. This file is the blueprint: what kinds of thing exist, what
properties each carries, and which relationships are allowed between them. Instances are
resolved rows in DuckDB, produced by the pipeline.

Nothing here is per-row logic. Ingestion, resolution and the API all read this schema
generically, which is why adding an object type does not mean touching a query.

Two entries deserve their reason stated, because they look redundant and are not:

  * `Asset` vs `Machine`. An Asset is one *register row* about a piece of equipment, as a
    single vendor system happens to record it. A Machine is the real machine those rows
    turn out to describe. Three systems disagreeing about one machine is the problem this
    product exists to solve, so both levels are modelled.
  * No property anywhere is called `type`. The pre-refactor gaming ontology gave
    Transaction a `type` property, and flattening it into the API response overwrote the
    object's own ontology type on 18,000 of 18,744 rows. Avoiding the name is the fix.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class ObjectType:
    """A kind of thing. `properties` is the exact set carried on the wire, `id` implicit."""

    name: str
    properties: tuple[str, ...]


@dataclass(frozen=True)
class RelationshipType:
    """A directed, typed edge between two object types."""

    name: str
    source: str
    target: str


OBJECT_TYPES: dict[str, ObjectType] = {
    t.name: t
    for t in [
        ObjectType("Plant", ("name", "country", "timezone", "unit_system")),
        ObjectType("ProductionLine", ("name", "plant", "product_family", "takt_seconds")),
        ObjectType("Machine", ("name", "plant", "commissioned_at")),
        ObjectType("Asset", ("asset_tag", "plant", "unit_system", "status")),
        ObjectType("Sensor", ("channel", "unit", "sample_rate_hz", "status")),
        ObjectType("Operator", ("name", "plant", "role", "shift")),
        ObjectType("Supplier", ("name",)),
        ObjectType("Component", ("part_name", "part_number", "nominal_cycle_seconds")),
        ObjectType("InspectionStation", ("name",)),
        ObjectType("Batch", ("disposition", "quantity", "unit", "status", "occurred_at")),
        ObjectType("WorkOrder", ("code", "wo_type", "priority")),
        ObjectType("MaintenanceVendor", ("name",)),
    ]
}

RELATIONSHIP_TYPES: dict[str, RelationshipType] = {
    t.name: t
    for t in [
        RelationshipType("REGISTERED_AS", source="Asset", target="Machine"),
        RelationshipType("PRODUCED", source="Asset", target="Component"),
        RelationshipType("SUPPLIED_BY", source="Component", target="Supplier"),
        RelationshipType("INSPECTED_BY", source="Batch", target="InspectionStation"),
        RelationshipType("PRODUCED_ON", source="Batch", target="Asset"),
        RelationshipType("SCHEDULED_FOR", source="WorkOrder", target="Machine"),
        RelationshipType("SERVICED", source="MaintenanceVendor", target="Asset"),
        RelationshipType("LOCATED_IN", source="Asset", target="Plant"),
        RelationshipType("PART_OF", source="ProductionLine", target="Plant"),
        RelationshipType("INSTALLED_ON", source="Machine", target="ProductionLine"),
        RelationshipType("MOUNTED_ON", source="Sensor", target="Machine"),
        RelationshipType("OPERATED_BY", source="Asset", target="Operator"),
    ]
}


def describe() -> str:
    """Human-readable dump of the schema, for a terminal or a docs page."""
    lines = ["OBJECT TYPES", "-" * 12]
    for object_type in OBJECT_TYPES.values():
        lines.append(f"  {object_type.name:<18} {{ id, {', '.join(object_type.properties)} }}")
    lines += ["", "RELATIONSHIP TYPES", "-" * 19]
    for relationship in RELATIONSHIP_TYPES.values():
        lines.append(f"  {relationship.name:<15} {relationship.source} -> {relationship.target}")
    return "\n".join(lines)
