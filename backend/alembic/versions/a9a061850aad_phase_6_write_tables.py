"""phase 6 write tables

Hand-edited after autogenerate, per AGENTS.md 6.6.

Three changes from the generated file:

  * The `access_requests` and `pipeline_runs` blocks are removed. Autogenerate ran
    against a database standing at base, so it proposed re-creating both; they belong to
    revision 4d859ee8f872 and creating them again here would fail on any database that
    has actually been upgraded.
  * `JsonText` renders as `sa.String`, same as in 0001 — the decorator converts values in
    Python, the column really is a VARCHAR, and a migration must never import
    application code.
  * `down_revision` is pinned to 4d859ee8f872 so this stays a single head. Two
    concurrent 0002s would branch, and Alembic would refuse to upgrade without a merge.

The unique constraints are load-bearing, not tidiness: `revision_queue_items`
`idempotency_key` is what makes a retried action collide instead of double-applying a
decision, and `revision_audit_entries.sequence` is what stops two writers claiming the
same link in the hash chain.

Revision ID: a9a061850aad
Revises: 4d859ee8f872
Create Date: 2026-08-19
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "a9a061850aad"
down_revision: str | None = "4d859ee8f872"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "app"


def upgrade() -> None:
    op.create_table(
        "finding_reviews",
        sa.Column("finding_id", sa.String(length=120), nullable=False),
        sa.Column("verdict", sa.String(length=120), nullable=False),
        sa.Column("reviewer", sa.String(length=120), nullable=False),
        sa.Column("decided_at", sa.DateTime(), nullable=False),
        sa.Column("rationale", sa.String(length=4000), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_finding_reviews")),
        schema=SCHEMA,
    )

    op.create_table(
        "revision_queue_items",
        sa.Column("source_tab", sa.String(length=120), nullable=False),
        sa.Column("kind", sa.String(length=120), nullable=False),
        sa.Column("subject_id", sa.String(length=120), nullable=False),
        sa.Column("priority", sa.String(length=120), nullable=False),
        sa.Column("stage", sa.String(length=120), nullable=False),
        sa.Column("owner", sa.String(length=120), nullable=True),
        sa.Column("summary", sa.String(length=4000), nullable=False),
        sa.Column("detail", sa.String(), nullable=False),
        sa.Column("idempotency_key", sa.String(length=120), nullable=True),
        sa.Column("resolved_at", sa.DateTime(), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_revision_queue_items")),
        sa.UniqueConstraint(
            "idempotency_key", name=op.f("uq_revision_queue_items_idempotency_key")
        ),
        schema=SCHEMA,
    )

    op.create_table(
        "revision_audit_entries",
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("queue_item_id", sa.String(length=120), nullable=True),
        sa.Column("actor", sa.String(length=120), nullable=False),
        sa.Column("action", sa.String(length=120), nullable=False),
        sa.Column("occurred_at", sa.DateTime(), nullable=False),
        sa.Column("payload", sa.String(), nullable=False),
        sa.Column("seal", sa.String(length=120), nullable=False),
        sa.Column("prev_seal", sa.String(length=120), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_revision_audit_entries")),
        sa.UniqueConstraint("sequence", name=op.f("uq_revision_audit_entries_sequence")),
        schema=SCHEMA,
    )

    op.create_table(
        "resolution_weight_overrides",
        sa.Column("field", sa.String(length=120), nullable=False),
        sa.Column("weight", sa.Float(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("set_by", sa.String(length=120), nullable=False),
        sa.Column("set_at", sa.DateTime(), nullable=False),
        sa.Column("note", sa.String(length=4000), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_resolution_weight_overrides")),
        schema=SCHEMA,
    )

    op.create_table(
        "ground_truth_labels",
        sa.Column("left_id", sa.String(length=120), nullable=False),
        sa.Column("right_id", sa.String(length=120), nullable=False),
        sa.Column("label", sa.String(length=120), nullable=False),
        sa.Column("labelled_by", sa.String(length=120), nullable=False),
        sa.Column("labelled_at", sa.DateTime(), nullable=False),
        sa.Column("score_at_labelling", sa.Float(), nullable=True),
        sa.Column("note", sa.String(length=4000), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_ground_truth_labels")),
        schema=SCHEMA,
    )

    op.create_table(
        "detection_rule_overrides",
        sa.Column("rule_id", sa.String(length=120), nullable=False),
        sa.Column("threshold", sa.Float(), nullable=True),
        sa.Column("enabled", sa.Boolean(), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("set_by", sa.String(length=120), nullable=False),
        sa.Column("set_at", sa.DateTime(), nullable=False),
        sa.Column("note", sa.String(length=4000), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_detection_rule_overrides")),
        schema=SCHEMA,
    )

    op.create_table(
        "context_rule_overrides",
        sa.Column("source_file", sa.String(length=120), nullable=False),
        sa.Column("source_field", sa.String(length=120), nullable=False),
        sa.Column("target_property", sa.String(length=120), nullable=False),
        sa.Column("transform", sa.String(length=120), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("bound_by", sa.String(length=120), nullable=False),
        sa.Column("bound_at", sa.DateTime(), nullable=False),
        sa.Column("note", sa.String(length=4000), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_context_rule_overrides")),
        schema=SCHEMA,
    )


def downgrade() -> None:
    op.drop_table("context_rule_overrides", schema=SCHEMA)
    op.drop_table("detection_rule_overrides", schema=SCHEMA)
    op.drop_table("ground_truth_labels", schema=SCHEMA)
    op.drop_table("resolution_weight_overrides", schema=SCHEMA)
    op.drop_table("revision_audit_entries", schema=SCHEMA)
    op.drop_table("revision_queue_items", schema=SCHEMA)
    op.drop_table("finding_reviews", schema=SCHEMA)
