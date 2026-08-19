"""Shared fixtures.

The first thing this file does is redirect the API-owned database at a temporary path,
BEFORE any application module is imported. `app.db.session` builds its engines at import
time from `get_settings()`, so by the time a test module imports the app the destination
is already fixed. Without this, running the suite would write real rows into the
developer's own database — which the pre-refactor suite could not do, because nothing in
the API wrote to DuckDB at all.
"""

import os
import tempfile
from collections.abc import Iterator
from pathlib import Path

import pytest

_TEST_DB_DIR = Path(tempfile.mkdtemp(prefix="isildur-test-"))
# Not "app.duckdb": DuckDB names the catalog after the file stem, and a catalog called
# `app` is ambiguous with the `app` schema inside it.
os.environ["ISILDUR_APP_DB_PATH"] = str(_TEST_DB_DIR / "isildur_app.duckdb")

from sqlalchemy import Engine, create_engine, text  # noqa: E402  # must follow the env setup
from sqlalchemy.orm import Session, sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from app.db.base import APP_SCHEMA, Base  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def app_database_schema() -> None:
    """Create the API-owned schema once, in the temporary database."""
    from app.db.session import app_engine

    with app_engine.begin() as connection:
        connection.execute(text(f"CREATE SCHEMA IF NOT EXISTS {APP_SCHEMA}"))
    Base.metadata.create_all(app_engine)


@pytest.fixture
def app_engine(tmp_path: Path) -> Iterator[Engine]:
    """A real, disposable app database for one test.

    A temp FILE, not ':memory:'. Every fresh connection to duckdb ':memory:' is a
    DIFFERENT empty database, so tables vanish between statements unless StaticPool
    forces a single shared connection — which is why StaticPool is set here too.
    """
    engine = create_engine(f"duckdb:///{tmp_path / 'isildur_app.duckdb'}", poolclass=StaticPool)
    with engine.begin() as connection:
        connection.execute(text(f"CREATE SCHEMA IF NOT EXISTS {APP_SCHEMA}"))
    Base.metadata.create_all(engine)
    yield engine
    engine.dispose()


@pytest.fixture
def app_session(app_engine: Engine) -> Iterator[Session]:
    factory = sessionmaker(app_engine, expire_on_commit=False, class_=Session)
    with factory() as session:
        yield session
        session.rollback()
