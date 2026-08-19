"""The provenance envelope every derived number is served in.

The browser currently builds a live graph of `TracedValue` objects so a reader can click
any number and walk back to what produced it. Moving that server-side is the point of this
envelope, and the shape is fixed here before the first endpoint uses it — retrofitting it
onto twenty endpoints afterwards is the single largest rework risk in the migration.

**What it deliberately does not carry.** The browser attached a `confidence` to every
value. Most of those were invented: there is no measurement behind "this plant name is 94%
confident". Confidence appears here only where a real computation produced one — a
resolution match score, a statistical test — and is `None` everywhere else. A number that
looks measured but is not is worse than no number, and this whole product exists to argue
the opposite of that.
"""

from datetime import datetime
from typing import Generic, TypeVar

from pydantic import BaseModel, Field

T = TypeVar("T")


class Traced(BaseModel, Generic[T]):
    """A value, and everything needed to check it."""

    value: T
    unit: str | None = Field(default=None, description="Unit of `value`, when it has one")

    source_files: list[str] = Field(
        default_factory=list,
        description="Vendor feeds that contributed. Empty means the value is not derived "
        "from ingested data — a catalogue entry, or a count of the schema itself.",
    )
    derived_from: list[str] = Field(
        default_factory=list,
        description="Identifiers of the rows or objects behind this value, where they are "
        "few enough to name. A large aggregate names its query instead.",
    )
    computed_by: str | None = Field(
        default=None, description="The stage, rule or query that produced this value"
    )
    as_of: datetime | None = Field(
        default=None, description="When the underlying data was observed or last built"
    )
    confidence: float | None = Field(
        default=None,
        ge=0.0,
        le=1.0,
        description="Only present where a real computation produced it — a match score, "
        "a statistical test. Never a decorative number.",
    )


def observed(
    value: T,
    *,
    source_files: list[str] | None = None,
    computed_by: str | None = None,
    unit: str | None = None,
    as_of: datetime | None = None,
    derived_from: list[str] | None = None,
    confidence: float | None = None,
) -> Traced[T]:
    """Wrap a value that came from ingested data."""
    return Traced[T](
        value=value,
        unit=unit,
        source_files=source_files or [],
        derived_from=derived_from or [],
        computed_by=computed_by,
        as_of=as_of,
        confidence=confidence,
    )


def declared(value: T, *, computed_by: str, unit: str | None = None) -> Traced[T]:
    """Wrap a value that is part of the schema rather than an observation.

    An ontology property list is not measured and has no source file. Saying so is more
    useful than attaching an empty provenance list and hoping nobody reads it.
    """
    return Traced[T](value=value, unit=unit, computed_by=computed_by)
