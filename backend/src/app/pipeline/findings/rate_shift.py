"""A plant's release rate falling away from its own baseline."""

from collections import defaultdict
from datetime import datetime
from typing import Any

from sqlalchemy import Connection, text

from app.pipeline.findings.model import Finding
from app.pipeline.findings.statistics import two_proportion_z
from app.pipeline.findings.thresholds import (
    RATE_SHIFT_MIN_SAMPLE,
    RATE_SHIFT_WINDOW_DAYS,
    RATE_SHIFT_Z,
)
from app.pipeline.manifest import QC_LAB_FILE


def rate_shift(connection: Connection) -> list[Finding]:
    """A plant's release rate falling away from its own baseline.

    Compared against the rest of the period rather than a fixed target, so a plant that is
    always at 70% does not register and one that drops from 80% to 20% does.
    """
    rows = connection.execute(
        text(
            "SELECT plant, CAST(occurred_at_utc AS DATE) AS day, "
            "       count(*) FILTER (WHERE disposition = 'pass') AS released, count(*) AS total "
            "FROM clean.batches WHERE inspection_station = 'Metrology lab' "
            "GROUP BY 1, 2 ORDER BY 1, 2"
        )
    ).all()

    by_plant: dict[str, list[Any]] = defaultdict(list)
    for row in rows:
        by_plant[row.plant].append(row)

    findings = []
    for plant, days in by_plant.items():
        worst = _worst_window(days)
        if worst is not None:
            findings.append(_rate_shift_finding(plant, *worst))
    return findings


def _worst_window(days: list[Any]) -> tuple[Any, float, int, int, int, int] | None:
    """The single most negative rolling window for one plant, if it clears the threshold."""
    if len(days) < RATE_SHIFT_WINDOW_DAYS + 10:
        return None

    overall_released = sum(day.released for day in days)
    overall_total = sum(day.total for day in days)

    worst: tuple[Any, float, int, int, int, int] | None = None
    for start in range(len(days) - RATE_SHIFT_WINDOW_DAYS + 1):
        window = days[start : start + RATE_SHIFT_WINDOW_DAYS]
        released = sum(day.released for day in window)
        total = sum(day.total for day in window)
        if total < RATE_SHIFT_MIN_SAMPLE:
            continue

        score = two_proportion_z(
            released, total, overall_released - released, overall_total - total
        )
        if score is None or score > RATE_SHIFT_Z:
            continue
        if worst is None or score < worst[1]:
            worst = (
                window,
                score,
                released,
                total,
                overall_released - released,
                overall_total - total,
            )
    return worst


def _rate_shift_finding(
    plant: str,
    window: list[Any],
    score: float,
    released: int,
    total: int,
    baseline_released: int,
    baseline_total: int,
) -> Finding:
    current_rate = released / total
    baseline_rate = baseline_released / baseline_total
    return Finding(
        finding_type="RATE_SHIFT",
        title=f"Release rate at {plant} fell to {current_rate:.0%}",
        description=(
            f"Over {RATE_SHIFT_WINDOW_DAYS} days the metrology lab released "
            f"{released} of {total} batches at {plant}, against {baseline_rate:.0%} "
            "across the rest of the period."
        ),
        sources=[QC_LAB_FILE],
        computed={
            "current_rate": round(current_rate, 4),
            "baseline_rate": round(baseline_rate, 4),
            "deviation_pp": round((current_rate - baseline_rate) * 100, 2),
            "z_score": round(score, 2),
            "window_n": total,
            "unit": "batches",
        },
        window_start=datetime.combine(window[0].day, datetime.min.time()),
        window_end=datetime.combine(window[-1].day, datetime.max.time()),
        entities=[{"type": "Plant", "name": plant}],
        evidence={
            "days": [
                {"day": str(day.day), "released": day.released, "total": day.total}
                for day in window
            ]
        },
    )
