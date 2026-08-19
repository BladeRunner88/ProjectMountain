"""Entity resolution: what merged, whether it should have, and how well it scores.

Versioned surface only — nothing new belongs on the legacy unprefixed mount.
"""

from typing import Annotated

from fastapi import APIRouter, Path, Query, status

from app.api.deps import PaginationDep
from app.core.pagination import Page
from app.domains.resolution.deps import ResolutionServiceDep
from app.domains.resolution.schemas import (
    CandidatePair,
    LabelPayload,
    ResolutionMetrics,
    WeightPayload,
    WeightRecord,
)
from app.domains.resolution.service import DEFAULT_AUTO_MERGE, DEFAULT_REJECT

router = APIRouter(prefix="/resolution", tags=["resolution"])


@router.get("/pairs", status_code=status.HTTP_200_OK)
def list_pairs(
    service: ResolutionServiceDep,
    page: PaginationDep,
    object_type: Annotated[
        str | None, Query(alias="type", description="Filter to one type")
    ] = None,
    unlabelled_only: Annotated[bool, Query(description="Only pairs nobody has judged")] = False,
) -> Page[CandidatePair]:
    """Every merge a person could disagree with, least similar first."""
    items, total = service.list_pairs(
        object_type=object_type, unlabelled_only=unlabelled_only, page=page
    )
    return Page(items=items, total=total, limit=page.limit, offset=page.offset)


@router.get("/pairs/{pair_id}", status_code=status.HTTP_200_OK)
def get_pair(
    service: ResolutionServiceDep,
    pair_id: Annotated[str, Path(description="Pair identifier")],
) -> CandidatePair:
    """One candidate pair, with any verdict already recorded against it."""
    return service.get_pair(pair_id)


@router.post("/pairs/{pair_id}/label", status_code=status.HTTP_201_CREATED)
def label_pair(
    service: ResolutionServiceDep,
    pair_id: Annotated[str, Path(description="Pair identifier")],
    payload: LabelPayload,
) -> CandidatePair:
    """Judge a pair. These labels are the only real input to precision and recall."""
    return service.label_pair(pair_id, payload)


@router.get("/metrics", status_code=status.HTTP_200_OK)
def get_metrics(
    service: ResolutionServiceDep,
    auto_merge: Annotated[float, Query(ge=0.0, le=1.0)] = DEFAULT_AUTO_MERGE,
    reject: Annotated[float, Query(ge=0.0, le=1.0)] = DEFAULT_REJECT,
) -> ResolutionMetrics:
    """Precision and recall at the given thresholds, over labelled pairs only.

    Thresholds are query parameters so moving the slider recomputes without persisting
    a decision nobody has made yet.
    """
    return service.metrics(auto_merge=auto_merge, reject=reject)


@router.get("/config", status_code=status.HTTP_200_OK)
def get_config(service: ResolutionServiceDep) -> list[WeightRecord]:
    """The per-field scoring weights currently in force."""
    return service.weights()


@router.put("/config", status_code=status.HTTP_200_OK)
def set_config(service: ResolutionServiceDep, payload: WeightPayload) -> WeightRecord:
    """Set one field's weight, retiring whatever it carried before."""
    return service.set_weight(payload)
