"""Wire contract for lineage.

Two shapes behind one path, because the two things a reader traces are genuinely
different: a finding is traced back to the sources and evidence that computed it, an
object back to the raw rows that resolved into it. `kind` is the discriminator.
"""

from typing import Any, Literal

from pydantic import BaseModel

from app.domains.findings.schemas import FindingWindow
from app.domains.graph.schemas import ResolvedFrom


class FindingLineage(BaseModel):
    """Where a finding's numbers came from."""

    id: str
    kind: Literal["finding"]
    sources: list[str]
    evidence: dict[str, Any]
    window: FindingWindow


class ObjectLineage(BaseModel):
    """Which raw source rows were resolved into this canonical object."""

    id: str
    kind: Literal["object"]
    type: str
    raw_records: list[ResolvedFrom]
