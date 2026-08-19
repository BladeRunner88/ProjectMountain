"""Evaluating the detection rules against reconstructed readings."""

from datetime import UTC, datetime

from app.domains.detection.models import DetectionRuleOverride
from app.domains.detection.override_service import effective_rules
from app.domains.detection.rules import RULES, DetectionRule, breaches
from app.domains.detection.schemas import Detection, DetectionPage, RuleSummary
from app.domains.telemetry.schemas import Reading
from app.domains.telemetry.service import TelemetryService

DEFAULT_SENSOR_LIMIT = 500


class DetectionService:
    """Reads through the telemetry service rather than the database.

    A detection that disagreed with the reading beside it would be worse than no
    detection, so both come from the same reconstruction rather than from two queries
    that could drift apart.
    """

    def __init__(
        self,
        telemetry: TelemetryService,
        overrides: dict[str, DetectionRuleOverride] | None = None,
    ) -> None:
        self._telemetry = telemetry
        # Resolved once per request by the dependency, not per rule: `rules()` and
        # `detections()` must agree on the same tuning or a firing count would not match
        # the detections it is counting.
        self._rules, self._disabled = effective_rules(overrides or {})

    def rules(self, at: datetime | None) -> list[RuleSummary]:
        firing = self._firing_counts(at)
        defaults = {rule.id: rule.threshold for rule in RULES}
        return [
            RuleSummary(
                id=rule.id,
                name=rule.name,
                channel=rule.channel,
                direction=rule.direction,
                threshold=rule.threshold,
                unit=rule.unit,
                severity=rule.severity,
                why=rule.why,
                # A disabled rule still reports its firing count as zero, because it is
                # not firing — but it stays in the list, so an analyst can see it exists
                # and is silenced rather than wondering where it went.
                firing_count=firing.get(rule.id, 0),
                enabled=rule.id not in self._disabled,
                default_threshold=defaults[rule.id],
                tuned=rule.threshold != defaults[rule.id] or rule.id in self._disabled,
            )
            for rule in self._rules
        ]

    def detections(
        self, *, at: datetime | None, rule_id: str | None, severity: str | None, limit: int
    ) -> DetectionPage:
        snapshot = self._telemetry.snapshot(
            at=at, window_seconds=0, channels=None, limit=DEFAULT_SENSOR_LIMIT
        )

        found = [
            detection
            for reading in snapshot.readings
            for detection in _evaluate(reading, snapshot.as_of, self._rules, self._disabled)
        ]
        if rule_id:
            found = [detection for detection in found if detection.rule_id == rule_id]
        if severity:
            found = [detection for detection in found if detection.severity == severity]

        # Worst first: the biggest excursion is the one a person should look at.
        found.sort(key=lambda detection: -abs(detection.exceeded_by))
        return DetectionPage(
            as_of=snapshot.as_of,
            tick=snapshot.tick,
            items=found[:limit],
            total=len(found),
            evaluated_sensors=len(snapshot.readings),
        )

    def _firing_counts(self, at: datetime | None) -> dict[str, int]:
        page = self.detections(at=at, rule_id=None, severity=None, limit=DEFAULT_SENSOR_LIMIT)
        counts: dict[str, int] = {}
        for detection in page.items:
            counts[detection.rule_id] = counts.get(detection.rule_id, 0) + 1
        return counts


def _evaluate(
    reading: Reading,
    at: datetime,
    rules: tuple[DetectionRule, ...],
    disabled: frozenset[str],
) -> list[Detection]:
    """Every rule this one reading breaches, skipping the ones switched off."""
    return [
        _detection(rule, reading, at)
        for rule in rules
        if rule.id not in disabled
        and rule.channel == reading.channel
        and breaches(rule, reading.value)
    ]


def _detection(rule: DetectionRule, reading: Reading, at: datetime) -> Detection:
    return Detection(
        rule_id=rule.id,
        rule_name=rule.name,
        severity=rule.severity,
        sensor_id=reading.sensor_id,
        machine_id=reading.machine_id,
        channel=rule.channel,
        value=reading.value,
        threshold=rule.threshold,
        unit=rule.unit,
        deviation_sigma=reading.deviation_sigma,
        exceeded_by=round(reading.value - rule.threshold, 4),
        at=at.astimezone(UTC),
    )
