"""Wire contract for human review of a finding."""

from typing import Literal

from pydantic import BaseModel, Field

# Closed set, enforced at the boundary. The database column is a plain VARCHAR — DuckDB
# has no CHECK enforcement worth relying on here — so this Literal is the only thing
# stopping a typo becoming a permanent, unqueryable verdict.
Verdict = Literal["confirmed", "dismissed", "needs-more-evidence"]

_SHORT = 120
_LONG = 4000

# The `reviewer_status` column the pipeline seeds reads "Open", and the frontend renders
# it verbatim. A verdict has to land in that same vocabulary or `?status=` would need two
# spellings — one for findings a person has touched and one for the rest.
STATUS_BY_VERDICT: dict[str, str] = {
    "confirmed": "Confirmed",
    "dismissed": "Dismissed",
    "needs-more-evidence": "Needs more evidence",
}


class FindingReviewPayload(BaseModel):
    """A reviewer's verdict, as submitted."""

    verdict: Verdict
    reviewer: str = Field(min_length=1, max_length=_SHORT)
    rationale: str | None = Field(default=None, max_length=_LONG)


class FindingReviewRecord(BaseModel):
    """A stored verdict, as read back."""

    id: str
    finding_id: str
    verdict: Verdict
    reviewer: str
    decided_at: str
    rationale: str | None
