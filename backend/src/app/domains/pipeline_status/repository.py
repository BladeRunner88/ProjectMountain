"""Pipeline and resolution statistics. Queries only."""

from sqlalchemy import and_, func, not_, select
from sqlalchemy.orm import Session

from app.db.warehouse.clean_tables import assets, callouts, work_orders
from app.db.warehouse.findings_tables import findings
from app.db.warehouse.meta_tables import pipeline_stats, resolution_stats

_SOURCE_DIVERGENCE = "SOURCE_DIVERGENCE"
_OPEN = "Open"


class PipelineStatsRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def ingestion_stats(self) -> dict[str, int]:
        rows = self._session.execute(select(pipeline_stats.c.key, pipeline_stats.c.value)).all()
        return dict(rows)  # type: ignore[arg-type]  # Row is a 2-tuple here

    def resolution_stats(self) -> dict[str, int]:
        rows = self._session.execute(select(resolution_stats.c.key, resolution_stats.c.value)).all()
        return dict(rows)  # type: ignore[arg-type]  # Row is a 2-tuple here

    def count_open_source_divergences(self) -> int:
        stmt = (
            select(func.count())
            .select_from(findings)
            .where(findings.c.finding_type == _SOURCE_DIVERGENCE)
            .where(findings.c.reviewer_status == _OPEN)
        )
        return self._session.scalar(stmt) or 0

    def count_assets_seen_in_one_source_only(self) -> int:
        """Assets no other feed corroborates.

        An asset the service contractor never visited and the CMMS never raised an order
        against exists in the MES export alone — nothing cross-checks it. The contractor
        side is joined on the numeric core of its reference, because the two systems share
        no id scheme; the CMMS on the historian tag, which they genuinely do share.
        """
        serviced = (
            select(callouts.c.callout_id)
            .where(
                func.regexp_replace(callouts.c.equipment_ref, r"\D", "", "g")
                == func.regexp_replace(assets.c.asset_tag, r"\D", "", "g")
            )
            .exists()
        )
        scheduled = (
            select(work_orders.c.work_order)
            .where(work_orders.c.historian_tag == assets.c.historian_tag)
            .exists()
        )

        stmt = select(func.count()).select_from(assets).where(and_(not_(serviced), not_(scheduled)))
        return self._session.scalar(stmt) or 0
