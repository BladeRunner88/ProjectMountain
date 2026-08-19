"""The resolved graph: objects, one object in detail, and the whole graph at once.

No shared prefix: /objects and /graph are two top-level paths over the same domain, and
a prefix would rename both.
"""

from typing import Annotated

from fastapi import APIRouter, Path, Query, status

from app.domains.graph.deps import GraphServiceDep
from app.domains.graph.schemas import FullGraph, GraphObject, ObjectDetail

objects_router = APIRouter(prefix="/objects", tags=["objects"])
graph_router = APIRouter(prefix="/graph", tags=["graph"])

_TYPE_QUERY = Query(description="Filter to one ontology object type")


@objects_router.get("", status_code=status.HTTP_200_OK)
def list_objects(
    service: GraphServiceDep,
    object_type: Annotated[str | None, Query(alias="type")] = None,
) -> list[GraphObject]:
    """Every canonical entity, optionally filtered to one ontology type."""
    return service.list_objects(object_type)


@objects_router.get("/{object_id}", status_code=status.HTTP_200_OK)
def get_object(
    service: GraphServiceDep,
    object_id: Annotated[str, Path(description="Object identifier")],
) -> ObjectDetail:
    """One entity with its neighbours, the raw rows it resolved from, and its provenance."""
    return service.get_object(object_id)


@graph_router.get("", status_code=status.HTTP_200_OK)
def get_graph(
    service: GraphServiceDep,
    object_type: Annotated[str | None, Query(alias="type")] = None,
) -> FullGraph:
    """Every object and every link in one response."""
    return service.full_graph(object_type)
