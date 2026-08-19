"""Live counts behind the ontology. Queries only."""

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.db.warehouse.graph_tables import links, objects


class OntologyRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def object_counts(self) -> dict[str, int]:
        rows = self._session.execute(
            select(objects.c.type, func.count()).group_by(objects.c.type)
        ).all()
        return dict(rows)  # type: ignore[arg-type]

    def link_counts(self) -> dict[str, int]:
        rows = self._session.execute(
            select(links.c.rel_type, func.count()).group_by(links.c.rel_type)
        ).all()
        return dict(rows)  # type: ignore[arg-type]

    def answer(self, sql: str) -> float | None:
        """Run a competency question's own query.

        The SQL comes from `app.domains.ontology.questions`, a module constant, and never
        from a request. There is no endpoint anywhere that accepts SQL — on DuckDB that
        would be arbitrary filesystem access as the API process.
        """
        value = self._session.execute(text(sql)).scalar()
        return float(value) if value is not None else None
