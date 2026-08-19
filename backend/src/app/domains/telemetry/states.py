"""Machine states overlaid on the reconstructed signal.

A modelled sine wave says nothing about a machine that was actually down. The pipeline
records real state changes; this applies them, so a sensor on a stopped machine reads as
stale rather than as a healthy oscillation.
"""

from dataclasses import dataclass
from datetime import UTC, datetime

GOOD = "good"
SUSPECT = "suspect"
STALE = "stale"

_DEGRADED_STATUS = "degraded"


@dataclass(frozen=True)
class Quality:
    """How much a reading can be relied on, and why."""

    label: str
    reason: str | None


def quality_for(status: str, deviation_sigma: float, *, suspect_sigma: float) -> Quality:
    """Judge one reading.

    A sensor the historian flagged as degraded is stale regardless of what it reports —
    the number may look fine and still be meaningless.
    """
    if status == _DEGRADED_STATUS:
        return Quality(STALE, "the historian reports this channel as degraded")
    if abs(deviation_sigma) >= suspect_sigma:
        return Quality(
            SUSPECT, f"{abs(deviation_sigma):.1f} standard deviations from its own baseline"
        )
    return Quality(GOOD, None)


def epoch_seconds(moment: datetime) -> float:
    """Seconds since the epoch, treating a naive instant as UTC.

    The warehouse stores naive UTC throughout, so this must not fall back to the machine's
    local zone — that would make the same instant read differently on two machines.
    """
    aware = moment if moment.tzinfo is not None else moment.replace(tzinfo=UTC)
    return aware.timestamp()
