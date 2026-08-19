"""Metric-domain errors."""

from app.core.exceptions import NotFoundError


class UnknownMetricError(NotFoundError):
    def __init__(self, name: str) -> None:
        super().__init__(f"unknown metric '{name}'")
        self.name = name
