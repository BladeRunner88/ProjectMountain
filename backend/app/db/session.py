"""Engines and sessions.

Two DuckDB files, because DuckDB locks a read-write file to a single process (AGENTS.md 6.0):

    data/app.duckdb        API-owned, read-write, the only Alembic target
    <warehouse>.duckdb     pipeline-owned; the API opens it read-only and never writes it

The cost is that no SQL statement can join across the two. Do that join in Python, in the
service layer — both sides are small.
"""

from collections.abc import Iterator

from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import Settings, get_settings

# DuckDB connections are cheap and share one embedded database. A large pool buys nothing
# and multiplies write conflicts.
_POOL_SIZE = 5


def duckdb_config(settings: Settings) -> dict[str, object]:
    """The DuckDB settings every connection in this process must share.

    DuckDB refuses a second connection to a file it already holds open under a different
    configuration, so anything that opens the warehouse — engine or raw driver — has to
    pass exactly this dict. That is why it is a function and not repeated per call site.
    """
    return {"memory_limit": settings.duckdb_memory_limit, "threads": settings.duckdb_threads}


def create_app_engine(settings: Settings) -> Engine:
    """Read-write engine over the API-owned database."""
    settings.app_db_path.parent.mkdir(parents=True, exist_ok=True)
    return create_engine(
        settings.app_database_url,
        connect_args={"config": duckdb_config(settings)},
        pool_size=_POOL_SIZE,
        max_overflow=0,
        pool_pre_ping=False,
        echo=False,
    )


def create_warehouse_engine(settings: Settings) -> Engine:
    """Read-only engine over the pipeline-owned warehouse.

    `read_only` passthrough via connect_args is verified on duckdb-engine 0.17 /
    duckdb 1.5.5: an INSERT on this connection raises InvalidInputException.
    """
    return create_engine(
        settings.warehouse_database_url,
        connect_args={"read_only": True, "config": duckdb_config(settings)},
        pool_size=_POOL_SIZE,
        max_overflow=0,
        pool_pre_ping=False,
        echo=False,
    )


_settings = get_settings()

app_engine: Engine = create_app_engine(_settings)
warehouse_engine: Engine = create_warehouse_engine(_settings)

# expire_on_commit=False: otherwise attribute access after commit fires a fresh SELECT per
# attribute, which on a columnar engine is a full re-read.
AppSessionFactory = sessionmaker(app_engine, expire_on_commit=False, class_=Session)
WarehouseSessionFactory = sessionmaker(warehouse_engine, expire_on_commit=False, class_=Session)


def get_app_session() -> Iterator[Session]:
    """One read-write session per request. Rolls back on any exception."""
    with AppSessionFactory() as session:
        try:
            yield session
        except Exception:
            session.rollback()
            raise


def get_warehouse_session() -> Iterator[Session]:
    """One read-only session per request."""
    with WarehouseSessionFactory() as session:
        yield session
