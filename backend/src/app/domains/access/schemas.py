"""Wire contract for the onboarding access request."""

from pydantic import BaseModel, Field


class AccessRequestPayload(BaseModel):
    """The request-access form, as submitted.

    Field names are snake_case because that is what the form already posts; the frontend
    maps its own camelCase state onto this shape before sending.
    """

    company_name: str
    business_email: str
    phone: str
    website: str
    industry: str
    company_size: str
    country: str
    address_line1: str
    address_line2: str | None = None
    city: str
    state_region: str
    postal_code: str
    business_description: str
    use_case: str
    hear_about_us: str | None = None
    deployment_environment: str
    expected_analysts: str
    systems: list[str]
    systems_other: str | None = None
    target_timeline: str
    billing_contact_name: str
    billing_contact_email: str
    tax_id: str | None = None


class AccessRequestReceipt(BaseModel):
    """Proof of submission. Deliberately echoes nothing the caller sent back at them."""

    id: str = Field(description="Server-minted identifier for this submission")
    submitted_at: str = Field(description="UTC instant the request was accepted")
