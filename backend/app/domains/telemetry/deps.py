"""Telemetry dependencies."""

from typing import Annotated

from fastapi import Depends

from app.api.deps import WarehouseSessionDep
from app.domains.telemetry.repository import TelemetryRepository
from app.domains.telemetry.service import TelemetryService


def get_telemetry_service(session: WarehouseSessionDep) -> TelemetryService:
    return TelemetryService(TelemetryRepository(session))


TelemetryServiceDep = Annotated[TelemetryService, Depends(get_telemetry_service)]
