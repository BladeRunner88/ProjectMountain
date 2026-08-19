"""The revision queue and its audit chain.

Versioned surface only — nothing new belongs on the legacy unprefixed mount.
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Path, Query, status

from app.api.deps import PaginationDep
from app.core.pagination import Page
from app.domains.revision.deps import RevisionServiceDep
from app.domains.revision.schemas import (
    AuditEntryRecord,
    ChainVerification,
    QueueActionPayload,
    QueueItemPayload,
    QueueItemRecord,
)

router = APIRouter(prefix="/revision", tags=["revision"])


@router.post("/queue", status_code=status.HTTP_201_CREATED)
def raise_queue_item(
    service: RevisionServiceDep,
    payload: QueueItemPayload,
) -> QueueItemRecord:
    """Raise something for a human to decide."""
    return service.raise_item(payload)


@router.get("/queue", status_code=status.HTTP_200_OK)
def list_queue(
    service: RevisionServiceDep,
    page: PaginationDep,
    stage: Annotated[str | None, Query(description="Filter to one stage")] = None,
    priority: Annotated[str | None, Query(description="Filter to one priority")] = None,
) -> Page[QueueItemRecord]:
    """The queue, oldest first."""
    items, total = service.list_items(stage=stage, priority=priority, page=page)
    return Page(items=items, total=total, limit=page.limit, offset=page.offset)


@router.post("/queue/{item_id}/actions", status_code=status.HTTP_200_OK)
def act_on_queue_item(
    service: RevisionServiceDep,
    item_id: Annotated[UUID, Path(description="Queue item identifier")],
    payload: QueueActionPayload,
) -> QueueItemRecord:
    """Decide a queue item, sealing the decision into the audit chain."""
    return service.act(item_id, payload)


@router.get("/audit", status_code=status.HTTP_200_OK)
def get_audit(service: RevisionServiceDep) -> list[AuditEntryRecord]:
    """The whole audit chain, in sequence order."""
    return service.audit()


@router.get("/audit/verification", status_code=status.HTTP_200_OK)
def verify_audit(service: RevisionServiceDep) -> ChainVerification:
    """Re-walk the chain and recompute every seal.

    A chain nobody verifies is decoration. This is the endpoint that makes it evidence.
    """
    return service.verify()
