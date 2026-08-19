"""Computed operational findings. Read-only from the API; written by the findings stage."""

from sqlalchemy import Column, String, Table

from app.db.json_text import JsonText
from app.db.warehouse.metadata import warehouse_metadata

findings = Table(
    "findings",
    warehouse_metadata,
    Column("id", String),
    Column("finding_type", String),
    Column("title", String),
    Column("description", String),
    Column("sources_json", JsonText),
    Column("computed_json", JsonText),
    Column("window_json", JsonText),
    Column("entities_json", JsonText),
    # Written once by the pipeline and never updated — nothing can write them today
    # because the table is recreated on every run. Phase 6 overlays app.finding_reviews.
    Column("reviewer_status", String),
    Column("reviewed_by", String),
    Column("reviewed_at", String),
    Column("evidence_json", JsonText),
    schema="findings",
)
