"""Lineage lookup.

One id space, two kinds of thing. Findings are checked first because their ids are minted
by the findings stage and cannot collide with object ids.
"""

from app.domains.findings.repository import FindingRepository
from app.domains.graph.repository import GraphRepository
from app.domains.graph.schemas import ResolvedFrom
from app.domains.lineage.exceptions import LineageNotFoundError
from app.domains.lineage.schemas import FindingLineage, ObjectLineage


class LineageService:
    def __init__(self, findings: FindingRepository, graph: GraphRepository) -> None:
        self._findings = findings
        self._graph = graph

    def trace(self, item_id: str) -> FindingLineage | ObjectLineage:
        finding = self._findings.get(item_id)
        if finding is not None:
            return FindingLineage(
                id=item_id,
                kind="finding",
                sources=finding.sources_json,
                evidence=finding.evidence_json,
                window=finding.window_json,
            )

        object_type = self._graph.get_object_type(item_id)
        if object_type is not None:
            return ObjectLineage(
                id=item_id,
                kind="object",
                type=object_type,
                raw_records=[
                    ResolvedFrom(source_table=table, source_id=source_id, raw_name=raw_name)
                    for table, source_id, raw_name in self._graph.resolved_from(item_id)
                ],
            )

        raise LineageNotFoundError(item_id)
