"""Access-request persistence. Stages rows; the service owns the transaction."""

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domains.access.models import AccessRequest


class AccessRequestRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def add(self, request: AccessRequest) -> None:
        """Stage only. The service commits."""
        self._session.add(request)

    def get(self, request_id: UUID) -> AccessRequest | None:
        return self._session.scalar(select(AccessRequest).where(AccessRequest.id == request_id))

    def count(self) -> int:
        return len(list(self._session.scalars(select(AccessRequest.id))))
