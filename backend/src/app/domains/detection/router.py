"""Detection rules, and what they are firing on right now."""

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Query, status

from app.domains.detection.deps import DetectionServiceDep
from app.domains.detection.schemas import DetectionPage, RuleSummary

router = APIRouter(prefix="/detection", tags=["detection"])

_MAX_DETECTIONS = 500


@router.get("/rules", status_code=status.HTTP_200_OK)
def get_rules(
    service: DetectionServiceDep,
    at: Annotated[datetime | None, Query(description="Instant to count firings at")] = None,
) -> list[RuleSummary]:
    """Every rule, why its threshold is where it is, and how many sensors breach it now."""
    return service.rules(at)


@router.get("/detections", status_code=status.HTTP_200_OK)
def get_detections(
    service: DetectionServiceDep,
    at: Annotated[datetime | None, Query(description="Instant to evaluate")] = None,
    rule_id: Annotated[str | None, Query(description="Filter to one rule")] = None,
    severity: Annotated[str | None, Query(description="critical or warning")] = None,
    limit: Annotated[int, Query(ge=1, le=_MAX_DETECTIONS)] = 50,
) -> DetectionPage:
    """Every threshold breach at one instant, worst excursion first."""
    return service.detections(at=at, rule_id=rule_id, severity=severity, limit=limit)
