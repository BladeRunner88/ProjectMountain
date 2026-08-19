"""Finding-domain errors."""

from app.core.exceptions import NotFoundError


class FindingNotFoundError(NotFoundError):
    def __init__(self, finding_id: str) -> None:
        super().__init__("finding not found")
        self.finding_id = finding_id
