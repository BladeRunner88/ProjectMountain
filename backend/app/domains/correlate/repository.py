"""Everything, from every source, inside a time window. Queries only."""

from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.warehouse.clean_tables import batches, cycles, runs, work_orders


class WindowRepository:
    """Shared by /correlate and by a finding's own surrounding context."""

    def __init__(self, session: Session) -> None:
        self._session = session

    def batches_between(self, start: datetime, end: datetime) -> list[dict[str, Any]]:
        stmt = (
            select(
                batches.c.batch_id,
                batches.c.inspection_station,
                batches.c.disposition,
                batches.c.quantity_kg,
                batches.c.plant,
                batches.c.occurred_at_utc,
            )
            .where(batches.c.occurred_at_utc >= start)
            .where(batches.c.occurred_at_utc < end)
            .order_by(batches.c.occurred_at_utc)
        )
        return [
            {
                "id": row.batch_id,
                "provider": row.inspection_station,
                "type": row.disposition,
                "status": row.disposition,
                "amount_usd": row.quantity_kg,
                "occurred_at": str(row.occurred_at_utc),
            }
            for row in self._session.execute(stmt)
        ]

    def cycles_between(self, start: datetime, end: datetime) -> list[dict[str, Any]]:
        stmt = (
            select(
                cycles.c.cycle_id,
                cycles.c.supplier_canonical,
                cycles.c.outcome,
                cycles.c.occurred_at_utc,
            )
            .where(cycles.c.occurred_at_utc >= start)
            .where(cycles.c.occurred_at_utc < end)
            .order_by(cycles.c.occurred_at_utc)
        )
        return [
            {
                "id": row.cycle_id,
                "provider": row.supplier_canonical,
                "outcome": row.outcome,
                "occurred_at": str(row.occurred_at_utc),
            }
            for row in self._session.execute(stmt)
        ]

    def runs_between(self, start: datetime, end: datetime) -> list[dict[str, Any]]:
        stmt = (
            select(
                runs.c.run_id,
                runs.c.part_name,
                runs.c.supplier_canonical,
                runs.c.started_at_utc,
            )
            .where(runs.c.started_at_utc >= start)
            .where(runs.c.started_at_utc < end)
            .order_by(runs.c.started_at_utc)
        )
        return [
            {
                "id": row.run_id,
                "game": row.part_name,
                "provider": row.supplier_canonical,
                "started_at": str(row.started_at_utc),
            }
            for row in self._session.execute(stmt)
        ]

    def work_orders_between(self, start: datetime, end: datetime) -> list[dict[str, Any]]:
        stmt = (
            select(
                work_orders.c.work_order,
                work_orders.c.wo_type,
                work_orders.c.scheduled_at_utc,
            )
            .where(work_orders.c.scheduled_at_utc >= start)
            .where(work_orders.c.scheduled_at_utc < end)
            .order_by(work_orders.c.scheduled_at_utc)
        )
        return [
            {
                "campaign": row.work_order,
                "channel": row.wo_type,
                "sent_at": str(row.scheduled_at_utc),
            }
            for row in self._session.execute(stmt)
        ]
