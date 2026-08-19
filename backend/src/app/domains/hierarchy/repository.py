"""The structural graph. Queries only."""

from typing import Any

from sqlalchemy import Row, select
from sqlalchemy.orm import Session

from app.db.warehouse.graph_tables import links, objects

STRUCTURAL_RELATIONSHIPS = ("PART_OF", "INSTALLED_ON", "MOUNTED_ON")
STRUCTURAL_TYPES = ("Plant", "ProductionLine", "Machine", "Sensor")


class HierarchyRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def structural_objects(self, *, limit: int) -> list[Row[tuple[str, str, Any]]]:
        stmt = (
            select(objects.c.id, objects.c.type, objects.c.properties_json)
            .where(objects.c.type.in_(STRUCTURAL_TYPES))
            .order_by(objects.c.type, objects.c.id)
            .limit(limit)
        )
        return list(self._session.execute(stmt).all())

    def structural_links(self) -> list[Row[tuple[str, str, str]]]:
        stmt = select(links.c.source_id, links.c.target_id, links.c.rel_type).where(
            links.c.rel_type.in_(STRUCTURAL_RELATIONSHIPS)
        )
        return list(self._session.execute(stmt).all())
