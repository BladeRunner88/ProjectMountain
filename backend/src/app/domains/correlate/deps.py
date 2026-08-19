"""Correlation dependencies."""

from typing import Annotated

from fastapi import Depends

from app.api.deps import WarehouseSessionDep
from app.domains.correlate.repository import WindowRepository
from app.domains.correlate.service import CorrelateService


def get_correlate_service(session: WarehouseSessionDep) -> CorrelateService:
    return CorrelateService(WindowRepository(session))


CorrelateServiceDep = Annotated[CorrelateService, Depends(get_correlate_service)]
