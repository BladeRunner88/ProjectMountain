"""Storage contract for submitted access requests.

This is the only genuinely OLTP table in the product: one insert per visitor, arriving
concurrently, under a single-writer database. That is exactly the case AGENTS.md 6.2's
UUID rule addresses, so it uses `UUIDMixin` — unlike the graph and findings tables, whose
ids are deterministic natural keys minted by a batch job.

It holds contact details for real people. The file it lives in is gitignored and must be
backed up encrypted.
"""

from datetime import datetime

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDMixin
from app.db.json_text import JsonText

_EMAIL_LENGTH = 320
_SHORT = 120
_MEDIUM = 255
_LONG = 4000


class AccessRequest(UUIDMixin, TimestampMixin, Base):
    """One submission of the request-access form."""

    __tablename__ = "access_requests"

    # Distinct from created_at: this is the instant the API accepted the submission and
    # echoed back to the caller, and it is part of the response contract.
    submitted_at: Mapped[datetime]

    company_name: Mapped[str] = mapped_column(String(_SHORT))
    business_email: Mapped[str] = mapped_column(String(_EMAIL_LENGTH))
    phone: Mapped[str] = mapped_column(String(_SHORT))
    website: Mapped[str] = mapped_column(String(_MEDIUM))
    industry: Mapped[str] = mapped_column(String(_SHORT))
    company_size: Mapped[str] = mapped_column(String(_SHORT))

    country: Mapped[str] = mapped_column(String(_SHORT))
    address_line1: Mapped[str] = mapped_column(String(_MEDIUM))
    address_line2: Mapped[str | None] = mapped_column(String(_MEDIUM))
    city: Mapped[str] = mapped_column(String(_SHORT))
    state_region: Mapped[str] = mapped_column(String(_SHORT))
    postal_code: Mapped[str] = mapped_column(String(_SHORT))

    business_description: Mapped[str] = mapped_column(String(_LONG))
    use_case: Mapped[str] = mapped_column(String(_LONG))
    hear_about_us: Mapped[str | None] = mapped_column(String(_SHORT))

    deployment_environment: Mapped[str] = mapped_column(String(_SHORT))
    expected_analysts: Mapped[str] = mapped_column(String(_SHORT))
    # A list of selected systems. Stored as JSON text rather than a join table: it is
    # never queried across rows, only read back whole with the submission it belongs to.
    systems: Mapped[list[str]] = mapped_column(JsonText)
    systems_other: Mapped[str | None] = mapped_column(String(_MEDIUM))
    target_timeline: Mapped[str] = mapped_column(String(_SHORT))

    billing_contact_name: Mapped[str] = mapped_column(String(_SHORT))
    billing_contact_email: Mapped[str] = mapped_column(String(_EMAIL_LENGTH))
    tax_id: Mapped[str | None] = mapped_column(String(_SHORT))
