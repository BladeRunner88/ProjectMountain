"""Alembic environment.

Two things here are load-bearing:

1. `AlembicDuckDBImpl` — Alembic has no built-in DuckDB dialect, so without registering
   an impl neither autogenerate nor upgrade works at all.
2. `include_object` — the pipeline creates and recreates the raw/clean/graph/findings
   tables with `CREATE OR REPLACE TABLE`. If Alembic saw them it would propose dropping
   every one on the first autogenerate, and any migration it did apply would be silently
   discarded by the next pipeline run. Alembic owns exactly one schema: `app`.
"""

from logging.config import fileConfig
from typing import Any

from alembic import context
from alembic.ddl.impl import DefaultImpl
from sqlalchemy import Connection, engine_from_config, pool, text

from app.core.config import get_settings
from app.db.alembic_filter import include_object
from app.db.base import APP_SCHEMA
from app.db.registry import Base
from app.db.session import duckdb_config


class AlembicDuckDBImpl(DefaultImpl):
    """Teach Alembic about the duckdb dialect so autogenerate and upgrade work."""

    __dialect__ = "duckdb"


config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

settings = get_settings()

# Only fall back to Settings. A caller that already set a URL — a test pointing at a
# throwaway file, an operator migrating a restored copy — must win, or the migration
# silently runs against the wrong database.
if not config.get_main_option("sqlalchemy.url", default=None):
    config.set_main_option("sqlalchemy.url", settings.app_database_url)

target_metadata = Base.metadata


def _configure(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        include_object=include_object,
        include_schemas=True,
        version_table_schema=APP_SCHEMA,
        compare_type=True,
        compare_server_default=True,
    )


def run_migrations_offline() -> None:
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        include_object=include_object,
        include_schemas=True,
        version_table_schema=APP_SCHEMA,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    section: dict[str, Any] = config.get_section(config.config_ini_section) or {}
    connectable = engine_from_config(
        section,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
        # DuckDB refuses a second connection to a file already open in this process under
        # a different configuration. Migrations run in-process during tests, so they have
        # to present exactly the settings the application engine uses.
        connect_args={"config": duckdb_config(settings)},
    )

    with connectable.connect() as connection:
        # The version table lives in `app`, so the schema has to exist before Alembic
        # tries to read it — including on a completely empty database file.
        connection.execute(text(f"CREATE SCHEMA IF NOT EXISTS {APP_SCHEMA}"))
        connection.commit()

        _configure(connection)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
