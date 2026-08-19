"""What the ingest stage counts while it works.

These are the numbers /stats reports. Each one exists because a reader needs to know how
much of the result rests on an assumption rather than on a stated fact.
"""

from dataclasses import dataclass, field


@dataclass
class SourceCounters:
    """Per-feed outcome. `failed` is rows the feed offered that could not be parsed."""

    records: int = 0
    failed: int = 0


@dataclass
class IngestCounters:
    records_ingested: int = 0
    records_failed_to_parse: int = 0
    timestamps_normalized: int = 0
    timestamps_assumed_tz: int = 0
    unit_conversions: int = 0
    status_values_mapped: int = 0
    per_source: dict[str, SourceCounters] = field(default_factory=dict)

    def source(self, source_file: str) -> SourceCounters:
        return self.per_source.setdefault(source_file, SourceCounters())

    def kept(self, source_file: str, rows: int = 1) -> None:
        self.records_ingested += rows
        self.source(source_file).records += rows

    def rejected(self, source_file: str, rows: int = 1) -> None:
        self.records_failed_to_parse += rows
        self.source(source_file).failed += rows

    def timestamp(self, *, assumed: bool) -> None:
        self.timestamps_normalized += 1
        if assumed:
            self.timestamps_assumed_tz += 1

    def as_stats(self) -> dict[str, int]:
        return {
            "records_ingested": self.records_ingested,
            "timestamps_normalized": self.timestamps_normalized,
            "timestamps_assumed_tz": self.timestamps_assumed_tz,
            "unit_conversions": self.unit_conversions,
            "status_values_mapped": self.status_values_mapped,
            "records_failed_to_parse": self.records_failed_to_parse,
        }
