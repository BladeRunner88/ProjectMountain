"""Access-request dependencies."""

from typing import Annotated

from fastapi import Depends

from app.api.deps import SessionDep
from app.domains.access.repository import AccessRequestRepository
from app.domains.access.service import AccessRequestService


def get_access_request_service(session: SessionDep) -> AccessRequestService:
    return AccessRequestService(session, AccessRequestRepository(session))


AccessRequestServiceDep = Annotated[AccessRequestService, Depends(get_access_request_service)]
