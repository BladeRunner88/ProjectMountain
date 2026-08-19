"""Wire contract for the time-window correlation view.

The gaming-era list names (`transactions`, `rounds`, `sessions`, `campaign_sends`) are
gone. They described nothing that exists in a manufacturing world -- a "transaction" was
an inspected batch, a "session" a production run -- and were carried alongside the
truthful names only so a client on the old contract would not break mid-migration.
"""

from typing import Any

from pydantic import BaseModel, Field


class CorrelateResponse(BaseModel):
    """Everything every source recorded around an instant, in one payload.

    The point is to let a reader see co-occurrence for themselves rather than be told a
    cause: the lists are presented side by side and nothing is joined for them.
    """

    at: str
    window_minutes: int
    start: str
    end: str

    batches: list[dict[str, Any]] = Field(description="Inspected batches in the window")
    cycles: list[dict[str, Any]] = Field(description="Machine cycles in the window")
    runs: list[dict[str, Any]] = Field(description="Production runs in the window")
    work_orders: list[dict[str, Any]] = Field(description="Work orders scheduled in the window")
