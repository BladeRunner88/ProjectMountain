"""Reconciled metrics with their per-source composition."""

from typing import Annotated

from fastapi import APIRouter, Path, Query, status

from app.domains.metrics.deps import MetricServiceDep
from app.domains.metrics.repository import COUNTABLE_TABLES
from app.domains.metrics.schemas import CountMetric, QuantityMetric
from app.domains.metrics.service import DEPRECATED_METRIC_NAMES, QUANTITY_METRICS

_KNOWN = sorted({*QUANTITY_METRICS, *COUNTABLE_TABLES})
_DEPRECATED = sorted(DEPRECATED_METRIC_NAMES)

router = APIRouter(prefix="/metrics", tags=["metrics"])


@router.get("/{name}", status_code=status.HTTP_200_OK)
def get_metric(
    service: MetricServiceDep,
    name: Annotated[
        str,
        Path(description=f"One of {', '.join(_KNOWN)}. Deprecated: {', '.join(_DEPRECATED)}."),
    ],
    plant: Annotated[str | None, Query(description="Scope a quantity metric to one plant")] = None,
    market: Annotated[
        str | None,
        Query(deprecated=True, description="Deprecated alias for `plant`."),
    ] = None,
) -> QuantityMetric | CountMetric:
    """One metric, plus every source that contributed to its reconciled total."""
    return service.get(name, plant or market)
