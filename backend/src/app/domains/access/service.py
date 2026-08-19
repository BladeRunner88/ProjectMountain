"""Access-request rules and the transaction boundary."""

from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.db.retry import with_write_retry
from app.domains.access.archive import AccessRequestArchive
from app.domains.access.models import AccessRequest
from app.domains.access.repository import AccessRequestRepository
from app.domains.access.schemas import AccessRequestPayload, AccessRequestReceipt


class AccessRequestService:
    def __init__(
        self,
        session: Session,
        repository: AccessRequestRepository,
        archive: AccessRequestArchive,
    ) -> None:
        self._session = session
        self._repository = repository
        self._archive = archive

    def submit(self, payload: AccessRequestPayload) -> AccessRequestReceipt:
        submitted_at = datetime.now(UTC)

        def _persist() -> AccessRequest:
            request = AccessRequest(submitted_at=submitted_at, **payload.model_dump())
            self._repository.add(request)
            self._session.commit()
            return request

        # Safe to replay: it builds a fresh row and commits, with no side effect inside.
        request = with_write_retry(_persist)

        stamp = _wire_stamp(submitted_at)
        # Deliberately outside the retried block. Appending is not idempotent, so a
        # replay would write the submission to the archive twice.
        self._archive.append({"id": str(request.id), "submitted_at": stamp, **payload.model_dump()})
        return AccessRequestReceipt(id=str(request.id), submitted_at=stamp)


def _wire_stamp(moment: datetime) -> str:
    """A naive-UTC ISO string with a trailing Z.

    The offset is dropped rather than rendered as `+00:00`: the format is part of the
    response contract and clients already parse it this way.
    """
    return moment.replace(tzinfo=None).isoformat() + "Z"
