"""Wire contract for detection-rule tuning."""

from pydantic import BaseModel, Field, model_validator

_SHORT = 120
_LONG = 4000


class DetectionOverridePayload(BaseModel):
    """An adjustment to one rule.

    Both fields are optional so a caller can change the threshold without re-stating the
    enabled flag, or silence a rule without touching its threshold. Omitted means "leave
    as it is", which is why they are `None`-defaulted rather than given real defaults —
    a threshold of 0.0 fires on everything and must not be reachable by omission.
    """

    threshold: float | None = None
    enabled: bool | None = None
    set_by: str = Field(min_length=1, max_length=_SHORT)
    note: str | None = Field(default=None, max_length=_LONG)

    @model_validator(mode="after")
    def _must_change_something(self) -> "DetectionOverridePayload":
        if self.threshold is None and self.enabled is None:
            raise ValueError("supply threshold, enabled, or both")
        return self


class DetectionOverrideRecord(BaseModel):
    """A stored adjustment, as read back."""

    id: str
    rule_id: str
    threshold: float | None
    enabled: bool | None
    active: bool
    set_by: str
    set_at: str
    note: str | None
