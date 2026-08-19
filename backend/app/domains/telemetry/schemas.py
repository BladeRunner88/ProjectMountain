"""Wire contract for telemetry."""

from datetime import datetime

from pydantic import BaseModel, Field


class ChannelDef(BaseModel):
    """One measured channel and the range it normally sits in."""

    channel: str
    unit: str
    sensor_count: int
    nominal_min: float
    nominal_max: float


class SeriesPoint(BaseModel):
    """One point of history."""

    t: datetime
    v: float


class Reading(BaseModel):
    """One sensor at one instant."""

    sensor_id: str
    machine_id: str | None
    channel: str
    unit: str
    value: float
    baseline: float
    deviation_sigma: float = Field(
        description="How far this reading sits from its own baseline, in its own noise units"
    )
    quality: str = Field(description="good, suspect, or stale")
    quality_reason: str | None
    status: str
    source_file: str
    series: list[SeriesPoint] = Field(
        default_factory=list, description="Empty when window_seconds is 0"
    )


class SourceFreshness(BaseModel):
    """When a feed last delivered, relative to the instant being viewed."""

    source_file: str
    last_sync_at: str | None
    age_seconds: float | None
    records: int
    failed: int
    degraded: bool


class Counters(BaseModel):
    """Headline numbers for the instant, all counted rather than asserted."""

    sensors_reporting: int
    sensors_stale: int
    sensors_suspect: int
    machines_monitored: int


class Snapshot(BaseModel):
    """Every sensor at one instant, reconstructed rather than stored.

    `tick` is the instant snapped to the sampling grid: two clients polling milliseconds
    apart receive the same frame, so the same moment never reads differently for two
    people looking at it.
    """

    as_of: datetime
    tick: int
    tick_seconds: int
    next_at: datetime = Field(description="Poll hint — the next grid instant")
    window_seconds: int
    readings: list[Reading]
    sources: list[SourceFreshness]
    counters: Counters
