"""Detection tuning: applying overrides, and recording who made them."""

from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.db.retry import with_write_retry
from app.domains.detection.exceptions import DetectionRuleNotFoundError
from app.domains.detection.models import DetectionRuleOverride
from app.domains.detection.override_repository import DetectionOverrideRepository
from app.domains.detection.override_schemas import (
    DetectionOverridePayload,
    DetectionOverrideRecord,
)
from app.domains.detection.rules import RULES, DetectionRule, rule_exists


def effective_rules(
    overrides: dict[str, DetectionRuleOverride],
) -> tuple[tuple[DetectionRule, ...], frozenset[str]]:
    """The rules as they currently stand, and which of them are switched off.

    Returned together because a disabled rule must still appear on `/detection/rules` —
    an analyst has to be able to see that a rule exists and is silenced, which is a
    different situation from a rule that was never written.
    """
    applied: list[DetectionRule] = []
    disabled: set[str] = set()
    for rule in RULES:
        override = overrides.get(rule.id)
        if override is None:
            applied.append(rule)
            continue
        if override.enabled is False:
            disabled.add(rule.id)
        threshold = rule.threshold if override.threshold is None else override.threshold
        applied.append(replace_threshold(rule, threshold))
    return tuple(applied), frozenset(disabled)


def replace_threshold(rule: DetectionRule, threshold: float) -> DetectionRule:
    """A copy of the rule with a new threshold. `DetectionRule` is frozen by design."""
    return DetectionRule(
        id=rule.id,
        name=rule.name,
        channel=rule.channel,
        direction=rule.direction,
        threshold=threshold,
        unit=rule.unit,
        severity=rule.severity,
        why=rule.why,
    )


class DetectionOverrideService:
    def __init__(self, session: Session, repository: DetectionOverrideRepository) -> None:
        self._session = session
        self._repository = repository

    def apply(self, rule_id: str, payload: DetectionOverridePayload) -> DetectionOverrideRecord:
        """Adjust a rule, retiring whatever adjustment it carried before.

        Retire-and-insert rather than UPDATE: the tuning surface has to be able to say
        which thresholds produced a given accuracy number, and an overwritten row cannot
        answer that.
        """
        if not rule_exists(rule_id):
            raise DetectionRuleNotFoundError(rule_id)
        set_at = datetime.now(UTC)
        current = self._current(rule_id)

        def _persist() -> DetectionRuleOverride:
            self._repository.deactivate(rule_id)
            override = DetectionRuleOverride(
                rule_id=rule_id,
                # Omitted means "leave as it is", so the value in force carries forward
                # rather than reverting to the built-in default.
                threshold=payload.threshold if payload.threshold is not None else current[0],
                enabled=payload.enabled if payload.enabled is not None else current[1],
                set_by=payload.set_by,
                set_at=set_at,
                note=payload.note,
            )
            self._repository.add(override)
            self._session.commit()
            return override

        # Safe to replay: the deactivate is idempotent and the insert is rebuilt from
        # arguments fixed outside the block, `set_at` included.
        return _to_record(with_write_retry(_persist))

    def history(self, rule_id: str) -> list[DetectionOverrideRecord]:
        """Every adjustment to one rule, oldest first."""
        if not rule_exists(rule_id):
            raise DetectionRuleNotFoundError(rule_id)
        return [_to_record(override) for override in self._repository.history(rule_id)]

    def _current(self, rule_id: str) -> tuple[float | None, bool | None]:
        override = self._repository.active_by_rule().get(rule_id)
        if override is None:
            return None, None
        return override.threshold, override.enabled


def _to_record(override: DetectionRuleOverride) -> DetectionOverrideRecord:
    return DetectionOverrideRecord(
        id=str(override.id),
        rule_id=override.rule_id,
        threshold=override.threshold,
        enabled=override.enabled,
        active=override.active,
        set_by=override.set_by,
        set_at=override.set_at.astimezone(UTC).replace(tzinfo=None).isoformat() + "Z",
        note=override.note,
    )
