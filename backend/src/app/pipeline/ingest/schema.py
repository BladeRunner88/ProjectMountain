"""The warehouse tables the ingest stage produces.

DDL lives here rather than being scattered through the loaders so the shape of the
warehouse can be read in one place. These are pipeline-owned: recreated wholesale on
every run, and deliberately outside Alembic's control (see app.db.alembic_filter).
"""

from sqlalchemy import Connection, text

RAW_SCHEMA = "raw"
CLEAN_SCHEMA = "clean"
META_SCHEMA = "main"

# Provenance columns every table carries, so any row can name the file it came from.
_PROVENANCE = "source_file VARCHAR, department VARCHAR"

_TABLES: dict[str, str] = {
    f"{RAW_SCHEMA}.mes_assets": f"""
        asset_id VARCHAR, asset_name VARCHAR, historian_tag VARCHAR, serial VARCHAR,
        plant VARCHAR, unit_system VARCHAR, status VARCHAR, operator VARCHAR,
        commissioned_at VARCHAR, {_PROVENANCE}
    """,
    f"{RAW_SCHEMA}.mes_runs": f"""
        run_id VARCHAR, asset_id VARCHAR, part_name VARCHAR, supplier VARCHAR,
        started_at VARCHAR, ended_at VARCHAR, declared_cycles INTEGER, device VARCHAR,
        operator VARCHAR, {_PROVENANCE}
    """,
    f"{RAW_SCHEMA}.scada_components": f"""
        part_number VARCHAR, part_name VARCHAR, supplier_raw VARCHAR,
        nominal_cycle_seconds DOUBLE, {_PROVENANCE}
    """,
    f"{RAW_SCHEMA}.scada_cycles": f"""
        cycle_id VARCHAR, part_id VARCHAR, tag_masked VARCHAR, timestamp_raw VARCHAR,
        cycle_seconds DOUBLE, scrap_count INTEGER, outcome VARCHAR, {_PROVENANCE}
    """,
    f"{CLEAN_SCHEMA}.assets": f"""
        asset_tag VARCHAR, asset_name VARCHAR, historian_tag VARCHAR, serial VARCHAR,
        plant VARCHAR, unit_system VARCHAR, status VARCHAR, operator VARCHAR,
        commissioned_at_utc TIMESTAMP, {_PROVENANCE}
    """,
    f"{CLEAN_SCHEMA}.runs": f"""
        run_id VARCHAR, asset_tag VARCHAR, part_name VARCHAR, supplier_raw VARCHAR,
        supplier_canonical VARCHAR, started_at_utc TIMESTAMP, ended_at_utc TIMESTAMP,
        declared_cycles INTEGER, device VARCHAR, operator VARCHAR, {_PROVENANCE}
    """,
    f"{CLEAN_SCHEMA}.cycles": f"""
        cycle_id VARCHAR, part_number VARCHAR, tag_masked VARCHAR,
        supplier_canonical VARCHAR, occurred_at_utc TIMESTAMP, tz_assumed BOOLEAN,
        cycle_seconds DOUBLE, scrap_count INTEGER, outcome VARCHAR, {_PROVENANCE}
    """,
    f"{RAW_SCHEMA}.scada_channels": f"""
        channel_id VARCHAR, tag_masked VARCHAR, channel_name VARCHAR, unit VARCHAR,
        sample_rate_hz DOUBLE, baseline DOUBLE, amplitude DOUBLE, noise_sigma DOUBLE,
        status VARCHAR, {_PROVENANCE}
    """,
    # Every field name each vendor file actually contained, mapped or not. The
    # unmapped ones are the point: they are what the Meaning surface exists to show,
    # and nothing else in the warehouse records them.
    f"{CLEAN_SCHEMA}.source_fields": f"""
        source_field VARCHAR, {_PROVENANCE}
    """,
    f"{CLEAN_SCHEMA}.sensor_profiles": f"""
        channel_id VARCHAR, tag_masked VARCHAR, channel VARCHAR, unit VARCHAR,
        sample_rate_hz DOUBLE, baseline DOUBLE, amplitude DOUBLE, period_seconds DOUBLE,
        phase_seconds DOUBLE, noise_sigma DOUBLE, status VARCHAR, {_PROVENANCE}
    """,
    f"{CLEAN_SCHEMA}.components": f"""
        part_number VARCHAR, part_name VARCHAR, supplier_raw VARCHAR,
        supplier_canonical VARCHAR, nominal_cycle_seconds DOUBLE, {_PROVENANCE}
    """,
    f"{CLEAN_SCHEMA}.batches": f"""
        batch_id VARCHAR, inspection_station VARCHAR, asset_ref_masked VARCHAR,
        part_name VARCHAR, plant VARCHAR, quantity_original DOUBLE, unit_original VARCHAR,
        quantity_kg DOUBLE, disposition_raw VARCHAR, disposition VARCHAR,
        occurred_at_utc TIMESTAMP, tz_assumed BOOLEAN, {_PROVENANCE}
    """,
    f"{CLEAN_SCHEMA}.work_orders": f"""
        work_order VARCHAR, historian_tag VARCHAR, wo_type VARCHAR, priority VARCHAR,
        plant VARCHAR, scheduled_at_utc TIMESTAMP, tz_assumed BOOLEAN, raised_by VARCHAR,
        {_PROVENANCE}
    """,
    f"{CLEAN_SCHEMA}.callouts": f"""
        callout_id VARCHAR, vendor VARCHAR, equipment_ref VARCHAR, service_date DATE,
        billing_status VARCHAR, hours DOUBLE, {_PROVENANCE}
    """,
    f"{META_SCHEMA}.pipeline_stats": "key VARCHAR, value BIGINT",
    f"{META_SCHEMA}.connector_status": """
        source_file VARCHAR, owner VARCHAR, department VARCHAR, format VARCHAR,
        describes VARCHAR, records BIGINT, failed BIGINT, last_sync VARCHAR
    """,
}


def create_all(connection: Connection) -> None:
    """Drop and recreate every ingest-owned table.

    Wholesale replacement is the pipeline's normal mode, which is precisely why these
    tables must stay outside Alembic: a migration applied to them would be discarded on
    the next run, and a drop would be permanent.
    """
    for schema in (RAW_SCHEMA, CLEAN_SCHEMA):
        connection.execute(text(f"CREATE SCHEMA IF NOT EXISTS {schema}"))
    for qualified_name, columns in _TABLES.items():
        connection.execute(text(f"CREATE OR REPLACE TABLE {qualified_name} ({columns})"))


def table_names() -> tuple[str, ...]:
    return tuple(_TABLES)
