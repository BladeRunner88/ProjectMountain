"""Detection-override persistence, against the API-owned database."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domains.detection.models import DetectionRuleOverride


class DetectionOverrideRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def add(self, override: DetectionRuleOverride) -> None:
        """Stage only. The service commits."""
        self._session.add(override)

    def active_by_rule(self) -> dict[str, DetectionRuleOverride]:
        """The adjustment currently in force for each rule.

        One query for every rule rather than one per rule: the detection endpoints
        evaluate all of them on every request.
        """
        statement = (
            select(DetectionRuleOverride)
            .where(DetectionRuleOverride.active.is_(True))
            .order_by(DetectionRuleOverride.set_at)
        )
        return {override.rule_id: override for override in self._session.scalars(statement)}

    def history(self, rule_id: str) -> list[DetectionRuleOverride]:
        """Every adjustment ever made to one rule, oldest first."""
        statement = (
            select(DetectionRuleOverride)
            .where(DetectionRuleOverride.rule_id == rule_id)
            .order_by(DetectionRuleOverride.set_at, DetectionRuleOverride.created_at)
        )
        return list(self._session.scalars(statement))

    def deactivate(self, rule_id: str) -> None:
        """Retire whatever is currently in force for a rule. Stages only."""
        statement = select(DetectionRuleOverride).where(
            DetectionRuleOverride.rule_id == rule_id,
            DetectionRuleOverride.active.is_(True),
        )
        for override in self._session.scalars(statement):
            override.active = False
