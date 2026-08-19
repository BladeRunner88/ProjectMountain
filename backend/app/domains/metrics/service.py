"""Metric reconciliation rules."""

from app.domains.metrics.exceptions import UnknownMetricError
from app.domains.metrics.repository import COUNTABLE_TABLES, MetricRepository
from app.domains.metrics.schemas import (
    CountMetric,
    QuantityMetric,
    SourceCount,
    StationComposition,
    UnitComponent,
)

# Quantity metrics and the batch disposition each selects.
QUANTITY_METRICS = {"released": "pass", "scrapped": "scrap", "reworked": "rework"}

_QUANTITY_UNIT = "kg"
_COUNT_UNIT = "count"
_QUANTITY_DP = 2


class MetricService:
    def __init__(self, repository: MetricRepository) -> None:
        self._repository = repository

    def get(self, name: str, plant: str | None) -> QuantityMetric | CountMetric:
        """Resolve a metric, accepting the gaming-era names as aliases.

        `metric` echoes back the name that was asked for, not the canonical one: a client
        that requested `deposits` gets `deposits`, which is what keeps the old contract
        intact. `canonical_metric` says which metric actually answered.
        """
        resolved = name
        if resolved in QUANTITY_METRICS:
            return self._quantity(resolved, plant, requested=name)
        if resolved in COUNTABLE_TABLES:
            return self._count(resolved, requested=name)
        raise UnknownMetricError(name)

    def _quantity(self, name: str, plant: str | None, *, requested: str) -> QuantityMetric:
        rows = self._repository.batch_totals(disposition=QUANTITY_METRICS[name], plant=plant)

        by_station: dict[str, list[UnitComponent]] = {}
        for station, unit, count, raw_total, quantity_kg in rows:
            by_station.setdefault(station, []).append(
                UnitComponent(
                    unit=unit,
                    count=count,
                    raw_total=round(raw_total, _QUANTITY_DP),
                    quantity_kg=round(quantity_kg, _QUANTITY_DP),
                )
            )

        compositions = [
            _composition(station, components) for station, components in by_station.items()
        ]

        return QuantityMetric(
            metric=requested,
            canonical_metric=name,
            plant=plant,
            unit=_QUANTITY_UNIT,
            reconciled_total=round(
                sum(composition.quantity_kg for composition in compositions), _QUANTITY_DP
            ),
            sources=compositions,
        )

    def _count(self, name: str, *, requested: str) -> CountMetric:
        rows = self._repository.counts_by_source(COUNTABLE_TABLES[name])
        sources = [SourceCount(source_file=source_file, count=count) for source_file, count in rows]
        return CountMetric(
            metric=requested,
            canonical_metric=name,
            unit=_COUNT_UNIT,
            reconciled_total=sum(source.count for source in sources),
            sources=sources,
        )


def _composition(station: str, components: list[UnitComponent]) -> StationComposition:
    """Sum the unrounded conversions, then round once.

    Rounding each component first would make the parts visibly disagree with the whole.
    """
    total = round(sum(component.quantity_kg for component in components), _QUANTITY_DP)
    return StationComposition(
        station=station,
        components=components,
        quantity_kg=total,
    )
