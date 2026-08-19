"""Metric aggregation. Queries only."""

from typing import Any

from sqlalchemy import Row, Table, func, select
from sqlalchemy.orm import Session

from app.db.warehouse.clean_tables import batches, cycles, runs

# The two count metrics and the table each is measured over.
COUNTABLE_TABLES: dict[str, Table] = {"runs": runs, "cycles": cycles}


class MetricRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def batch_totals(
        self, *, disposition: str, plant: str | None
    ) -> list[Row[tuple[str, str, int, float, float]]]:
        """Per station and recorded unit: how many, how much as recorded, how much in kg.

        Both totals are reported because the conversion is the thing a reader most wants
        to audit — a single reconciled number hides which unit it came from.
        """
        stmt = (
            select(
                batches.c.inspection_station,
                batches.c.unit_original,
                func.count(),
                func.sum(batches.c.quantity_original),
                func.sum(batches.c.quantity_kg),
            )
            .where(batches.c.disposition == disposition)
            .group_by(batches.c.inspection_station, batches.c.unit_original)
            .order_by(batches.c.inspection_station, batches.c.unit_original)
        )
        if plant:
            stmt = stmt.where(batches.c.plant == plant)
        return list(self._session.execute(stmt).all())

    def counts_by_source(self, table: Table) -> list[Row[Any]]:
        stmt = select(table.c.source_file, func.count()).group_by(table.c.source_file)
        return list(self._session.execute(stmt).all())
