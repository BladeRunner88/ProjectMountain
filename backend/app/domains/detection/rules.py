"""The built-in detection rules.

A rule is a threshold on one channel, plus how long a reading has to hold it. Each one
states the physical reason it exists, because a threshold without a reason is a number
somebody will eventually change without knowing what it protected.

Thresholds are expressed in the channel's own unit, not in standard deviations. An
operator reasons about 78 degrees, not about 2.5 sigma, and the deviation is reported
alongside so both readings are available.

These are defaults. Phase 6 makes them editable and records who changed what.
"""

from dataclasses import dataclass

ABOVE = "above"
BELOW = "below"

CRITICAL = "critical"
WARNING = "warning"


@dataclass(frozen=True)
class DetectionRule:
    id: str
    name: str
    channel: str
    direction: str
    threshold: float
    unit: str
    severity: str
    why: str


RULES: tuple[DetectionRule, ...] = (
    DetectionRule(
        id="spindle-overheat",
        name="Spindle running hot",
        channel="spindle_temp_c",
        direction=ABOVE,
        threshold=72.0,
        unit="degC",
        severity=CRITICAL,
        why="Sustained spindle temperature above the bearing's rated envelope shortens "
        "bearing life sharply and precedes seizure.",
    ),
    DetectionRule(
        id="vibration-excess",
        name="Excess vibration",
        channel="vibration_mm_s",
        direction=ABOVE,
        threshold=3.5,
        unit="mm/s",
        severity=CRITICAL,
        why="Rising broadband vibration is the earliest mechanical signal of imbalance, "
        "misalignment or a failing bearing.",
    ),
    DetectionRule(
        id="cycle-time-drift",
        name="Cycle time drifting long",
        channel="cycle_time_s",
        direction=ABOVE,
        threshold=13.5,
        unit="s",
        severity=WARNING,
        why="A cycle consistently longer than takt means the line cannot hold its rate, "
        "even while every individual part passes inspection.",
    ),
    DetectionRule(
        id="pressure-loss",
        name="Hydraulic pressure low",
        channel="pressure_bar",
        direction=BELOW,
        threshold=5.4,
        unit="bar",
        severity=CRITICAL,
        why="Below the working envelope the clamp cannot be trusted to hold, which is a "
        "safety condition before it is a quality one.",
    ),
    DetectionRule(
        id="return-pressure-high",
        name="Return line backing up",
        channel="return_pressure_bar",
        direction=ABOVE,
        threshold=2.6,
        unit="bar",
        severity=WARNING,
        why="Return pressure climbing towards supply means the circuit is not "
        "relieving; the pump works against itself and oil temperature follows.",
    ),
    DetectionRule(
        id="oee-collapse",
        name="Effectiveness below target",
        channel="oee_pct",
        direction=BELOW,
        threshold=66.0,
        unit="%",
        severity=WARNING,
        why="A sustained drop in overall equipment effectiveness is the aggregate symptom "
        "the other rules explain individually.",
    ),
)

RULES_BY_ID = {rule.id: rule for rule in RULES}


def breaches(rule: DetectionRule, value: float) -> bool:
    """Whether one reading crosses this rule's threshold."""
    return value > rule.threshold if rule.direction == ABOVE else value < rule.threshold


def rule_exists(rule_id: str) -> bool:
    return rule_id in RULES_BY_ID
