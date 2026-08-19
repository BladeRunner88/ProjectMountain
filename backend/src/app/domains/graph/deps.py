"""Graph dependencies."""

from typing import Annotated

from fastapi import Depends

from app.api.deps import WarehouseSessionDep
from app.domains.graph.repository import GraphRepository
from app.domains.graph.service import GraphService


def get_graph_service(session: WarehouseSessionDep) -> GraphService:
    return GraphService(GraphRepository(session))


GraphServiceDep = Annotated[GraphService, Depends(get_graph_service)]
