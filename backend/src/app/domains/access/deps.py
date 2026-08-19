"""Access-request dependencies."""

from pathlib import Path
from typing import Annotated

from fastapi import Depends

from app.api.deps import SessionDep
from app.domains.access.archive import AccessRequestArchive
from app.domains.access.repository import AccessRequestRepository
from app.domains.access.service import AccessRequestService

# Module-level so a test can redirect it, matching how the pre-refactor module global was
# patched. Removed with the archive itself once the table is the only store.
ACCESS_REQUESTS_PATH = Path(__file__).resolve().parents[3].parent / "access_requests.jsonl"


def get_access_request_service(session: SessionDep) -> AccessRequestService:
    return AccessRequestService(
        session,
        AccessRequestRepository(session),
        AccessRequestArchive(ACCESS_REQUESTS_PATH),
    )


AccessRequestServiceDep = Annotated[AccessRequestService, Depends(get_access_request_service)]
