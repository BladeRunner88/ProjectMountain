"""Finding-review rules and the transaction boundary."""

from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.db.retry import with_write_retry
from app.domains.findings.models import FindingReview
from app.domains.findings.review_repository import FindingReviewRepository
from app.domains.findings.review_schemas import FindingReviewPayload, FindingReviewRecord
from app.domains.findings.service import FindingService


class FindingReviewService:
    def __init__(
        self,
        session: Session,
        repository: FindingReviewRepository,
        findings: FindingService,
    ) -> None:
        self._session = session
        self._repository = repository
        self._findings = findings

    def submit(self, finding_id: str, payload: FindingReviewPayload) -> FindingReviewRecord:
        """Record a verdict.

        The finding is fetched first and deliberately outside the retried block: it
        raises FindingNotFoundError for an id the warehouse does not have, so a verdict
        can never be filed against a finding that does not exist, and the lookup is not
        repeated on a retry.
        """
        self._findings.get(finding_id)
        decided_at = datetime.now(UTC)

        def _persist() -> FindingReview:
            review = FindingReview(
                finding_id=finding_id,
                verdict=payload.verdict,
                reviewer=payload.reviewer,
                decided_at=decided_at,
                rationale=payload.rationale,
            )
            self._repository.add(review)
            self._session.commit()
            return review

        # Safe to replay: builds a fresh row and commits, no side effect inside.
        return _to_record(with_write_retry(_persist))

    def history(self, finding_id: str) -> list[FindingReviewRecord]:
        """Every verdict for one finding, oldest first — the trail behind the current one."""
        self._findings.get(finding_id)
        return [_to_record(review) for review in self._repository.history(finding_id)]


def _to_record(review: FindingReview) -> FindingReviewRecord:
    return FindingReviewRecord(
        id=str(review.id),
        finding_id=review.finding_id,
        verdict=review.verdict,
        reviewer=review.reviewer,
        decided_at=wire_stamp(review.decided_at),
        rationale=review.rationale,
    )


def wire_stamp(moment: datetime) -> str:
    """Naive-UTC ISO with a trailing Z, matching every other timestamp on the wire."""
    if moment.tzinfo is not None:
        moment = moment.astimezone(UTC).replace(tzinfo=None)
    return moment.isoformat() + "Z"
