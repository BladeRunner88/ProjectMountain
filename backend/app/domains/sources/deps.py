"""Source dependencies."""

from typing import Annotated

from fastapi import Depends

from app.api.deps import WarehouseSessionDep
from app.domains.sources.repository import SourceRepository
from app.domains.sources.service import SourceService


def get_source_service(session: WarehouseSessionDep) -> SourceService:
    return SourceService(SourceRepository(session))


SourceServiceDep = Annotated[SourceService, Depends(get_source_service)]
