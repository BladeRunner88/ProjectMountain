"""Graph-domain errors."""

from app.core.exceptions import NotFoundError


class ObjectNotFoundError(NotFoundError):
    def __init__(self, object_id: str) -> None:
        super().__init__("object not found")
        self.object_id = object_id
