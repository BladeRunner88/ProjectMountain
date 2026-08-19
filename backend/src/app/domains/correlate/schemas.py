"""Wire contract for the time-window correlation view.

Two names for each list, and that needs explaining. The original names come from the
gaming demonstration domain this API was built against — `transactions`, `rounds`,
`sessions`, `campaign_sends`. The data is now manufacturing, so those names describe
nothing that exists: a "transaction" is an inspected batch, a "session" is a production
run. Renaming them outright would break any client on the old contract, so the truthful
names are added beside them and both carry the same rows. The gaming-era names are
deprecated and go away with the legacy mount.
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

    transactions: list[dict[str, Any]] = Field(deprecated=True, description="Use `batches`.")
    rounds: list[dict[str, Any]] = Field(deprecated=True, description="Use `cycles`.")
    sessions: list[dict[str, Any]] = Field(deprecated=True, description="Use `runs`.")
    campaign_sends: list[dict[str, Any]] = Field(deprecated=True, description="Use `work_orders`.")
