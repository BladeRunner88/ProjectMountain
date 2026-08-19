"""Detection dependencies."""

from typing import Annotated

from fastapi import Depends

from app.api.deps import SessionDep, WarehouseSessionDep
from app.domains.detection.override_repository import DetectionOverrideRepository
from app.domains.detection.override_service import DetectionOverrideService
from app.domains.detection.service import DetectionService
from app.domains.telemetry.repository import TelemetryRepository
from app.domains.telemetry.service import TelemetryService


def get_detection_service(
    session: WarehouseSessionDep,
    app_session: SessionDep,
) -> DetectionService:
    """Two sessions: the readings are warehouse data, the tuning is API-owned.

    The overrides are read once here and handed to the service, so every rule evaluated
    in one request sees the same tuning.
    """
    return DetectionService(
        TelemetryService(TelemetryRepository(session)),
        DetectionOverrideRepository(app_session).active_by_rule(),
    )


DetectionServiceDep = Annotated[DetectionService, Depends(get_detection_service)]


def get_detection_override_service(app_session: SessionDep) -> DetectionOverrideService:
    return DetectionOverrideService(app_session, DetectionOverrideRepository(app_session))


DetectionOverrideServiceDep = Annotated[
    DetectionOverrideService, Depends(get_detection_override_service)
]
