"""Computed operational findings."""

from typing import Annotated

from fastapi import APIRouter, Path, Query, status

from app.domains.findings.deps import FindingServiceDep
from app.domains.findings.schemas import Finding, FindingDetail

router = APIRouter(prefix="/findings", tags=["findings"])


@router.get("", status_code=status.HTTP_200_OK)
def list_findings(
    service: FindingServiceDep,
    finding_type: Annotated[
        str | None, Query(alias="type", description="Filter to one finding type")
    ] = None,
    reviewer_status: Annotated[
        str | None, Query(alias="status", description="Filter to one reviewer status")
    ] = None,
) -> list[Finding]:
    """Every computed finding, optionally filtered by type or reviewer status."""
    return service.list(finding_type=finding_type, reviewer_status=reviewer_status)


@router.get("/{finding_id}", status_code=status.HTTP_200_OK)
def get_finding(
    service: FindingServiceDep,
    finding_id: Annotated[str, Path(description="Finding identifier")],
) -> FindingDetail:
    """One finding, plus everything every other source recorded in the same window."""
    return service.get(finding_id)
