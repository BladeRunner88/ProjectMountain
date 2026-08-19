"""Meaning dependencies."""

from typing import Annotated

from fastapi import Depends

from app.api.deps import SessionDep, WarehouseSessionDep
from app.domains.meaning.repository import BindingRepository, RawFieldRepository
from app.domains.meaning.service import MeaningService


def get_meaning_service(
    session: WarehouseSessionDep,
    app_session: SessionDep,
) -> MeaningService:
    """Two sessions: the field inventory is warehouse data, the bindings are ours."""
    return MeaningService(app_session, RawFieldRepository(session), BindingRepository(app_session))


MeaningServiceDep = Annotated[MeaningService, Depends(get_meaning_service)]
