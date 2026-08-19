"""Two things happening near each other, reported as exactly that."""

from typing import Any

from sqlalchemy import Connection, text

from app.pipeline.findings.model import Finding
from app.pipeline.findings.thresholds import (
    CO_OCCURRENCE_WINDOW_MINUTES,
    PEAK_BUCKET_MINUTES,
)
from app.pipeline.manifest import MAINTENANCE_FILE, MES_FILE


def co_occurrence(connection: Connection, anomalies: list[Finding]) -> list[Finding]:
    """Work orders raised close to a production spike.

    Reported as co-occurrence and nothing more. The two happened near each other; whether
    one caused the other is not something this data can answer, and saying so would be the
    single easiest way to mislead a reader.
    """
    spikes = [
        finding
        for finding in anomalies
        if finding.computed.get("measure") == "production runs"
        and finding.computed.get("deviation_std", 0) > 0
    ]

    findings = []
    for spike in spikes:
        peak = connection.execute(
            text(
                "SELECT time_bucket(INTERVAL '15 minutes', started_at_utc) AS bucket, "
                "count(*) AS n "
                "FROM clean.runs WHERE started_at_utc >= :start AND started_at_utc <= :end "
                "GROUP BY 1 ORDER BY n DESC LIMIT 1"
            ),
            {"start": spike.window_start, "end": spike.window_end},
        ).one_or_none()
        if peak is None:
            continue

        nearest = connection.execute(
            text(
                "SELECT work_order, scheduled_at_utc, "
                "       abs(date_diff('minute', scheduled_at_utc, :peak)) AS gap "
                "FROM clean.work_orders ORDER BY gap LIMIT 1"
            ),
            {"peak": peak.bucket},
        ).one_or_none()
        if nearest is None or nearest.gap > CO_OCCURRENCE_WINDOW_MINUTES:
            continue

        findings.append(_co_occurrence_finding(spike, peak, nearest))
    return findings


def _co_occurrence_finding(spike: Finding, peak: Any, nearest: Any) -> Finding:
    return Finding(
        finding_type="CO_OCCURRENCE",
        title=f"Work orders preceded a run spike by {nearest.gap} minutes",
        description=(
            f"{peak.n} production runs started in the {PEAK_BUCKET_MINUTES}-minute bucket "
            f"beginning {peak.bucket}. The nearest scheduled work order, {nearest.work_order}, "
            f"is {nearest.gap} minutes away. These co-occurred; no causal link is claimed."
        ),
        sources=[MES_FILE, MAINTENANCE_FILE],
        computed={
            "gap_minutes": int(nearest.gap),
            "run_count": peak.n,
            "deviation_std": spike.computed["deviation_std"],
        },
        window_start=spike.window_start,
        window_end=spike.window_end,
        entities=[{"type": "WorkOrder", "name": str(nearest.work_order)}],
        evidence={
            "peak_bucket": str(peak.bucket),
            "work_order_scheduled_at": str(nearest.scheduled_at_utc),
        },
    )
