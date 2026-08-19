"""Live sensor readings, reconstructed from a timestamp."""

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Query, Response, status

from app.domains.telemetry.deps import TelemetryServiceDep
from app.domains.telemetry.schemas import ChannelDef, Snapshot
from app.domains.telemetry.service import (
    DEFAULT_SENSOR_LIMIT,
    DEFAULT_WINDOW_SECONDS,
    MAX_SENSOR_LIMIT,
    MAX_WINDOW_SECONDS,
    TICK_SECONDS,
    clamp_limit,
    clamp_window,
)

router = APIRouter(prefix="/telemetry", tags=["telemetry"])


@router.get("/channels", status_code=status.HTTP_200_OK)
def get_channels(service: TelemetryServiceDep) -> list[ChannelDef]:
    """Every measured channel and its unit, so no client hardcodes a degree sign."""
    return service.channels()


@router.get("/snapshot", status_code=status.HTTP_200_OK)
def get_snapshot(
    service: TelemetryServiceDep,
    response: Response,
    at: Annotated[
        datetime | None,
        Query(description="Instant to view. Defaults to now, snapped to the tick grid."),
    ] = None,
    window_seconds: Annotated[
        int, Query(ge=0, le=MAX_WINDOW_SECONDS, description="History per channel; 0 for none")
    ] = DEFAULT_WINDOW_SECONDS,
    channel: Annotated[
        list[str] | None, Query(description="Repeatable. Omit for every channel.")
    ] = None,
    limit: Annotated[int, Query(ge=1, le=MAX_SENSOR_LIMIT)] = DEFAULT_SENSOR_LIMIT,
) -> Snapshot:
    """Every sensor at one instant.

    The instant is snapped to the sampling grid, so the response for a given tick is
    identical for every caller and safe to cache for the length of one tick.
    """
    response.headers["Cache-Control"] = f"public, max-age={TICK_SECONDS}"
    return service.snapshot(
        at=at,
        window_seconds=clamp_window(window_seconds),
        channels=channel,
        limit=clamp_limit(limit),
    )
