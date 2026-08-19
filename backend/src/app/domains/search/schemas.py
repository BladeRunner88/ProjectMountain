"""Wire contract for search."""

from pydantic import BaseModel


class SearchHit(BaseModel):
    """One matching entity.

    `matched_alias` is the point of the feature: when a query matched a raw source name
    rather than the canonical one, the reader is shown which spelling hit.
    """

    id: str
    type: str
    name: str
    connections: int
    # None when the canonical name or a property matched, so there is no alias to credit.
    matched_alias: str | None
