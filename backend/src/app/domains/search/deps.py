"""Search dependencies."""

from typing import Annotated

from fastapi import Depends

from app.api.deps import WarehouseSessionDep
from app.domains.search.repository import SearchRepository
from app.domains.search.service import SearchService


def get_search_service(session: WarehouseSessionDep) -> SearchService:
    return SearchService(SearchRepository(session))


SearchServiceDep = Annotated[SearchService, Depends(get_search_service)]
