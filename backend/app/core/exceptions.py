"""Domain exception base classes.

Services and repositories raise these. Only `app.main` knows about HTTP status codes,
so no layer below the router imports fastapi (AGENTS.md 4.3).
"""


class AppError(Exception):
    """Base for all domain errors."""


class NotFoundError(AppError):
    """The requested resource does not exist."""


class ConflictError(AppError):
    """The request collides with existing state."""


class PermissionDeniedError(AppError):
    """The caller is known but not allowed to do this."""


class ValidationError(AppError):
    """The request is well-formed but semantically invalid."""
