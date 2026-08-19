"""Wire contract for the resolved graph.

`GraphObject` allows extra fields on purpose. An object's properties are dictated by its
ontology type, and the API reads that schema generically — pinning a fixed field set here
would either be a lie or force one model per object type, which is exactly the coupling
the ontology exists to avoid.
"""

from typing import Any

from pydantic import BaseModel, ConfigDict


class GraphObject(BaseModel):
    """One canonical entity, with its ontology properties flattened alongside id and type.

    KNOWN DEFECT, preserved deliberately: flattening lets a property named `type` overwrite
    the ontology type. Every Transaction reports `type: "deposit"` or `"withdrawal"` instead
    of `"Transaction"` — 18,000 of 18,744 objects in the current database. Filtering by
    `?type=Transaction` therefore returns rows the response then labels something else.

    It is reproduced here rather than fixed because this port must be byte-identical to the
    surface the frontend is already rendering. The manufacturing ontology removes the
    collision at the root by not naming any property `type`; the fix lands with it.
    """

    model_config = ConfigDict(extra="allow")

    id: str
    type: str


class GraphLink(BaseModel):
    """One typed edge."""

    source: str
    target: str
    rel_type: str


class FullGraph(BaseModel):
    """Every object and link in one round trip.

    One response rather than a detail fetch per node: the graph view used to rebuild this
    client-side with an N+1 that exhausted the browser's connection pool at this size.
    """

    objects: list[GraphObject]
    links: list[GraphLink]


class Connection(BaseModel):
    """A neighbour of an object, and the direction of the edge that reaches it."""

    direction: str
    rel_type: str
    id: str
    # None when the edge points at an id with no object row — a dangling reference.
    type: str | None
    name: str


class ResolvedFrom(BaseModel):
    """One raw source row that was resolved into this object."""

    source_table: str
    source_id: str
    raw_name: str


class ObjectDetail(BaseModel):
    """One object with its neighbours, the raw rows behind it, and per-field provenance."""

    id: str
    type: str
    properties: dict[str, Any]
    connections: list[Connection]
    resolved_from: list[ResolvedFrom]
    provenance: dict[str, str]
