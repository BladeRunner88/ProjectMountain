"""Wire contract for the structural hierarchy."""

from pydantic import BaseModel, Field

# The tiers that exist in the data, outermost first. There is no "cell" tier: no vendor
# feed records one, and inventing a level of hierarchy to fill a gap in a diagram would be
# inventing entities.
TIERS: tuple[str, ...] = ("country", "plant", "line", "machine", "sensor")


class HierarchyNode(BaseModel):
    """One node of the structural tree."""

    id: str
    tier: str
    label: str
    parent_id: str | None = Field(description="None only for a country, the root tier")
    plant: str | None
    country: str | None
    status: str = Field(description="nominal, watch, or unknown")
    child_count: int
    descendant_machines: int


class HierarchyEdge(BaseModel):
    """A parent-child link, carried separately so a client can lay out either way."""

    source: str
    target: str


class Hierarchy(BaseModel):
    """The structural tree, or a subtree of it.

    Countries are derived from each plant's own `country` property rather than being an
    object type: no feed reports a country as a thing, only as an attribute of a site.
    They are labelled as derived so nobody mistakes them for resolved entities.
    """

    nodes: list[HierarchyNode]
    edges: list[HierarchyEdge]
    tiers: list[str]
    truncated: bool = Field(description="True when a limit stopped the walk short")
