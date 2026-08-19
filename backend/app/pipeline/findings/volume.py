"""A day standing well outside the normal daily volume for a measure."""

from datetime import datetime
from typing import Any

from sqlalchemy import Connection, text

from app.pipeline.findings.model import Finding
from app.pipeline.findings.statistics import z_score
from app.pipeline.findings.thresholds import VOLUME_ANOMALY_Z
from app.pipeline.manifest import MES_FILE, QC_LAB_FILE, SCADA_FILE


def volume_anomaly(connection: Connection) -> list[Finding]:
    """A day that stands well outside the normal daily volume for that measure."""
    measures = {
        "production runs": ("clean.runs", "started_at_utc", MES_FILE),
        "machine cycles": ("clean.cycles", "occurred_at_utc", SCADA_FILE),
        "inspected batches": ("clean.batches", "occurred_at_utc", QC_LAB_FILE),
    }

    findings = []
    for label, (table, column, source_file) in measures.items():
        # Table and column come from the literal `measures` map above, never from input.
        statement = (
            f"SELECT CAST({column} AS DATE) AS day, count(*) AS n "
            f"FROM {table} GROUP BY 1 ORDER BY 1"
        )
        rows = connection.execute(text(statement)).all()
        counts = [float(row.n) for row in rows]
        for row in rows:
            score = z_score(float(row.n), counts)
            if score is None or abs(score) < VOLUME_ANOMALY_Z:
                continue
            findings.append(_volume_finding(label, source_file, row, score, counts))
    return findings


def _volume_finding(
    label: str, source_file: str, row: Any, score: float, counts: list[float]
) -> Finding:
    average = sum(counts) / len(counts)
    direction = "above" if score > 0 else "below"
    return Finding(
        finding_type="VOLUME_ANOMALY",
        title=(
            f"{label.capitalize()} on {row.day} were "
            f"{abs(score):.1f} standard deviations {direction} normal"
        ),
        description=(
            f"{row.n} {label} were recorded on {row.day}, against a daily average of {average:.0f}."
        ),
        sources=[source_file],
        computed={
            "count": row.n,
            "mean": round(average, 2),
            "deviation_std": round(score, 2),
            "measure": label,
        },
        window_start=datetime.combine(row.day, datetime.min.time()),
        window_end=datetime.combine(row.day, datetime.max.time()),
        entities=[{"type": "Measure", "name": label}],
        evidence={"day": str(row.day), "count": row.n},
    )
