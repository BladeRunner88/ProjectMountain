"""Assembling the structural tree from the resolved graph."""

from collections import defaultdict
from typing import Any

from app.domains.hierarchy.repository import HierarchyRepository
from app.domains.hierarchy.schemas import TIERS, Hierarchy, HierarchyEdge, HierarchyNode

DEFAULT_LIMIT = 2000
MAX_LIMIT = 20000

_TIER_OF_TYPE = {
    "Plant": "plant",
    "ProductionLine": "line",
    "Machine": "machine",
    "Sensor": "sensor",
}
# The edge that carries each tier upwards. All three point child -> parent.
_PARENT_RELATIONSHIP = {"PART_OF", "INSTALLED_ON", "MOUNTED_ON"}

_COUNTRY_PREFIX = "country:"
_NOMINAL = "nominal"
_WATCH = "watch"
_UNKNOWN = "unknown"
# A sensor the historian flagged. Its machine is worth a second look, not an alarm.
_DEGRADED = "degraded"


class HierarchyService:
    def __init__(self, repository: HierarchyRepository) -> None:
        self._repository = repository

    def tree(self, *, root: str | None, tier: str | None, limit: int) -> Hierarchy:
        rows = self._repository.structural_objects(limit=limit)
        truncated = len(rows) >= limit

        parent_of = self._parents()
        nodes = self._nodes(rows, parent_of)
        nodes.update(_countries(nodes))

        if root:
            nodes = _subtree(nodes, root)
        if tier:
            nodes = {node_id: node for node_id, node in nodes.items() if node.tier == tier}

        _count_children(nodes)
        return Hierarchy(
            nodes=sorted(nodes.values(), key=lambda node: (TIERS.index(node.tier), node.id)),
            edges=[
                HierarchyEdge(source=node.parent_id, target=node.id)
                for node in nodes.values()
                if node.parent_id and node.parent_id in nodes
            ],
            tiers=list(TIERS),
            truncated=truncated,
        )

    def _parents(self) -> dict[str, str]:
        return {
            source: target
            for source, target, rel_type in self._repository.structural_links()
            if rel_type in _PARENT_RELATIONSHIP
        }

    def _nodes(self, rows: list[Any], parent_of: dict[str, str]) -> dict[str, HierarchyNode]:
        nodes: dict[str, HierarchyNode] = {}
        for row in rows:
            properties: dict[str, Any] = row.properties_json
            tier = _TIER_OF_TYPE[row.type]
            is_plant = tier == "plant"
            country = properties.get("country") if is_plant else None
            nodes[row.id] = HierarchyNode(
                id=row.id,
                tier=tier,
                label=_label(properties, row.id),
                # A plant's parent is its country, which is derived rather than resolved.
                parent_id=_country_id(country) if is_plant else parent_of.get(row.id),
                plant=properties.get("name") if is_plant else properties.get("plant"),
                country=country,
                status=_status(properties),
                child_count=0,
                descendant_machines=0,
            )
        return nodes


def _label(properties: dict[str, Any], fallback: str) -> str:
    for key in ("name", "channel", "asset_tag"):
        value = properties.get(key)
        if value:
            return str(value)
    return fallback


def _status(properties: dict[str, Any]) -> str:
    """A node's own reported state, never an inferred one."""
    status = properties.get("status")
    if status is None:
        return _UNKNOWN
    return _WATCH if str(status) == _DEGRADED else _NOMINAL


def _country_id(country: str | None) -> str | None:
    return f"{_COUNTRY_PREFIX}{country}" if country else None


def _countries(nodes: dict[str, HierarchyNode]) -> dict[str, HierarchyNode]:
    """Derive a country node per distinct plant country.

    Not an object type: no feed reports a country as a thing, only as a property of a
    site. The id is prefixed so nobody mistakes it for a resolved entity.
    """
    countries: dict[str, HierarchyNode] = {}
    for node in nodes.values():
        country_id = _country_id(node.country) if node.tier == "plant" else None
        if country_id is None or node.country is None:
            continue
        countries.setdefault(
            country_id,
            HierarchyNode(
                id=country_id,
                tier="country",
                label=node.country,
                parent_id=None,
                plant=None,
                country=node.country,
                status=_NOMINAL,
                child_count=0,
                descendant_machines=0,
            ),
        )
    return countries


def _subtree(nodes: dict[str, HierarchyNode], root: str) -> dict[str, HierarchyNode]:
    """Everything at or below `root`."""
    children = defaultdict(list)
    for node in nodes.values():
        if node.parent_id:
            children[node.parent_id].append(node.id)

    kept: dict[str, HierarchyNode] = {}
    frontier = [root]
    while frontier:
        node_id = frontier.pop()
        found = nodes.get(node_id)
        if found is None or node_id in kept:
            continue
        kept[node_id] = found
        frontier.extend(children.get(node_id, []))
    return kept


def _count_children(nodes: dict[str, HierarchyNode]) -> None:
    """Fill in child and descendant-machine counts, in place."""
    children = defaultdict(list)
    for node in nodes.values():
        if node.parent_id and node.parent_id in nodes:
            children[node.parent_id].append(node.id)

    for node_id, node in nodes.items():
        node.child_count = len(children.get(node_id, []))

    for node_id, node in nodes.items():
        node.descendant_machines = _descendant_machines(node_id, nodes, children)


def _descendant_machines(
    node_id: str, nodes: dict[str, HierarchyNode], children: dict[str, list[str]]
) -> int:
    total = 0
    frontier = list(children.get(node_id, []))
    while frontier:
        child_id = frontier.pop()
        child = nodes.get(child_id)
        if child is None:
            continue
        if child.tier == "machine":
            total += 1
        frontier.extend(children.get(child_id, []))
    return total
