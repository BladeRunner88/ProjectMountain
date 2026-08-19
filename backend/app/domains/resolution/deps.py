"""Resolution dependencies."""

from typing import Annotated

from fastapi import Depends

from app.api.deps import SessionDep, WarehouseSessionDep
from app.domains.resolution.repository import (
    CandidatePairRepository,
    GroundTruthRepository,
    WeightRepository,
)
from app.domains.resolution.service import ResolutionService


def get_resolution_service(
    session: WarehouseSessionDep,
    app_session: SessionDep,
) -> ResolutionService:
    """Two sessions: candidate pairs are warehouse data, labels and weights are ours."""
    return ResolutionService(
        app_session,
        CandidatePairRepository(session),
        GroundTruthRepository(app_session),
        WeightRepository(app_session),
    )


ResolutionServiceDep = Annotated[ResolutionService, Depends(get_resolution_service)]
