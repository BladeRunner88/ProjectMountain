"""The resolved knowledge graph. Read-only from the API; written by the resolve stage."""

from sqlalchemy import Column, String, Table

from app.db.json_text import JsonText
from app.db.warehouse.metadata import warehouse_metadata

_SCHEMA = "graph"

objects = Table(
    "objects",
    warehouse_metadata,
    Column("id", String),
    Column("type", String),
    # Decoded to a dict on read — no repository calls json.loads. See json_text.py.
    Column("properties_json", JsonText),
    schema=_SCHEMA,
)

links = Table(
    "links",
    warehouse_metadata,
    Column("source_id", String),
    Column("target_id", String),
    Column("rel_type", String),
    schema=_SCHEMA,
)

resolution_map = Table(
    "resolution_map",
    warehouse_metadata,
    Column("object_type", String),
    Column("source_table", String),
    Column("source_id", String),
    Column("raw_name", String),
    Column("canonical_id", String),
    schema=_SCHEMA,
)
