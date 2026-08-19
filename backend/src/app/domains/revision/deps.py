"""Revision dependencies."""

from typing import Annotated

from fastapi import Depends

from app.api.deps import SessionDep
from app.domains.revision.repository import RevisionAuditRepository, RevisionQueueRepository
from app.domains.revision.service import RevisionService


def get_revision_service(session: SessionDep) -> RevisionService:
    return RevisionService(
        session,
        RevisionQueueRepository(session),
        RevisionAuditRepository(session),
    )


RevisionServiceDep = Annotated[RevisionService, Depends(get_revision_service)]
