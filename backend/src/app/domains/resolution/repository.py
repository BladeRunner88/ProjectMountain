"""Resolution persistence.

Two halves in two database files: the candidate pairs come from the pipeline-owned
warehouse, the labels and weights from the API-owned database. No statement spans them,
so the service joins them in Python.
"""

from typing import NamedTuple

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.warehouse.graph_tables import resolution_map
from app.domains.resolution.models import GroundTruthLabel, ResolutionWeightOverride


class ResolvedGroup(NamedTuple):
    """The source records that resolved to one canonical entity."""

    canonical_id: str
    object_type: str
    # (source_id, source_table, raw_name), in source-id order.
    records: list[tuple[str, str, str]]


class CandidatePairRepository:
    """Reads the warehouse's record of what resolved to what."""

    def __init__(self, session: Session) -> None:
        self._session = session

    def resolved_groups(self, object_type: str | None) -> list[ResolvedGroup]:
        """Every canonical entity that more than one source record resolved to.

        Only groups of two or more are a decision anybody could have got wrong: a record
        that resolved to its own entity alone was never a judgement call, and listing it
        as a reviewable pair would bury the real merges among hundreds of non-events.
        """
        statement = select(
            resolution_map.c.canonical_id,
            resolution_map.c.source_id,
            resolution_map.c.source_table,
            resolution_map.c.raw_name,
            resolution_map.c.object_type,
        ).order_by(resolution_map.c.canonical_id, resolution_map.c.source_id)
        if object_type:
            statement = statement.where(resolution_map.c.object_type == object_type)

        records: dict[str, list[tuple[str, str, str]]] = {}
        types: dict[str, str] = {}
        for row in self._session.execute(statement):
            records.setdefault(row.canonical_id, []).append(
                (row.source_id, row.source_table, row.raw_name)
            )
            types[row.canonical_id] = row.object_type

        return [
            ResolvedGroup(canonical_id=canonical_id, object_type=types[canonical_id], records=rows)
            for canonical_id, rows in records.items()
            if len(rows) > 1
        ]


class GroundTruthRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def add(self, label: GroundTruthLabel) -> None:
        """Stage only. The service commits."""
        self._session.add(label)

    def latest_by_pair(self) -> dict[tuple[str, str], GroundTruthLabel]:
        """The current verdict for every labelled pair, keyed by its two source ids."""
        statement = select(GroundTruthLabel).order_by(
            GroundTruthLabel.labelled_at, GroundTruthLabel.created_at
        )
        # Ascending, so the last verdict for a pair wins.
        return {
            (label.left_id, label.right_id): label for label in self._session.scalars(statement)
        }


class WeightRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def add(self, weight: ResolutionWeightOverride) -> None:
        """Stage only. The service commits."""
        self._session.add(weight)

    def active(self) -> list[ResolutionWeightOverride]:
        statement = (
            select(ResolutionWeightOverride)
            .where(ResolutionWeightOverride.active.is_(True))
            .order_by(ResolutionWeightOverride.field)
        )
        return list(self._session.scalars(statement))

    def deactivate(self, field: str) -> None:
        """Retire whatever weight is in force for a field. Stages only."""
        statement = select(ResolutionWeightOverride).where(
            ResolutionWeightOverride.field == field,
            ResolutionWeightOverride.active.is_(True),
        )
        for weight in self._session.scalars(statement):
            weight.active = False
