"""Health dependencies."""

from typing import Annotated

from fastapi import Depends

from app.api.deps import WarehouseSessionDep
from app.domains.health.repository import HealthRepository
from app.domains.health.service import HealthService


def get_health_service(session: WarehouseSessionDep) -> HealthService:
    return HealthService(HealthRepository(session))


HealthServiceDep = Annotated[HealthService, Depends(get_health_service)]
