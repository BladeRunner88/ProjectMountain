"""Finding-review persistence, against the API-owned database.

Separate from `FindingRepository`, which reads the warehouse. The two live in different
database files by design (AGENTS.md 6.0 — DuckDB allows one writer), so no query here can
join to a finding row; the service merges the two sides in Python.
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domains.findings.models import FindingReview


class FindingReviewRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def add(self, review: FindingReview) -> None:
        """Stage only. The service commits."""
        self._session.add(review)

    def history(self, finding_id: str) -> list[FindingReview]:
        """Every verdict ever recorded for one finding, oldest first."""
        statement = (
            select(FindingReview)
            .where(FindingReview.finding_id == finding_id)
            .order_by(FindingReview.decided_at, FindingReview.created_at)
        )
        return list(self._session.scalars(statement))

    def latest_by_finding(self) -> dict[str, FindingReview]:
        """The current verdict for every reviewed finding, keyed by finding id.

        One query for the whole list rather than one per finding: the findings list is
        the hot path, and a per-row lookup would reintroduce the N+1 this migration
        already removed from the graph endpoint.
        """
        statement = select(FindingReview).order_by(
            FindingReview.decided_at, FindingReview.created_at
        )
        # Ascending, so the last write for a finding is the one left in the mapping.
        return {review.finding_id: review for review in self._session.scalars(statement)}
