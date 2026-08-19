"""Turning six different notations for "when" into one UTC instant.

Every branch here records whether a timezone had to be *assumed*, because that is the
difference between a number a reader can trust and one they cannot. The pipeline counts
assumptions and the API reports the count.
"""

from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta

from app.pipeline.vocabulary import PLANT_UTC_OFFSET

EXCEL_EPOCH = date(1899, 12, 30)
_LAB_FORMAT = "%m/%d/%Y %H:%M"
_HISTORIAN_FORMAT = "%Y-%m-%d %H:%M:%S"


@dataclass(frozen=True)
class Instant:
    """A normalised timestamp and whether its timezone was stated or inferred."""

    at: datetime
    tz_assumed: bool


def from_iso_with_offset(raw: str) -> Instant:
    """Inline QC states its offset, so nothing is assumed.

    Converted through UTC explicitly, never through the machine's local zone: the same
    input has to produce the same instant on a developer laptop and in a container.
    """
    parsed = datetime.fromisoformat(raw)
    if parsed.tzinfo is None:
        return Instant(parsed, tz_assumed=True)
    return Instant(parsed.astimezone(UTC).replace(tzinfo=None), tz_assumed=False)


def from_historian(raw: str) -> Instant:
    """The historian writes wall clock with no zone at all. UTC is the assumption."""
    return Instant(datetime.strptime(raw.strip(), _HISTORIAN_FORMAT), tz_assumed=True)


def from_lab_local(raw: str, plant: str) -> Instant:
    """The lab writes plant-local wall clock. The plant's standing offset is the assumption.

    No DST. That is a stated simplification, not an oversight — modelling it would need a
    tz database per plant and the feed carries nothing to validate it against.
    """
    local = datetime.strptime(raw.strip(), _LAB_FORMAT)
    offset = PLANT_UTC_OFFSET.get(plant, 0)
    return Instant(local - timedelta(hours=offset), tz_assumed=True)


def from_excel_serial(serial: float) -> Instant:
    """Excel counts days from 1899-12-30, with time as the fraction. Zone unstated."""
    whole_days = int(serial)
    seconds = round((serial - whole_days) * 86_400)
    at = datetime.combine(EXCEL_EPOCH, datetime.min.time()) + timedelta(
        days=whole_days, seconds=seconds
    )
    return Instant(at, tz_assumed=True)
