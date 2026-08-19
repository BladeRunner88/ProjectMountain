"""Search inputs. Queries only."""

from typing import Any

from sqlalchemy import Row, func, select, union_all
from sqlalchemy.orm import Session

from app.db.warehouse.graph_tables import links, objects, resolution_map


class SearchRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def all_objects(self) -> list[Row[tuple[str, str, Any]]]:
        stmt = select(objects.c.id, objects.c.type, objects.c.properties_json)
        return list(self._session.execute(stmt).all())

    def connection_counts(self) -> dict[str, int]:
        """Degree per node: an edge counts for both endpoints, so both sides are unioned."""
        endpoints = union_all(
            select(links.c.source_id.label("id")),
            select(links.c.target_id.label("id")),
        ).subquery()
        stmt = select(endpoints.c.id, func.count()).group_by(endpoints.c.id)
        return dict(self._session.execute(stmt).all())  # type: ignore[arg-type]

    def aliases_by_object(self) -> dict[str, set[str]]:
        """Every raw source spelling that resolved into each canonical object."""
        stmt = select(resolution_map.c.canonical_id, resolution_map.c.raw_name)
        aliases: dict[str, set[str]] = {}
        for canonical_id, raw_name in self._session.execute(stmt):
            aliases.setdefault(canonical_id, set()).add(raw_name)
        return aliases
