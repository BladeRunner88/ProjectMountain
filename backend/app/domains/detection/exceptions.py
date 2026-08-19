"""Detection-domain errors."""

from app.core.exceptions import NotFoundError


class DetectionRuleNotFoundError(NotFoundError):
    def __init__(self, rule_id: str) -> None:
        super().__init__("detection rule not found")
        self.rule_id = rule_id
