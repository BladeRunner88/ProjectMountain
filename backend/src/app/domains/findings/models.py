"""Storage contract for human review of a finding.

The finding itself is pipeline output and lives in the read-only warehouse; the verdict a
person reaches about it is written per request by the API, so the two cannot share a
table or even a database file. Joining them is a Python-side merge in the service layer
(both sides are hundreds of rows), which is the cost the two-file topology buys.
"""

from datetime import datetime

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDMixin

_ID = 120
_SHORT = 120
_LONG = 4000


class FindingReview(UUIDMixin, TimestampMixin, Base):
    """One reviewer's verdict on one warehouse finding.

    Append-only: a changed mind is a new row, not an UPDATE. The current verdict is the
    latest `decided_at` for a finding, and the rows behind it are the audit trail of how
    the team got there — which is exactly what a reviewer is asked to justify later.
    """

    __tablename__ = "finding_reviews"

    # Natural key of a `findings.findings` row (`find_0001`). Not a foreign key: the
    # target lives in the other database file, so the constraint could not be enforced
    # and declaring it would be a lie.
    finding_id: Mapped[str] = mapped_column(String(_ID))
    # "confirmed" | "dismissed" | "needs-more-evidence"
    verdict: Mapped[str] = mapped_column(String(_SHORT))
    reviewer: Mapped[str] = mapped_column(String(_SHORT))
    decided_at: Mapped[datetime]
    rationale: Mapped[str | None] = mapped_column(String(_LONG))
