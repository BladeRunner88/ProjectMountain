"""The structural tree: country, plant, line, machine, sensor."""

from typing import Annotated

from fastapi import APIRouter, Query, status

from app.domains.hierarchy.deps import HierarchyServiceDep
from app.domains.hierarchy.schemas import TIERS, Hierarchy
from app.domains.hierarchy.service import DEFAULT_LIMIT, MAX_LIMIT

router = APIRouter(prefix="/hierarchy", tags=["hierarchy"])


@router.get("", status_code=status.HTTP_200_OK)
def get_hierarchy(
    service: HierarchyServiceDep,
    root: Annotated[str | None, Query(description="Return only this node and below")] = None,
    tier: Annotated[
        str | None, Query(description=f"Return only one tier. One of: {', '.join(TIERS)}")
    ] = None,
    limit: Annotated[int, Query(ge=1, le=MAX_LIMIT)] = DEFAULT_LIMIT,
) -> Hierarchy:
    """The structural tree, assembled from the resolved graph rather than a fixture."""
    return service.tree(root=root, tier=tier, limit=limit)
