"""The graph tables the resolve stage produces."""

from sqlalchemy import Connection, text

GRAPH_SCHEMA = "graph"
META_SCHEMA = "main"

_TABLES: dict[str, str] = {
    f"{GRAPH_SCHEMA}.objects": "id VARCHAR, type VARCHAR, properties_json VARCHAR",
    f"{GRAPH_SCHEMA}.links": "source_id VARCHAR, target_id VARCHAR, rel_type VARCHAR",
    f"{GRAPH_SCHEMA}.resolution_map": (
        "object_type VARCHAR, source_table VARCHAR, source_id VARCHAR, "
        "raw_name VARCHAR, canonical_id VARCHAR"
    ),
    f"{META_SCHEMA}.resolution_stats": "key VARCHAR, value BIGINT",
}


def create_all(connection: Connection) -> None:
    connection.execute(text(f"CREATE SCHEMA IF NOT EXISTS {GRAPH_SCHEMA}"))
    for qualified_name, columns in _TABLES.items():
        connection.execute(text(f"CREATE OR REPLACE TABLE {qualified_name} ({columns})"))
