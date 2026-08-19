"""Metric dependencies."""

from typing import Annotated

from fastapi import Depends

from app.api.deps import WarehouseSessionDep
from app.domains.metrics.repository import MetricRepository
from app.domains.metrics.service import MetricService


def get_metric_service(session: WarehouseSessionDep) -> MetricService:
    return MetricService(MetricRepository(session))


MetricServiceDep = Annotated[MetricService, Depends(get_metric_service)]
