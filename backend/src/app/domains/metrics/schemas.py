"""Wire contract for reconciled metrics.

Two deliberately different shapes. A quantity metric has to show its unit composition and
which plant it was scoped to, because the reconciled total is a conversion and the reader
must be able to audit it. A count metric has neither, so it does not carry a `plant` key
at all rather than a permanently-null one.

The gaming-era aliases (`usd_total` for a mass in kilograms, `market` for a plant,
`currency` for a unit, `provider` for a station) are gone. They existed so the frontend
could keep reading the old names through the ontology change; nothing reads them now.
"""

from pydantic import BaseModel, Field


class UnitComponent(BaseModel):
    """One recorded unit's contribution to a station's total, before and after conversion."""

    unit: str
    count: int
    raw_total: float
    quantity_kg: float


class StationComposition(BaseModel):
    """One inspection station's share of a quantity metric."""

    station: str
    components: list[UnitComponent]
    quantity_kg: float


class QuantityMetric(BaseModel):
    """A unit-converted metric, with the per-source composition that produced it."""

    metric: str = Field(description="The name that was requested, alias or otherwise")
    canonical_metric: str = Field(description="The metric that actually answered")
    plant: str | None = Field(description="None when not scoped to a single plant")
    unit: str
    reconciled_total: float
    sources: list[StationComposition]


class SourceCount(BaseModel):
    """One source file's row count."""

    source_file: str
    count: int


class CountMetric(BaseModel):
    """A plain count metric, attributed to the file each row came from."""

    metric: str = Field(description="The name that was requested, alias or otherwise")
    canonical_metric: str = Field(description="The metric that actually answered")
    unit: str
    reconciled_total: int
    sources: list[SourceCount]
