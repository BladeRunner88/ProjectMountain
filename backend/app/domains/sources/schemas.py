"""Wire contract for the vendor-source manifest and connector status."""

from pydantic import BaseModel, Field


class Reliability(BaseModel):
    """How much of what a feed offered actually parsed.

    A measured ratio, not a rating. The browser showed a confidence percentage per source
    that nothing computed; this is `records / (records + failed)` and nothing more.
    """

    value: float = Field(ge=0.0, le=1.0)
    basis: str = Field(description="What the ratio is of")
    records: int
    failed: int
    degraded: bool


class SourceSummary(BaseModel):
    """One vendor feed: who owns it, what it describes, and how its fields were mapped."""

    source_file: str
    owner: str
    department: str
    format: str
    describes: str
    # None when the feed is configured but the pipeline has not seen it yet.
    records: int | None
    failed_to_parse: int | None
    field_mappings: dict[str, str]
    last_sync_at: str | None = None
    reliability: Reliability | None = None


class ConnectorStatus(BaseModel):
    """One vendor feed as an operational connector, with a plain-language explanation."""

    source_file: str
    owner: str
    department: str
    format: str
    covers: str
    status: str
    last_sync: str
    records: int
    errors: int
    # None when the connector is healthy — there is nothing to explain.
    explanation: str | None
