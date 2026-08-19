"""Graph assembly rules."""

from typing import Any

from app.domains.graph.display import display_name
from app.domains.graph.exceptions import ObjectNotFoundError
from app.domains.graph.repository import GraphRepository
from app.domains.graph.schemas import (
    Connection,
    FullGraph,
    GraphLink,
    GraphObject,
    ObjectDetail,
    ResolvedFrom,
)

_OUT = "out"
_IN = "in"


class GraphService:
    def __init__(self, repository: GraphRepository) -> None:
        self._repository = repository

    def list_objects(self, object_type: str | None) -> list[GraphObject]:
        return [
            GraphObject.model_validate({"id": row.id, "type": row.type, **row.properties_json})
            for row in self._repository.list_objects(object_type)
        ]

    def full_graph(self, object_type: str | None) -> FullGraph:
        objects = self.list_objects(object_type)
        surviving = {obj.id for obj in objects}

        # When filtering by type, drop links whose endpoints did not survive the filter —
        # a dangling edge would point at a node the client never received.
        links = [
            GraphLink(source=source, target=target, rel_type=rel_type)
            for source, target, rel_type in self._repository.list_links()
            if source in surviving and target in surviving
        ]
        return FullGraph(objects=objects, links=links)

    def get_object(self, object_id: str) -> ObjectDetail:
        row = self._repository.get_object(object_id)
        if row is None:
            raise ObjectNotFoundError(object_id)

        properties: dict[str, Any] = row.properties_json
        return ObjectDetail(
            id=row.id,
            type=row.type,
            properties=properties,
            connections=self._connections(object_id),
            resolved_from=[
                ResolvedFrom(source_table=table, source_id=source_id, raw_name=raw_name)
                for table, source_id, raw_name in self._repository.resolved_from(object_id)
            ],
            # Placeholder provenance: every property is attributed to the object itself.
            # It is not real per-field lineage and it is not defensible — the resolver
            # does not yet record which source row supplied which field. Kept byte-stable
            # here so the port is a pure refactor; the manufacturing resolver replaces it
            # with genuine field -> (source_file, source_id) provenance.
            provenance=dict.fromkeys(properties, object_id),
        )

    def _connections(self, object_id: str) -> list[Connection]:
        outgoing = self._repository.outgoing(object_id)
        incoming = self._repository.incoming(object_id)

        neighbour_ids = {row[0] for row in outgoing} | {row[0] for row in incoming}
        labels = self._repository.neighbour_labels(neighbour_ids)

        def describe(direction: str, other_id: str, rel_type: str) -> Connection:
            known = labels.get(other_id)
            if known is None:
                # An edge pointing at an id with no object row. Surface it rather than
                # dropping it: a missing endpoint is a resolution defect worth seeing.
                return Connection(
                    direction=direction, rel_type=rel_type, id=other_id, type=None, name=other_id
                )
            object_type, properties = known
            return Connection(
                direction=direction,
                rel_type=rel_type,
                id=other_id,
                type=object_type,
                name=display_name(properties, other_id),
            )

        return [describe(_OUT, target_id, rel) for target_id, rel in outgoing] + [
            describe(_IN, source_id, rel) for source_id, rel in incoming
        ]
