"""Wire contract for the onboarding access request."""

from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field

# Mirror the column widths in models.py. The public POST is unauthenticated, so
# the wire contract — not DuckDB — has to be the thing that rejects a 10 MB body
# field before it is written.
_EMAIL_LENGTH = 320
_SHORT = 120
_MEDIUM = 255
_LONG = 4000
_SYSTEMS_MAX = 20

ShortText = Annotated[str, Field(min_length=1, max_length=_SHORT)]
MediumText = Annotated[str, Field(min_length=1, max_length=_MEDIUM)]
LongText = Annotated[str, Field(min_length=1, max_length=_LONG)]
EmailText = Annotated[str, Field(min_length=3, max_length=_EMAIL_LENGTH)]
SystemName = Annotated[str, Field(min_length=1, max_length=_SHORT)]


class AccessRequestPayload(BaseModel):
    """The request-access form, as submitted.

    Field names are snake_case because that is what the form already posts; the frontend
    maps its own camelCase state onto this shape before sending.
    """

    model_config = ConfigDict(extra="forbid")

    company_name: ShortText
    business_email: EmailText
    phone: ShortText
    website: MediumText
    industry: ShortText
    company_size: ShortText
    country: ShortText
    address_line1: MediumText
    address_line2: Annotated[str | None, Field(default=None, max_length=_MEDIUM)]
    city: ShortText
    state_region: ShortText
    postal_code: ShortText
    business_description: LongText
    use_case: LongText
    hear_about_us: Annotated[str | None, Field(default=None, max_length=_SHORT)]
    deployment_environment: ShortText
    expected_analysts: ShortText
    systems: Annotated[list[SystemName], Field(min_length=1, max_length=_SYSTEMS_MAX)]
    systems_other: Annotated[str | None, Field(default=None, max_length=_MEDIUM)]
    target_timeline: ShortText
    billing_contact_name: ShortText
    billing_contact_email: EmailText
    tax_id: Annotated[str | None, Field(default=None, max_length=_SHORT)]


class AccessRequestReceipt(BaseModel):
    """Proof of submission. Deliberately echoes nothing the caller sent back at them."""

    id: str = Field(description="Server-minted identifier for this submission")
    submitted_at: str = Field(description="UTC instant the request was accepted")
