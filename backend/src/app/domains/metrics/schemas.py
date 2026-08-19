"""Wire contract for reconciled metrics.

Two deliberately different shapes. A quantity metric has to show its unit composition and
which plant it was scoped to, because the reconciled total is a conversion and the reader
must be able to audit it. A count metric has neither, so it does not carry a `plant` key
at all rather than a permanently-null one.

Several fields carry a second, gaming-era name. This API was built against a payments
demonstration domain, so a mass in kilograms arrived in a field called `usd_total` and a
plant in one called `market`. The truthful names sit beside them, both are populated, and
the old ones are marked deprecated rather than removed.

They are declared as ordinary fields rather than `computed_field(deprecated=True)`:
Pydantic emits a DeprecationWarning every time it serialises one of those, which would
mean a warning per field per response.
"""

from pydantic import BaseModel, Field


class UnitComponent(BaseModel):
    """One recorded unit's contribution to a station's total, before and after conversion."""

    unit: str
    count: int
    raw_total: float
    quantity_kg: float

    currency: str = Field(deprecated=True, description="Alias for `unit`.")
    usd_total: float = Field(
        deprecated=True, description="Alias for `quantity_kg`. The value is a mass."
    )


class StationComposition(BaseModel):
    """One inspection station's share of a quantity metric."""

    station: str
    components: list[UnitComponent]
    quantity_kg: float

    provider: str = Field(deprecated=True, description="Alias for `station`.")
    usd_total: float = Field(deprecated=True, description="Alias for `quantity_kg`.")


class QuantityMetric(BaseModel):
    """A unit-converted metric, with the per-source composition that produced it."""

    metric: str = Field(description="The name that was requested, alias or otherwise")
    canonical_metric: str = Field(description="The metric that actually answered")
    plant: str | None = Field(description="None when not scoped to a single plant")
    unit: str
    reconciled_total: float
    sources: list[StationComposition]

    market: str | None = Field(deprecated=True, description="Alias for `plant`.")


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
