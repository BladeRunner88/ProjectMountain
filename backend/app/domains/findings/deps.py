"""Finding dependencies."""

from typing import Annotated

from fastapi import Depends

from app.api.deps import SessionDep, WarehouseSessionDep
from app.domains.correlate.repository import WindowRepository
from app.domains.correlate.service import CorrelateService
from app.domains.findings.repository import FindingRepository
from app.domains.findings.review_repository import FindingReviewRepository
from app.domains.findings.review_service import FindingReviewService
from app.domains.findings.service import FindingService


def get_finding_service(
    session: WarehouseSessionDep,
    app_session: SessionDep,
) -> FindingService:
    """Two sessions, deliberately.

    A finding is warehouse data; the verdict on it is API-owned data in the other
    database file. The service holds both because no SQL statement can span them.
    """
    return FindingService(
        FindingRepository(session),
        CorrelateService(WindowRepository(session)),
        FindingReviewRepository(app_session),
    )


FindingServiceDep = Annotated[FindingService, Depends(get_finding_service)]


def get_finding_review_service(
    app_session: SessionDep,
    findings: FindingServiceDep,
) -> FindingReviewService:
    return FindingReviewService(app_session, FindingReviewRepository(app_session), findings)


FindingReviewServiceDep = Annotated[FindingReviewService, Depends(get_finding_review_service)]
