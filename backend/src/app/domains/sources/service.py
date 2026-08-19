"""Connector health rules and the source manifest join."""

from app.domains.sources.catalog import FIELD_MAPPINGS, SOURCES
from app.domains.sources.repository import SourceRepository
from app.domains.sources.schemas import ConnectorStatus, Reliability, SourceSummary

# Below this share of failed records a feed is degraded rather than broken: some rows
# landed, so downstream numbers are usable but incomplete.
_DEGRADED_FAILURE_RATE = 0.05

_CONNECTED = "Connected"
_DEGRADED = "Degraded"
_FAILED = "Failed"


def classify_connector_health(records: int, failed: int, owner: str) -> tuple[str, str | None]:
    """Turn parse counts into a status and, when it is not green, a reason.

    `records` is what survived parsing, so the denominator has to add the failures back
    — otherwise the explanation quotes a share of the wrong total.
    """
    if failed == 0:
        return _CONNECTED, None

    offered = records + failed
    if failed < records * _DEGRADED_FAILURE_RATE:
        return _DEGRADED, f"{failed} of {offered} records failed to parse from {owner}."
    return _FAILED, (
        f"{failed} of {offered} records failed to parse from {owner}; "
        "most of this feed did not load."
    )


class SourceService:
    def __init__(self, repository: SourceRepository) -> None:
        self._repository = repository

    def list_connectors(self) -> list[ConnectorStatus]:
        connectors = []
        for row in self._repository.list_connector_status():
            status, explanation = classify_connector_health(row.records, row.failed, row.owner)
            connectors.append(
                ConnectorStatus(
                    source_file=row.source_file,
                    owner=row.owner,
                    department=row.department,
                    format=row.format,
                    covers=row.describes,
                    status=status,
                    last_sync=row.last_sync,
                    records=row.records,
                    errors=row.failed,
                    explanation=explanation,
                )
            )
        return connectors

    def list_sources(self) -> list[SourceSummary]:
        """The manifest is the spine; observed counts are joined onto it.

        Iterating the manifest rather than the table means a configured feed that has
        never delivered still appears, with null counts, instead of vanishing.
        """
        observed = {row.source_file: row for row in self._repository.list_connector_status()}
        return [
            SourceSummary(
                source_file=filename,
                owner=meta["owner"],
                department=meta["department"],
                format=meta["format"],
                describes=meta["describes"],
                records=observed[filename].records if filename in observed else None,
                failed_to_parse=observed[filename].failed if filename in observed else None,
                field_mappings=FIELD_MAPPINGS.get(filename, {}),
                last_sync_at=observed[filename].last_sync if filename in observed else None,
                reliability=_reliability(observed.get(filename)),
            )
            for filename, meta in SOURCES.items()
        ]


def _reliability(row: object | None) -> Reliability | None:
    """The share of offered rows that parsed. None when the feed has never been seen."""
    if row is None:
        return None
    records = int(getattr(row, "records", 0) or 0)
    failed = int(getattr(row, "failed", 0) or 0)
    offered = records + failed
    return Reliability(
        value=round(records / offered, 4) if offered else 0.0,
        basis="rows parsed / rows offered, last pipeline run",
        records=records,
        failed=failed,
        degraded=failed > 0,
    )
