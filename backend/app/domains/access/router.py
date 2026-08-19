"""Onboarding access requests."""

from fastapi import APIRouter, status

from app.domains.access.deps import AccessRequestServiceDep
from app.domains.access.schemas import AccessRequestPayload, AccessRequestReceipt

router = APIRouter(prefix="/access-requests", tags=["access"])


@router.post("", status_code=status.HTTP_200_OK)
def create_access_request(
    payload: AccessRequestPayload,
    service: AccessRequestServiceDep,
) -> AccessRequestReceipt:
    """Record an access request and return its receipt."""
    return service.submit(payload)
