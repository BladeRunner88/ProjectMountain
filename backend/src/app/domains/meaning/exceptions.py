"""Meaning-domain errors."""

from app.core.exceptions import NotFoundError


class UnknownSourceFieldError(NotFoundError):
    def __init__(self, source_file: str, source_field: str) -> None:
        super().__init__("no such field in that source")
        self.source_file = source_file
        self.source_field = source_field
