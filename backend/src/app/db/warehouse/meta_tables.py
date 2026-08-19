"""Pipeline bookkeeping. Lives in DuckDB's default `main` schema today."""

from sqlalchemy import BigInteger, Column, String, Table

from app.db.warehouse.metadata import warehouse_metadata

_SCHEMA = "main"

pipeline_stats = Table(
    "pipeline_stats",
    warehouse_metadata,
    Column("key", String),
    Column("value", BigInteger),
    schema=_SCHEMA,
)

resolution_stats = Table(
    "resolution_stats",
    warehouse_metadata,
    Column("key", String),
    Column("value", BigInteger),
    schema=_SCHEMA,
)

connector_status = Table(
    "connector_status",
    warehouse_metadata,
    Column("source_file", String),
    Column("owner", String),
    Column("department", String),
    Column("format", String),
    Column("describes", String),
    Column("records", BigInteger),
    Column("failed", BigInteger),
    Column("last_sync", String),
    schema=_SCHEMA,
)
