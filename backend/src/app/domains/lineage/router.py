"""Trace a finding or an object back to its raw sources."""

from typing import Annotated

from fastapi import APIRouter, Path, status

from app.domains.lineage.deps import LineageServiceDep
from app.domains.lineage.schemas import FindingLineage, ObjectLineage

router = APIRouter(prefix="/lineage", tags=["lineage"])


@router.get("/{item_id}", status_code=status.HTTP_200_OK)
def get_lineage(
    service: LineageServiceDep,
    item_id: Annotated[str, Path(description="A finding id or an object id")],
) -> FindingLineage | ObjectLineage:
    """Where this number came from — evidence for a finding, raw rows for an object."""
    return service.trace(item_id)
