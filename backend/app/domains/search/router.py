"""Search over the resolved graph."""

from typing import Annotated

from fastapi import APIRouter, Query, status

from app.domains.search.deps import SearchServiceDep
from app.domains.search.schemas import SearchHit

router = APIRouter(prefix="/search", tags=["search"])

_QUERY_MAX_LENGTH = 200


@router.get("", status_code=status.HTTP_200_OK)
def search(
    service: SearchServiceDep,
    q: Annotated[
        str,
        Query(
            description="Free-text query; matches names, aliases and properties",
            max_length=_QUERY_MAX_LENGTH,
        ),
    ] = "",
) -> list[SearchHit]:
    """Best matches for `q`, capped server-side. An empty query returns nothing."""
    return service.search(q)
