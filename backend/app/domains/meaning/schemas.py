"""Wire contract for the context engine's field bindings."""

from pydantic import BaseModel, Field

_SHORT = 120
_LONG = 4000


class FieldBinding(BaseModel):
    """One column of one source feed, and what it was understood to mean."""

    source_file: str
    source_field: str
    # None when nothing has bound it. That is the honest state: the pipeline leaves a
    # field it cannot map alone rather than guessing, and this surface exists to show
    # what it left.
    target_property: str | None
    transform: str | None
    # "pipeline" when the built-in manifest bound it, "human" when someone did.
    bound_by_kind: str
    bound_by: str | None
    bound_at: str | None


class SourceCoverage(BaseModel):
    """How much of one feed the system claims to understand."""

    source_file: str
    total_fields: int
    bound_fields: int
    unbound_fields: int
    coverage_pct: float
    unbound: list[str]


class CoverageSummary(BaseModel):
    """Coverage across every feed.

    Deliberately not a single headline percentage over all fields pooled together: a feed
    with forty columns would drown out one with six, and it is the small neglected feed
    that usually carries the field nobody mapped.
    """

    sources: list[SourceCoverage]
    total_fields: int
    bound_fields: int


class BindingPayload(BaseModel):
    """A human binding one source field to an ontology property."""

    source_file: str = Field(min_length=1, max_length=_SHORT)
    source_field: str = Field(min_length=1, max_length=_SHORT)
    target_property: str = Field(min_length=1, max_length=_SHORT)
    transform: str | None = Field(default=None, max_length=_SHORT)
    bound_by: str = Field(min_length=1, max_length=_SHORT)
    note: str | None = Field(default=None, max_length=_LONG)


class BindingRecord(BaseModel):
    """A stored binding, as read back."""

    id: str
    source_file: str
    source_field: str
    target_property: str
    transform: str | None
    active: bool
    bound_by: str
    bound_at: str
    note: str | None
