"""Normalised vendor data produced by the ingest stage. Read-only from the API.

These mirror the DDL in `app.pipeline.ingest.schema`. Two definitions of the same tables is
not ideal, but the alternative couples the API's read path to the pipeline's write path,
and the pipeline recreates these tables wholesale on every run. The end-to-end pipeline
test is what keeps the two honest.
"""

from sqlalchemy import Boolean, Column, Date, DateTime, Float, Integer, String, Table

from app.db.warehouse.metadata import warehouse_metadata

_SCHEMA = "clean"

assets = Table(
    "assets",
    warehouse_metadata,
    Column("asset_tag", String),
    Column("asset_name", String),
    Column("historian_tag", String),
    Column("serial", String),
    Column("plant", String),
    Column("unit_system", String),
    Column("status", String),
    Column("operator", String),
    Column("commissioned_at_utc", DateTime),
    Column("source_file", String),
    Column("department", String),
    schema=_SCHEMA,
)

runs = Table(
    "runs",
    warehouse_metadata,
    Column("run_id", String),
    Column("asset_tag", String),
    Column("part_name", String),
    Column("supplier_raw", String),
    Column("supplier_canonical", String),
    Column("started_at_utc", DateTime),
    Column("ended_at_utc", DateTime),
    Column("declared_cycles", Integer),
    Column("device", String),
    Column("operator", String),
    Column("source_file", String),
    Column("department", String),
    schema=_SCHEMA,
)

cycles = Table(
    "cycles",
    warehouse_metadata,
    Column("cycle_id", String),
    Column("part_number", String),
    Column("tag_masked", String),
    Column("supplier_canonical", String),
    Column("occurred_at_utc", DateTime),
    Column("tz_assumed", Boolean),
    Column("cycle_seconds", Float),
    Column("scrap_count", Integer),
    Column("outcome", String),
    Column("source_file", String),
    Column("department", String),
    schema=_SCHEMA,
)

components = Table(
    "components",
    warehouse_metadata,
    Column("part_number", String),
    Column("part_name", String),
    Column("supplier_raw", String),
    Column("supplier_canonical", String),
    Column("nominal_cycle_seconds", Float),
    Column("source_file", String),
    Column("department", String),
    schema=_SCHEMA,
)

batches = Table(
    "batches",
    warehouse_metadata,
    Column("batch_id", String),
    Column("inspection_station", String),
    Column("asset_ref_masked", String),
    Column("part_name", String),
    Column("plant", String),
    Column("quantity_original", Float),
    Column("unit_original", String),
    Column("quantity_kg", Float),
    Column("disposition_raw", String),
    Column("disposition", String),
    Column("occurred_at_utc", DateTime),
    Column("tz_assumed", Boolean),
    Column("source_file", String),
    Column("department", String),
    schema=_SCHEMA,
)

work_orders = Table(
    "work_orders",
    warehouse_metadata,
    Column("work_order", String),
    Column("historian_tag", String),
    Column("wo_type", String),
    Column("priority", String),
    Column("plant", String),
    Column("scheduled_at_utc", DateTime),
    Column("tz_assumed", Boolean),
    Column("raised_by", String),
    Column("source_file", String),
    Column("department", String),
    schema=_SCHEMA,
)

callouts = Table(
    "callouts",
    warehouse_metadata,
    Column("callout_id", String),
    Column("vendor", String),
    Column("equipment_ref", String),
    Column("service_date", Date),
    Column("billing_status", String),
    Column("hours", Float),
    Column("source_file", String),
    Column("department", String),
    schema=_SCHEMA,
)

sensor_profiles = Table(
    "sensor_profiles",
    warehouse_metadata,
    Column("channel_id", String),
    Column("tag_masked", String),
    Column("channel", String),
    Column("unit", String),
    Column("sample_rate_hz", Float),
    Column("baseline", Float),
    Column("amplitude", Float),
    Column("period_seconds", Float),
    Column("phase_seconds", Float),
    Column("noise_sigma", Float),
    Column("status", String),
    Column("source_file", String),
    Column("department", String),
    schema=_SCHEMA,
)

# What /health counts as "events" — every observation the pipeline ingested.
EVENT_TABLES = (batches, cycles, runs, work_orders, callouts)

source_fields = Table(
    "source_fields",
    warehouse_metadata,
    Column("source_field", String),
    Column("source_file", String),
    Column("department", String),
    schema=_SCHEMA,
)
