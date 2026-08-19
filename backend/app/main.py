"""Application assembly: settings, middleware, error translation, routers."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import anyio.to_thread
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.router import build_api_router
from app.core.config import get_settings
from app.core.exceptions import (
    AppError,
    ConflictError,
    NotFoundError,
    PermissionDeniedError,
    ValidationError,
)
from app.core.logging import configure_logging

_INTERNAL_ERROR = 500

# Checked in order, so subclasses must precede their base.
_STATUS_MAP: tuple[tuple[type[AppError], int], ...] = (
    (NotFoundError, 404),
    (ConflictError, 409),
    (PermissionDeniedError, 403),
    (ValidationError, 400),
)

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    configure_logging(settings.log_level)

    # Every DB handler is `def` and therefore runs in this threadpool. Starlette's
    # default of 40 would let 40 threads write a single-writer database at once, which
    # manufactures the very conflicts with_write_retry then has to absorb.
    anyio.to_thread.current_default_thread_limiter().total_tokens = settings.threadpool_size

    yield


app = FastAPI(
    title=settings.project_name,
    version=settings.version,
    openapi_url=f"{settings.api_prefix}/openapi.json" if settings.debug else None,
    docs_url="/docs" if settings.debug else None,
    redoc_url="/redoc" if settings.debug else None,
    lifespan=lifespan,
)

# An explicit allowlist rather than "*": the frontend sends credentialed requests, and
# browsers reject a wildcard origin on those.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(AppError)
async def handle_app_error(request: Request, exc: AppError) -> JSONResponse:
    """One error shape for the whole API. Never leaks a stack trace, SQL or a path."""
    status_code = next(
        (code for error_type, code in _STATUS_MAP if isinstance(exc, error_type)),
        _INTERNAL_ERROR,
    )
    return JSONResponse(
        status_code=status_code,
        content={"detail": str(exc), "type": exc.__class__.__name__},
    )


# One surface. The unprefixed mount that carried the pre-migration frontend through the
# cutover is gone; every path is /api/v1.
app.include_router(build_api_router())
