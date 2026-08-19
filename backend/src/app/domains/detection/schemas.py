"""Wire contract for detection."""

from datetime import datetime

from pydantic import BaseModel, Field


class RuleSummary(BaseModel):
    """One rule, and how many sensors it is currently firing on."""

    id: str
    name: str
    channel: str
    direction: str
    threshold: float
    unit: str
    severity: str
    why: str = Field(description="The physical reason the threshold is where it is")
    firing_count: int
    enabled: bool = Field(default=True, description="False when an analyst has silenced it")
    default_threshold: float = Field(
        default=0.0, description="The built-in threshold, before any tuning"
    )
    tuned: bool = Field(default=False, description="Whether a human has adjusted this rule")


class Detection(BaseModel):
    """One sensor crossing one threshold at one instant.

    Computed on request from the sensor's profile and the instant asked for — the same
    reconstruction the telemetry snapshot uses, so a detection and the reading behind it
    can never disagree.
    """

    rule_id: str
    rule_name: str
    severity: str
    sensor_id: str
    machine_id: str | None
    channel: str
    value: float
    threshold: float
    unit: str
    deviation_sigma: float
    exceeded_by: float = Field(description="How far past the threshold, in the channel's unit")
    at: datetime


class DetectionPage(BaseModel):
    """Detections at one instant, with the tick they were computed for."""

    as_of: datetime
    tick: int
    items: list[Detection]
    total: int
    evaluated_sensors: int
