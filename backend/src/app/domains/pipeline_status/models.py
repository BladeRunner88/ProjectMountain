"""Storage contract for pipeline execution history.

Without this the API can only report what the current warehouse contains, never when it
was produced or whether the last run succeeded — which is the difference between
/pipeline/stages reporting a real state and inventing one.
"""

from datetime import datetime
from typing import Any

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDMixin
from app.db.json_text import JsonText

_SHORT = 120
_LONG = 4000


class PipelineRun(UUIDMixin, TimestampMixin, Base):
    """One execution of the ingest pipeline."""

    __tablename__ = "pipeline_runs"

    started_at: Mapped[datetime]
    # Null while a run is in flight, and after a crash — which is itself the signal that
    # the last run never finished.
    finished_at: Mapped[datetime | None]
    # Which stages ran: "all", or a single stage name.
    stage: Mapped[str] = mapped_column(String(_SHORT))
    # "full" or "small" — the small world exists so integration tests can build a real
    # warehouse in under a second.
    scale: Mapped[str] = mapped_column(String(_SHORT))
    succeeded: Mapped[bool] = mapped_column(default=False)
    # Free-form counters the stage reported. Shape varies by stage, so it is not columns.
    stats: Mapped[dict[str, Any]] = mapped_column(JsonText, default=dict)
    error: Mapped[str | None] = mapped_column(String(_LONG))
