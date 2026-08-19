"""The schema filter that keeps Alembic out of the pipeline's tables."""

from sqlalchemy import Column, MetaData, String, Table

from app.db.alembic_filter import include_object

_metadata = MetaData()


def _table(name: str, schema: str) -> Table:
    return Table(name, _metadata, Column("id", String), schema=schema)


def test_the_api_owned_schema_is_included() -> None:
    assert include_object(_table("access_requests", "app"), "access_requests", "table", False, None)


def test_pipeline_owned_schemas_are_excluded() -> None:
    for schema in ("raw", "clean", "graph", "findings"):
        table = _table("anything", schema)
        assert not include_object(table, "anything", "table", False, None), schema


def test_an_unqualified_table_is_excluded() -> None:
    """DuckDB's default schema is `main`. Anything landing there is not ours to manage."""
    assert not include_object(_table("stray", None), "stray", "table", False, None)


def test_non_table_objects_are_left_alone() -> None:
    """Columns and constraints are filtered by the table they belong to, not themselves."""
    assert include_object(object(), "some_column", "column", False, None)
