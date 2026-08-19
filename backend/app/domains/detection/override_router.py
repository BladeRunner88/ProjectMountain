"""Detection-rule tuning.

Versioned surface only — the legacy unprefixed mount exists to keep the pre-migration
frontend working, and nothing new belongs on it.
"""

from typing import Annotated

from fastapi import APIRouter, Path, status

from app.domains.detection.deps import DetectionOverrideServiceDep
from app.domains.detection.override_schemas import (
    DetectionOverridePayload,
    DetectionOverrideRecord,
)

router = APIRouter(prefix="/detection", tags=["detection"])


@router.patch("/rules/{rule_id}", status_code=status.HTTP_200_OK)
def tune_rule(
    service: DetectionOverrideServiceDep,
    rule_id: Annotated[str, Path(description="Rule identifier")],
    payload: DetectionOverridePayload,
) -> DetectionOverrideRecord:
    """Adjust a rule's threshold, silence it, or both.

    PATCH rather than PUT: a caller changing a threshold should not have to re-state the
    enabled flag and risk clobbering someone else's decision to silence the rule.
    """
    return service.apply(rule_id, payload)


@router.get("/rules/{rule_id}/history", status_code=status.HTTP_200_OK)
def rule_history(
    service: DetectionOverrideServiceDep,
    rule_id: Annotated[str, Path(description="Rule identifier")],
) -> list[DetectionOverrideRecord]:
    """Every adjustment ever made to a rule, oldest first."""
    return service.history(rule_id)
