"""Finding rows. Queries only."""

from typing import Any

from sqlalchemy import Row, Select, select
from sqlalchemy.orm import Session

from app.db.warehouse.findings_tables import findings


class FindingRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def list(self, *, finding_type: str | None, reviewer_status: str | None) -> list[Row[Any]]:
        stmt: Select[Any] = select(findings)
        if finding_type:
            stmt = stmt.where(findings.c.finding_type == finding_type)
        if reviewer_status:
            stmt = stmt.where(findings.c.reviewer_status == reviewer_status)
        return list(self._session.execute(stmt).all())

    def get(self, finding_id: str) -> Row[Any] | None:
        stmt = select(findings).where(findings.c.id == finding_id)
        return self._session.execute(stmt).one_or_none()
