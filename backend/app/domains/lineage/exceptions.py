"""Lineage-domain errors."""

from app.core.exceptions import NotFoundError


class LineageNotFoundError(NotFoundError):
    def __init__(self, item_id: str) -> None:
        super().__init__("no object or finding with that id")
        self.item_id = item_id
