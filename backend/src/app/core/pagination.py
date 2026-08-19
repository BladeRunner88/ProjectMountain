"""Server-side pagination. Every list endpoint uses this — nothing returns an unbounded set."""

from dataclasses import dataclass
from typing import Generic, TypeVar

from pydantic import BaseModel, Field

T = TypeVar("T")

DEFAULT_LIMIT = 20
MAX_LIMIT = 100


@dataclass(frozen=True)
class LimitOffset:
    """Parsed pagination arguments, capped server-side (AGENTS.md 6.5)."""

    limit: int = DEFAULT_LIMIT
    offset: int = 0


class Page(BaseModel, Generic[T]):
    """One page of results plus the total, so a client can render a pager."""

    items: list[T]
    total: int = Field(ge=0)
    limit: int = Field(ge=1, le=MAX_LIMIT)
    offset: int = Field(ge=0)
