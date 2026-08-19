"""Graph object and link queries. Queries only."""

from typing import Any

from sqlalchemy import Row, Select, select
from sqlalchemy.orm import Session

from app.db.warehouse.graph_tables import links, objects, resolution_map


class GraphRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def list_objects(self, object_type: str | None) -> list[Row[tuple[str, str, Any]]]:
        stmt: Select[Any] = select(objects.c.id, objects.c.type, objects.c.properties_json)
        if object_type:
            stmt = stmt.where(objects.c.type == object_type)
        return list(self._session.execute(stmt).all())

    def get_object(self, object_id: str) -> Row[tuple[str, str, Any]] | None:
        stmt = select(objects.c.id, objects.c.type, objects.c.properties_json).where(
            objects.c.id == object_id
        )
        return self._session.execute(stmt).one_or_none()

    def get_object_type(self, object_id: str) -> str | None:
        return self._session.scalar(select(objects.c.type).where(objects.c.id == object_id))

    def list_links(self) -> list[Row[tuple[str, str, str]]]:
        stmt = select(links.c.source_id, links.c.target_id, links.c.rel_type)
        return list(self._session.execute(stmt).all())

    def outgoing(self, object_id: str) -> list[Row[tuple[str, str]]]:
        stmt = select(links.c.target_id, links.c.rel_type).where(links.c.source_id == object_id)
        return list(self._session.execute(stmt).all())

    def incoming(self, object_id: str) -> list[Row[tuple[str, str]]]:
        stmt = select(links.c.source_id, links.c.rel_type).where(links.c.target_id == object_id)
        return list(self._session.execute(stmt).all())

    def neighbour_labels(self, object_ids: set[str]) -> dict[str, tuple[str, dict[str, Any]]]:
        """Type and properties for a set of ids, in one query rather than one per neighbour."""
        if not object_ids:
            return {}
        stmt = select(objects.c.id, objects.c.type, objects.c.properties_json).where(
            objects.c.id.in_(object_ids)
        )
        return {row.id: (row.type, row.properties_json) for row in self._session.execute(stmt)}

    def resolved_from(self, canonical_id: str) -> list[Row[tuple[str, str, str]]]:
        stmt = (
            select(
                resolution_map.c.source_table,
                resolution_map.c.source_id,
                resolution_map.c.raw_name,
            )
            .where(resolution_map.c.canonical_id == canonical_id)
            .order_by(resolution_map.c.source_table, resolution_map.c.source_id)
        )
        return list(self._session.execute(stmt).all())
