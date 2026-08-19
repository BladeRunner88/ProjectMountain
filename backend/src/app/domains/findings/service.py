"""Finding rules: row decoding and the surrounding-context lookup."""

from datetime import datetime
from typing import Any

from sqlalchemy import Row

from app.domains.correlate.service import CorrelateService
from app.domains.findings.exceptions import FindingNotFoundError
from app.domains.findings.models import FindingReview
from app.domains.findings.repository import FindingRepository
from app.domains.findings.review_repository import FindingReviewRepository
from app.domains.findings.schemas import Finding, FindingDetail, WindowContext


class FindingService:
    def __init__(
        self,
        repository: FindingRepository,
        correlate: CorrelateService,
        reviews: FindingReviewRepository,
    ) -> None:
        self._repository = repository
        self._correlate = correlate
        self._reviews = reviews

    def list(self, *, finding_type: str | None, reviewer_status: str | None) -> list[Finding]:
        """Findings with any human verdict applied.

        The status filter is applied here rather than in SQL, because the authoritative
        status can now come from either database file and only one of them is queryable
        from the repository. Filtering in the query would silently return the pipeline's
        stale "unreviewed" for a finding a person has already confirmed.
        """
        rows = self._repository.list(finding_type=finding_type, reviewer_status=None)
        latest = self._reviews.latest_by_finding()
        findings = [
            Finding(**_apply_review(_row_to_fields(row), latest.get(row.id))) for row in rows
        ]
        if reviewer_status is None:
            return findings
        return [finding for finding in findings if finding.reviewer_status == reviewer_status]

    def get(self, finding_id: str) -> FindingDetail:
        row = self._repository.get(finding_id)
        if row is None:
            raise FindingNotFoundError(finding_id)

        history = self._reviews.history(finding_id)
        fields = _apply_review(_row_to_fields(row), history[-1] if history else None)
        return FindingDetail(**fields, context=self._context_for(fields["window"]))

    def _context_for(self, window: dict[str, str]) -> WindowContext | None:
        """Everything else that happened in the finding's own window.

        Returns None rather than an invented span when the stored window cannot be
        parsed — a reader must be able to tell "no context" from "empty context".
        """
        try:
            start = datetime.fromisoformat(window["start"])
            end = datetime.fromisoformat(window["end"])
        except (KeyError, ValueError):
            return None
        return self._correlate.between(start, end)


def _row_to_fields(row: Row[Any]) -> dict[str, Any]:
    """Map a findings row onto the wire field names.

    The five `_json` columns arrive already decoded — JsonText does that at the column
    boundary, so nothing here calls json.loads.
    """
    return {
        "id": row.id,
        "finding_type": row.finding_type,
        "title": row.title,
        "description": row.description,
        "sources": row.sources_json,
        "computed": row.computed_json,
        "window": row.window_json,
        "entities": row.entities_json,
        "reviewer_status": row.reviewer_status,
        "reviewed_by": row.reviewed_by,
        "reviewed_at": row.reviewed_at,
        "evidence": row.evidence_json,
    }


def _apply_review(fields: dict[str, Any], review: FindingReview | None) -> dict[str, Any]:
    """Overlay the current human verdict on the pipeline's own status columns.

    The warehouse can only ever say "unreviewed": it is rebuilt from source files that
    know nothing about who looked at the output. When a review exists it is the answer,
    and when none does the pipeline's value stands untouched — so a database with no
    reviews yet returns byte-identical responses to before this overlay existed.
    """
    if review is None:
        return fields
    # Imported here rather than at module scope: review_service imports this module for
    # nothing, but the reverse edge would be a genuine cycle.
    from app.domains.findings.review_schemas import STATUS_BY_VERDICT
    from app.domains.findings.review_service import wire_stamp

    return {
        **fields,
        "reviewer_status": STATUS_BY_VERDICT[review.verdict],
        "reviewed_by": review.reviewer,
        "reviewed_at": wire_stamp(review.decided_at),
    }
