"""Resolution-domain errors."""

from app.core.exceptions import NotFoundError


class CandidatePairNotFoundError(NotFoundError):
    def __init__(self, pair_id: str) -> None:
        super().__init__("candidate pair not found")
        self.pair_id = pair_id
