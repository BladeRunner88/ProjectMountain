"""Lineage dependencies."""

from typing import Annotated

from fastapi import Depends

from app.api.deps import WarehouseSessionDep
from app.domains.findings.repository import FindingRepository
from app.domains.graph.repository import GraphRepository
from app.domains.lineage.service import LineageService


def get_lineage_service(session: WarehouseSessionDep) -> LineageService:
    return LineageService(FindingRepository(session), GraphRepository(session))


LineageServiceDep = Annotated[LineageService, Depends(get_lineage_service)]
