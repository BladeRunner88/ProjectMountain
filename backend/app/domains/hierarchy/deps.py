"""Hierarchy dependencies."""

from typing import Annotated

from fastapi import Depends

from app.api.deps import WarehouseSessionDep
from app.domains.hierarchy.repository import HierarchyRepository
from app.domains.hierarchy.service import HierarchyService


def get_hierarchy_service(session: WarehouseSessionDep) -> HierarchyService:
    return HierarchyService(HierarchyRepository(session))


HierarchyServiceDep = Annotated[HierarchyService, Depends(get_hierarchy_service)]
