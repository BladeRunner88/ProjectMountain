"""Human review of findings.

Mounted only under the versioned prefix — new endpoints never join the legacy unprefixed
surface, which exists solely to keep the existing frontend working until it flips.
"""

from typing import Annotated

from fastapi import APIRouter, Path, status

from app.domains.findings.deps import FindingReviewServiceDep
from app.domains.findings.review_schemas import FindingReviewPayload, FindingReviewRecord

router = APIRouter(prefix="/findings", tags=["findings"])


@router.post("/{finding_id}/reviews", status_code=status.HTTP_201_CREATED)
def create_finding_review(
    service: FindingReviewServiceDep,
    finding_id: Annotated[str, Path(description="Finding identifier")],
    payload: FindingReviewPayload,
) -> FindingReviewRecord:
    """Record a verdict on a finding.

    Append-only: submitting again supersedes the previous verdict rather than editing it,
    so the reasoning behind a reversal stays readable.
    """
    return service.submit(finding_id, payload)


@router.get("/{finding_id}/reviews", status_code=status.HTTP_200_OK)
def list_finding_reviews(
    service: FindingReviewServiceDep,
    finding_id: Annotated[str, Path(description="Finding identifier")],
) -> list[FindingReviewRecord]:
    """Every verdict recorded for a finding, oldest first."""
    return service.history(finding_id)
