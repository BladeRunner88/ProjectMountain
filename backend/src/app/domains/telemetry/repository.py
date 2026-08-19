"""Sensor profiles and feed freshness. Queries only."""

from typing import Any

from sqlalchemy import Row, func, select
from sqlalchemy.orm import Session

from app.db.warehouse.clean_tables import sensor_profiles
from app.db.warehouse.graph_tables import links
from app.db.warehouse.meta_tables import connector_status

_MOUNTED_ON = "MOUNTED_ON"


class TelemetryRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def profiles(self, *, channels: list[str] | None, limit: int) -> list[Row[Any]]:
        stmt = select(sensor_profiles).order_by(sensor_profiles.c.channel_id).limit(limit)
        if channels:
            stmt = stmt.where(sensor_profiles.c.channel.in_(channels))
        return list(self._session.execute(stmt).all())

    def channel_summary(self) -> list[Row[Any]]:
        stmt = (
            select(
                sensor_profiles.c.channel,
                sensor_profiles.c.unit,
                func.count(),
                func.min(sensor_profiles.c.baseline - sensor_profiles.c.amplitude),
                func.max(sensor_profiles.c.baseline + sensor_profiles.c.amplitude),
            )
            .group_by(sensor_profiles.c.channel, sensor_profiles.c.unit)
            .order_by(sensor_profiles.c.channel)
        )
        return list(self._session.execute(stmt).all())

    def machine_by_sensor(self) -> dict[str, str]:
        """Which machine each sensor is mounted on, from the resolved graph."""
        stmt = select(links.c.source_id, links.c.target_id).where(links.c.rel_type == _MOUNTED_ON)
        return {row.source_id: row.target_id for row in self._session.execute(stmt)}

    def source_freshness(self) -> list[Row[Any]]:
        stmt = select(
            connector_status.c.source_file,
            connector_status.c.last_sync,
            connector_status.c.records,
            connector_status.c.failed,
        )
        return list(self._session.execute(stmt).all())
