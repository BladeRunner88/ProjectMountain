"""Alembic against DuckDB.

AGENTS.md 6.6 is explicit that autogenerate is less reliable here than on Postgres and
that every migration must be run before it is committed. These tests are that run: a full
upgrade and downgrade against a throwaway file, and a check that Alembic's view of the
schema matches the models.
"""

from collections.abc import Iterator
from pathlib import Path
from uuid import uuid4

import duckdb
import pytest
from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, inspect

from app.db.base import APP_SCHEMA
from app.db.registry import Base

BACKEND_ROOT = Path(__file__).resolve().parents[2]
# Derived from the registry rather than listed: a model added without being wired into
# `db/registry.py` is invisible to autogenerate, so hardcoding the names here would let
# that mistake pass both this test and the migration.
EXPECTED_TABLES = {table.name for table in Base.metadata.sorted_tables} | {"alembic_version"}


@pytest.fixture
def alembic_config(tmp_path: Path) -> Iterator[Config]:
    """Alembic pointed at a disposable database rather than the developer's own."""
    database = tmp_path / "isildur_app.duckdb"
    config = Config(str(BACKEND_ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_ROOT / "alembic"))
    config.set_main_option("sqlalchemy.url", f"duckdb:///{database}")
    config.attributes["database_path"] = str(database)
    yield config


def _tables(config: Config) -> set[str]:
    connection = duckdb.connect(config.attributes["database_path"], read_only=True)
    try:
        rows = connection.execute(
            "SELECT table_name FROM duckdb_tables() WHERE schema_name = ?", [APP_SCHEMA]
        ).fetchall()
    finally:
        connection.close()
    return {name for (name,) in rows}


def test_upgrade_creates_every_app_table(alembic_config: Config) -> None:
    command.upgrade(alembic_config, "head")

    assert _tables(alembic_config) == EXPECTED_TABLES


def test_downgrade_removes_them_again(alembic_config: Config) -> None:
    command.upgrade(alembic_config, "head")

    command.downgrade(alembic_config, "base")

    # The version table survives by design — Alembic owns it, not the migration.
    assert _tables(alembic_config) == {"alembic_version"}


def test_the_round_trip_is_repeatable(alembic_config: Config) -> None:
    """A migration that cannot be re-applied is a migration that cannot be rolled back."""
    command.upgrade(alembic_config, "head")
    command.downgrade(alembic_config, "base")
    command.upgrade(alembic_config, "head")

    assert _tables(alembic_config) == EXPECTED_TABLES


def test_the_migration_matches_the_models(alembic_config: Config) -> None:
    """No drift: a model changed without a migration fails here, not on deploy.

    Compared by reflecting column names rather than with `compare_metadata`, which is
    unreliable on this dialect: duckdb-engine returns schema names catalog-qualified
    ("isildur_app.app"), so Alembic's `include_schemas` reflection never looks inside
    "app" and reports every existing table as newly added.
    """
    command.upgrade(alembic_config, "head")

    engine = create_engine(f"duckdb:///{alembic_config.attributes['database_path']}")
    try:
        inspector = inspect(engine)
        reflected = {
            table: {column["name"] for column in inspector.get_columns(table, schema=APP_SCHEMA)}
            for table in inspector.get_table_names(schema=APP_SCHEMA)
            if table != "alembic_version"
        }
    finally:
        engine.dispose()

    expected = {table.name: set(table.columns.keys()) for table in Base.metadata.sorted_tables}
    assert reflected == expected


def test_upgrading_leaves_pipeline_owned_schemas_untouched(alembic_config: Config) -> None:
    """The filter in env.py is what stops Alembic touching the warehouse.

    Those tables are recreated by the pipeline with CREATE OR REPLACE, so anything
    Alembic did to them would be discarded on the next run — and anything it dropped
    would be gone for real. Here the schemas exist before the migration runs, which is
    the situation that would actually occur if the two files were ever merged.
    """
    database = alembic_config.attributes["database_path"]
    connection = duckdb.connect(database)
    try:
        connection.execute("CREATE SCHEMA clean")
        connection.execute("CREATE TABLE clean.transactions (txn_id VARCHAR)")
        connection.execute("INSERT INTO clean.transactions VALUES ('NP-0000001')")
    finally:
        connection.close()

    command.upgrade(alembic_config, "head")

    connection = duckdb.connect(database, read_only=True)
    try:
        surviving = connection.execute("SELECT txn_id FROM clean.transactions").fetchall()
    finally:
        connection.close()

    assert surviving == [("NP-0000001",)]
    assert _tables(alembic_config) == EXPECTED_TABLES


def test_the_second_revision_is_the_only_head(alembic_config: Config) -> None:
    """Two heads mean `upgrade head` fails outright until someone writes a merge.

    Worth asserting rather than assuming: the whole reason revision 0002 was written as a
    single unit covering all seven tables is that two parallel branches each adding their
    own would have produced exactly that breakage.
    """
    script = ScriptDirectory.from_config(alembic_config)

    assert len(script.get_heads()) == 1


def test_the_idempotency_key_is_actually_unique(alembic_config: Config) -> None:
    """This constraint is what makes a retried revision action safe.

    `with_write_retry` replays its block on a write conflict. If a replayed POST could
    insert a second queue row carrying the same client-supplied key, the retry would
    double-apply a human decision — so the guarantee lives in the schema, not in the
    service that happens to call it today.
    """
    command.upgrade(alembic_config, "head")

    connection = duckdb.connect(alembic_config.attributes["database_path"])
    try:
        # One literal rather than an f-string over APP_SCHEMA: the schema name is a
        # constant, and building it dynamically only earns an S608 suppression.
        statement = (
            "INSERT INTO app.revision_queue_items "
            "(id, created_at, updated_at, source_tab, kind, subject_id, priority, "
            "stage, owner, summary, detail, idempotency_key, resolved_at) "
            "VALUES (?, now(), now(), 'detection', 'tuning', 'rule_01', 'standard', "
            "'open', NULL, 'threshold below floor', '{}', 'key-1', NULL)"
        )
        connection.execute(statement, [str(uuid4())])

        with pytest.raises(duckdb.ConstraintException):
            connection.execute(statement, [str(uuid4())])
    finally:
        connection.close()
