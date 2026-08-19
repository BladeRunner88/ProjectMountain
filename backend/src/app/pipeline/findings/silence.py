"""Telemetry stopping for far longer than that supplier's own normal."""

from collections import defaultdict
from datetime import datetime, timedelta

from sqlalchemy import Connection, text

from app.pipeline.findings.model import Finding
from app.pipeline.findings.statistics import median_gap_minutes
from app.pipeline.findings.thresholds import (
    SILENCE_GAP_MULTIPLE,
    SILENCE_MIN_MINUTES,
    SILENCE_MIN_OBSERVATIONS,
)
from app.pipeline.manifest import SCADA_FILE


def silent_source(connection: Connection) -> list[Finding]:
    """A supplier's telemetry stopping for far longer than that supplier's own normal."""
    rows = connection.execute(
        text(
            "SELECT supplier_canonical AS supplier, occurred_at_utc "
            "FROM clean.cycles WHERE supplier_canonical <> '' ORDER BY 1, 2"
        )
    ).all()

    by_supplier: dict[str, list[datetime]] = defaultdict(list)
    for row in rows:
        by_supplier[row.supplier].append(row.occurred_at_utc)

    findings = []
    for supplier, moments in by_supplier.items():
        finding = _silence_for(supplier, moments)
        if finding is not None:
            findings.append(finding)
    return findings


def _silence_for(supplier: str, moments: list[datetime]) -> Finding | None:
    if len(moments) < SILENCE_MIN_OBSERVATIONS:
        return None

    minutes = [moment.timestamp() / 60 for moment in moments]
    typical = median_gap_minutes(minutes)
    if not typical:
        return None

    widest, at = 0.0, moments[0]
    for index in range(1, len(moments)):
        gap = minutes[index] - minutes[index - 1]
        if gap > widest:
            widest, at = gap, moments[index - 1]

    if widest < typical * SILENCE_GAP_MULTIPLE or widest < SILENCE_MIN_MINUTES:
        return None

    return Finding(
        finding_type="SILENT_SOURCE",
        title=f"{supplier} telemetry silent for {widest / 60:.1f} hours",
        description=(
            f"The historian recorded no cycles for {supplier} parts for "
            f"{widest:.0f} minutes, against a typical gap of {typical:.1f} minutes."
        ),
        sources=[SCADA_FILE],
        computed={
            "gap_minutes": round(widest, 1),
            "expected_gap_minutes": round(typical, 1),
            "gap_multiple": round(widest / typical, 1),
        },
        window_start=at,
        window_end=at + timedelta(minutes=widest),
        entities=[{"type": "Supplier", "name": supplier}],
        evidence={"silence_started_at": str(at)},
    )
