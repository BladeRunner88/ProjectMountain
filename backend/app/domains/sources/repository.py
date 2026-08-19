"""Connector-status rows. Queries only."""

from sqlalchemy import Row, select
from sqlalchemy.orm import Session

from app.db.warehouse.meta_tables import connector_status


class SourceRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def list_connector_status(self) -> list[Row[tuple[str, str, str, str, str, int, int, str]]]:
        stmt = select(
            connector_status.c.source_file,
            connector_status.c.owner,
            connector_status.c.department,
            connector_status.c.format,
            connector_status.c.describes,
            connector_status.c.records,
            connector_status.c.failed,
            connector_status.c.last_sync,
        )
        return list(self._session.execute(stmt).all())
