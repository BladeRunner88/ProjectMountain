"""Accumulates objects, links and provenance before they are written.

Objects are projected through the ontology on the way in, so `properties_json` carries
exactly the property set the schema declares and nothing a particular feed happened to
include. That is what lets the API read any object type without knowing about it.
"""

import json
from dataclasses import dataclass, field
from typing import Any

from app.domains.ontology.catalog import OBJECT_TYPES


@dataclass
class GraphBuilder:
    objects: dict[str, tuple[str, dict[str, Any]]] = field(default_factory=dict)
    links: list[tuple[str, str, str]] = field(default_factory=list)
    resolution: list[tuple[str, str, str, str, str]] = field(default_factory=list)
    stats: dict[str, int] = field(default_factory=dict)

    def add_object(self, object_id: str, object_type: str, properties: dict[str, Any]) -> str:
        """Record an object, clipped to its ontology property set."""
        declared = OBJECT_TYPES[object_type].properties
        self.objects[object_id] = (
            object_type,
            {name: properties.get(name) for name in declared},
        )
        return object_id

    def add_link(self, source_id: str, target_id: str, rel_type: str) -> None:
        self.links.append((source_id, target_id, rel_type))

    def add_resolution(
        self, object_type: str, source_table: str, source_id: str, raw_name: str, canonical_id: str
    ) -> None:
        """Which raw row became which canonical object — the evidence behind a merge."""
        self.resolution.append((object_type, source_table, source_id, raw_name, canonical_id))

    def count(self, key: str, amount: int = 1) -> None:
        self.stats[key] = self.stats.get(key, 0) + amount

    def object_rows(self) -> list[tuple[str, str, str]]:
        return [
            (object_id, object_type, json.dumps(properties))
            for object_id, (object_type, properties) in self.objects.items()
        ]
