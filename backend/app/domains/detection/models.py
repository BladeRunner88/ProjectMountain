"""Storage contract for detection-rule tuning.

The rule definitions themselves are pipeline-owned constants; what an analyst changes is
the threshold and whether the rule is enabled at all. That change must survive a restart,
or the tuning surface is a toy.
"""

from datetime import datetime

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDMixin

_ID = 120
_SHORT = 120
_LONG = 4000


class DetectionRuleOverride(UUIDMixin, TimestampMixin, Base):
    """An analyst's adjustment to one detection rule."""

    __tablename__ = "detection_rule_overrides"

    rule_id: Mapped[str] = mapped_column(String(_ID))
    # Null means "not overridden" — distinct from 0.0, which is a real threshold that
    # fires on everything. A nullable column is the only way to say that.
    threshold: Mapped[float | None]
    enabled: Mapped[bool | None]
    active: Mapped[bool] = mapped_column(default=True)
    set_by: Mapped[str] = mapped_column(String(_SHORT))
    set_at: Mapped[datetime]
    note: Mapped[str | None] = mapped_column(String(_LONG))
