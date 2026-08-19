"""What each source field was understood to mean.

Versioned surface only — nothing new belongs on the legacy unprefixed mount.
"""

from typing import Annotated

from fastapi import APIRouter, Query, status

from app.domains.meaning.deps import MeaningServiceDep
from app.domains.meaning.schemas import (
    BindingPayload,
    BindingRecord,
    CoverageSummary,
    FieldBinding,
)

router = APIRouter(prefix="/meaning", tags=["meaning"])


@router.get("/rules", status_code=status.HTTP_200_OK)
def list_rules(
    service: MeaningServiceDep,
    source_file: Annotated[str | None, Query(description="Filter to one feed")] = None,
    unbound_only: Annotated[bool, Query(description="Only fields nothing has bound")] = False,
) -> list[FieldBinding]:
    """Every field every feed delivered, and what it was taken to mean."""
    return service.list_bindings(source_file=source_file, unbound_only=unbound_only)


@router.get("/coverage", status_code=status.HTTP_200_OK)
def get_coverage(service: MeaningServiceDep) -> CoverageSummary:
    """How much of each feed the system actually understands."""
    return service.coverage()


@router.post("/rules", status_code=status.HTTP_201_CREATED)
def bind_field(service: MeaningServiceDep, payload: BindingPayload) -> BindingRecord:
    """Bind a source field to an ontology property, superseding any earlier binding."""
    return service.bind(payload)
