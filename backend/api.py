"""Backwards-compatible entry point.

The API now lives in `src/app/`, split by domain (see AGENTS.md 4.1). This module stays so
that `uvicorn api:app`, the runbook, and anything importing `api.DB_PATH` or `api.get_con`
keep working while the migration completes.

Every name below is a view onto the new configuration — nothing here holds its own state.
"""

import sys
import types
from pathlib import Path
from typing import cast

import duckdb

from app.core.config import get_settings
from app.db.session import warehouse_engine
from app.domains.access import deps as access_deps
from app.domains.sources.catalog import SOURCES
from app.main import app

# ACCESS_REQUESTS_PATH is supplied by _ShimModule below, so it has no module-level
# assignment for ruff to find.
__all__ = [  # noqa: F822
    "ACCESS_REQUESTS_PATH",
    "CORS_ORIGINS",
    "DB_PATH",
    "SOURCES",
    "app",
    "get_con",
]

_settings = get_settings()

DB_PATH = Path(_settings.warehouse_database_url.removeprefix("duckdb:///"))
CORS_ORIGINS = _settings.cors_origins


def get_con() -> duckdb.DuckDBPyConnection:
    """A read-only cursor onto the warehouse, as the pre-refactor module exposed.

    Deliberately NOT a fresh `duckdb.connect`. DuckDB refuses a second connection to a
    file already open in this process under a different configuration, and the engine
    adds settings of its own (a custom user agent among them), so an independently opened
    connection is guaranteed to clash. A cursor is a separate handle onto the connection
    the engine already holds, so it shares the configuration and is safe to close.
    """
    with warehouse_engine.connect() as connection:
        driver_connection = connection.connection.driver_connection
        return cast("duckdb.DuckDBPyConnection", driver_connection).cursor()


class _ShimModule(types.ModuleType):
    """Makes `api.ACCESS_REQUESTS_PATH` an alias rather than a copy.

    The pre-refactor module held the archive path as a plain global, and redirecting it by
    assignment is a documented way to point submissions somewhere else. A plain global
    here would only rebind this module's name and leave the real destination untouched, so
    it is a property that reads and writes the one place that owns it.
    """

    @property
    def ACCESS_REQUESTS_PATH(self) -> Path:  # noqa: N802  # preserves the legacy name
        return access_deps.ACCESS_REQUESTS_PATH

    @ACCESS_REQUESTS_PATH.setter
    def ACCESS_REQUESTS_PATH(self, value: Path) -> None:  # noqa: N802
        access_deps.ACCESS_REQUESTS_PATH = value


sys.modules[__name__].__class__ = _ShimModule
