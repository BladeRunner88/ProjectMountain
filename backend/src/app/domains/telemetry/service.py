"""Telemetry reconstruction."""

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import Row

from app.domains.telemetry.repository import TelemetryRepository
from app.domains.telemetry.schemas import (
    ChannelDef,
    Counters,
    Reading,
    SeriesPoint,
    Snapshot,
    SourceFreshness,
)
from app.domains.telemetry.signal import SensorProfile, align_to_grid, value_at
from app.domains.telemetry.states import STALE, SUSPECT, epoch_seconds, quality_for

TICK_SECONDS = 5
DEFAULT_WINDOW_SECONDS = 300
MAX_WINDOW_SECONDS = 3600
DEFAULT_SENSOR_LIMIT = 200
MAX_SENSOR_LIMIT = 500

# Past this many noise units a reading is called suspect rather than good.
SUSPECT_SIGMA = 2.5

_SCADA = "scada_historian.xml"


class TelemetryService:
    def __init__(self, repository: TelemetryRepository) -> None:
        self._repository = repository

    def channels(self) -> list[ChannelDef]:
        return [
            ChannelDef(
                channel=channel,
                unit=unit,
                sensor_count=count,
                nominal_min=round(low, 3),
                nominal_max=round(high, 3),
            )
            for channel, unit, count, low, high in self._repository.channel_summary()
        ]

    def snapshot(
        self,
        *,
        at: datetime | None,
        window_seconds: int,
        channels: list[str] | None,
        limit: int,
    ) -> Snapshot:
        moment = at or datetime.now(UTC)
        tick = align_to_grid(epoch_seconds(moment), TICK_SECONDS)

        machine_by_sensor = self._repository.machine_by_sensor()
        rows = self._repository.profiles(channels=channels, limit=limit)

        readings = [
            self._reading(row, tick, window_seconds, machine_by_sensor.get(row.channel_id))
            for row in rows
        ]
        return Snapshot(
            as_of=datetime.fromtimestamp(tick, UTC),
            tick=tick,
            tick_seconds=TICK_SECONDS,
            next_at=datetime.fromtimestamp(tick + TICK_SECONDS, UTC),
            window_seconds=window_seconds,
            readings=readings,
            sources=self._sources(tick),
            counters=_count(readings),
        )

    def _reading(
        self, row: Row[Any], tick: int, window_seconds: int, machine_id: str | None
    ) -> Reading:
        profile = _profile_of(row)
        value = value_at(profile, tick)
        deviation = _deviation(value, profile)
        quality = quality_for(row.status, deviation, suspect_sigma=SUSPECT_SIGMA)

        return Reading(
            sensor_id=profile.channel_id,
            machine_id=machine_id,
            channel=row.channel,
            unit=row.unit,
            value=round(value, 4),
            baseline=round(profile.baseline, 4),
            deviation_sigma=round(deviation, 3),
            quality=quality.label,
            quality_reason=quality.reason,
            status=row.status,
            source_file=_SCADA,
            series=_series(profile, tick, window_seconds),
        )

    def _sources(self, tick: int) -> list[SourceFreshness]:
        viewed_at = datetime.fromtimestamp(tick, UTC)
        freshness = []
        for source_file, last_sync, records, failed in self._repository.source_freshness():
            age = _age_seconds(last_sync, viewed_at)
            freshness.append(
                SourceFreshness(
                    source_file=source_file,
                    last_sync_at=last_sync,
                    age_seconds=age,
                    records=records,
                    failed=failed,
                    degraded=failed > 0,
                )
            )
        return freshness


def _profile_of(row: Row[Any]) -> SensorProfile:
    return SensorProfile(
        channel_id=row.channel_id,
        baseline=float(row.baseline),
        amplitude=float(row.amplitude),
        period_seconds=float(row.period_seconds),
        phase_seconds=float(row.phase_seconds),
        noise_sigma=float(row.noise_sigma),
    )


def _deviation(value: float, profile: SensorProfile) -> float:
    """Distance from baseline in this sensor's own noise units.

    Its own, not a shared scale: a vibration sensor and a temperature sensor are not
    comparable in absolute terms, and pretending otherwise makes every temperature look
    alarming.
    """
    if profile.noise_sigma <= 0:
        return 0.0
    return (value - profile.baseline) / profile.noise_sigma


def _series(profile: SensorProfile, tick: int, window_seconds: int) -> list[SeriesPoint]:
    """History, evaluated backwards over the same grid. Bounded, and stored nowhere.

    The series ends AT `tick`, not one tick before it. A sparkline whose final point
    disagrees with the number printed beside it is worse than no sparkline.
    """
    if window_seconds <= 0:
        return []
    points = window_seconds // TICK_SECONDS
    return [
        SeriesPoint(
            t=datetime.fromtimestamp(tick - offset * TICK_SECONDS, UTC),
            v=round(value_at(profile, tick - offset * TICK_SECONDS), 4),
        )
        for offset in range(points - 1, -1, -1)
    ]


def _age_seconds(last_sync: str | None, viewed_at: datetime) -> float | None:
    if not last_sync:
        return None
    try:
        synced = datetime.fromisoformat(last_sync)
    except ValueError:
        return None
    if synced.tzinfo is None:
        synced = synced.replace(tzinfo=UTC)
    return round((viewed_at - synced).total_seconds(), 1)


def _count(readings: list[Reading]) -> Counters:
    return Counters(
        sensors_reporting=len(readings),
        sensors_stale=sum(1 for reading in readings if reading.quality == STALE),
        sensors_suspect=sum(1 for reading in readings if reading.quality == SUSPECT),
        machines_monitored=len({r.machine_id for r in readings if r.machine_id}),
    )


def clamp_window(window_seconds: int) -> int:
    return max(0, min(window_seconds, MAX_WINDOW_SECONDS))


def clamp_limit(limit: int) -> int:
    return max(1, min(limit, MAX_SENSOR_LIMIT))
