"""Part B — the gaming operator ontology. SCHEMA only.

Two strictly separate levels: this file is the blueprint (types,
properties, relationships). Instances are resolved records in DuckDB,
built by resolve.py / findings.py from the six vendor sources.

Nothing here is per-row logic — ingestion, resolution and the API read
this schema generically.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class ObjectType:
    name: str
    properties: tuple[str, ...]


@dataclass(frozen=True)
class RelationshipType:
    name: str
    source: str
    target: str


OBJECT_TYPES: dict[str, ObjectType] = {
    t.name: t
    for t in [
        ObjectType("Player", ("name", "market", "registered_at")),
        ObjectType("Account", ("account_ref", "market", "currency", "status")),
        ObjectType("GameProvider", ("name",)),
        ObjectType("Game", ("title", "rtp")),
        ObjectType("PaymentProvider", ("name",)),
        ObjectType("Transaction", ("type", "amount", "currency", "status", "occurred_at")),
        ObjectType("Campaign", ("name", "segment", "channel")),
        ObjectType("AffiliateSource", ("name",)),
        ObjectType("Market", ("name", "currency")),
    ]
}

RELATIONSHIP_TYPES: dict[str, RelationshipType] = {
    t.name: t
    for t in [
        RelationshipType("BELONGS_TO", source="Account", target="Player"),
        RelationshipType("PLAYED", source="Account", target="Game"),
        RelationshipType("SUPPLIED_BY", source="Game", target="GameProvider"),
        RelationshipType("PROCESSED_BY", source="Transaction", target="PaymentProvider"),
        RelationshipType("MADE_BY", source="Transaction", target="Account"),
        RelationshipType("TARGETED", source="Campaign", target="Player"),
        RelationshipType("REFERRED", source="AffiliateSource", target="Account"),
        RelationshipType("OPERATES_IN", source="Account", target="Market"),
    ]
}


def describe() -> str:
    lines = ["OBJECT TYPES", "-" * 12]
    for t in OBJECT_TYPES.values():
        lines.append(f"  {t.name:<16} {{ id, {', '.join(t.properties)} }}")
    lines += ["", "RELATIONSHIP TYPES", "-" * 19]
    for r in RELATIONSHIP_TYPES.values():
        lines.append(f"  {r.name:<14} {r.source} -> {r.target}")
    return "\n".join(lines)


if __name__ == "__main__":
    print(describe())
