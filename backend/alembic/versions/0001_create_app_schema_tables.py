"""create app schema tables

Hand-edited after autogenerate, per AGENTS.md 6.6.

Three changes from the generated file:

  * `JsonText` is written as `sa.String`. The decorator only converts values in Python;
    the column really is a VARCHAR. Naming the application type here would make the
    migration import application code, which must not happen — models change, migrations
    must not.
  * The schema is created explicitly, so the migration also works against a database
    that env.py did not prepare (offline mode, a manual restore).
  * Identity and timestamp columns are declared first. The mixins put them last, which
    reads badly in a columnar store where column order is how people scan a table.

No indexes: DuckDB's zonemaps already prune range and equality filters, and the primary
key is enforced by its own ART index. Add one only when a query has been measured.

Revision ID: 4d859ee8f872
Revises:
Create Date: 2026-08-18
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "4d859ee8f872"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "app"


def upgrade() -> None:
    op.execute(f"CREATE SCHEMA IF NOT EXISTS {SCHEMA}")

    op.create_table(
        "access_requests",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("submitted_at", sa.DateTime(), nullable=False),
        sa.Column("company_name", sa.String(length=120), nullable=False),
        sa.Column("business_email", sa.String(length=320), nullable=False),
        sa.Column("phone", sa.String(length=120), nullable=False),
        sa.Column("website", sa.String(length=255), nullable=False),
        sa.Column("industry", sa.String(length=120), nullable=False),
        sa.Column("company_size", sa.String(length=120), nullable=False),
        sa.Column("country", sa.String(length=120), nullable=False),
        sa.Column("address_line1", sa.String(length=255), nullable=False),
        sa.Column("address_line2", sa.String(length=255), nullable=True),
        sa.Column("city", sa.String(length=120), nullable=False),
        sa.Column("state_region", sa.String(length=120), nullable=False),
        sa.Column("postal_code", sa.String(length=120), nullable=False),
        sa.Column("business_description", sa.String(length=4000), nullable=False),
        sa.Column("use_case", sa.String(length=4000), nullable=False),
        sa.Column("hear_about_us", sa.String(length=120), nullable=True),
        sa.Column("deployment_environment", sa.String(length=120), nullable=False),
        sa.Column("expected_analysts", sa.String(length=120), nullable=False),
        sa.Column("systems", sa.String(), nullable=False),
        sa.Column("systems_other", sa.String(length=255), nullable=True),
        sa.Column("target_timeline", sa.String(length=120), nullable=False),
        sa.Column("billing_contact_name", sa.String(length=120), nullable=False),
        sa.Column("billing_contact_email", sa.String(length=320), nullable=False),
        sa.Column("tax_id", sa.String(length=120), nullable=True),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_access_requests")),
        schema=SCHEMA,
    )

    op.create_table(
        "pipeline_runs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("started_at", sa.DateTime(), nullable=False),
        sa.Column("finished_at", sa.DateTime(), nullable=True),
        sa.Column("stage", sa.String(length=120), nullable=False),
        sa.Column("scale", sa.String(length=120), nullable=False),
        sa.Column("succeeded", sa.Boolean(), nullable=False),
        sa.Column("stats", sa.String(), nullable=False),
        sa.Column("error", sa.String(length=4000), nullable=True),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_pipeline_runs")),
        schema=SCHEMA,
    )


def downgrade() -> None:
    # Forward-only in production, but written so the round trip can be tested.
    op.drop_table("pipeline_runs", schema=SCHEMA)
    op.drop_table("access_requests", schema=SCHEMA)
