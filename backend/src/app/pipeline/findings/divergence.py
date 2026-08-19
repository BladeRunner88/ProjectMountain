"""Production one feed recorded and another has no trace of."""

from datetime import datetime

from sqlalchemy import Connection, text

from app.pipeline.findings.model import Finding
from app.pipeline.findings.thresholds import DIVERGENCE_MIN_RUNS
from app.pipeline.manifest import MES_FILE, SCADA_FILE


def source_divergence(connection: Connection) -> list[Finding]:
    """The MES recorded production the historian has no cycles for.

    Neither feed is broken on its own. Only comparing them shows the gap.
    """
    rows = connection.execute(
        text(
            "WITH runs AS ("
            "  SELECT supplier_canonical AS supplier, CAST(started_at_utc AS DATE) AS day,"
            "         count(*) AS run_count"
            "  FROM clean.runs GROUP BY 1, 2 HAVING count(*) >= :minimum"
            "), cycles AS ("
            "  SELECT supplier_canonical AS supplier, CAST(occurred_at_utc AS DATE) AS day,"
            "         count(*) AS cycle_count"
            "  FROM clean.cycles GROUP BY 1, 2"
            ") SELECT r.supplier, r.day, r.run_count "
            "FROM runs r LEFT JOIN cycles c ON c.supplier = r.supplier AND c.day = r.day "
            "WHERE coalesce(c.cycle_count, 0) = 0 ORDER BY r.run_count DESC"
        ),
        {"minimum": DIVERGENCE_MIN_RUNS},
    ).all()

    return [
        Finding(
            finding_type="SOURCE_DIVERGENCE",
            title=f"{row.supplier} parts ran on {row.day} with no historian cycles",
            description=(
                f"The MES recorded {row.run_count} production runs for {row.supplier} parts "
                f"on {row.day}. The historian recorded none."
            ),
            sources=[MES_FILE, SCADA_FILE],
            computed={"mes_runs": row.run_count, "historian_cycles": 0},
            window_start=datetime.combine(row.day, datetime.min.time()),
            window_end=datetime.combine(row.day, datetime.max.time()),
            entities=[{"type": "Supplier", "name": row.supplier}],
            evidence={"day": str(row.day)},
        )
        for row in rows
    ]
