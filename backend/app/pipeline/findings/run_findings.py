"""Stage 4 — compute operational findings across the normalised sources."""

from sqlalchemy import Connection, text

from app.pipeline.findings import cooccurrence, divergence, rate_shift, silence, volume
from app.pipeline.findings.model import Finding

FINDINGS_SCHEMA = "findings"

_COLUMNS = (
    "id VARCHAR, finding_type VARCHAR, title VARCHAR, description VARCHAR, "
    "sources_json VARCHAR, computed_json VARCHAR, window_json VARCHAR, "
    "entities_json VARCHAR, reviewer_status VARCHAR, reviewed_by VARCHAR, "
    "reviewed_at VARCHAR, evidence_json VARCHAR"
)


def compute_all(connection: Connection) -> list[Finding]:
    connection.execute(text(f"CREATE SCHEMA IF NOT EXISTS {FINDINGS_SCHEMA}"))
    connection.execute(text(f"CREATE OR REPLACE TABLE {FINDINGS_SCHEMA}.findings ({_COLUMNS})"))

    volume_findings = volume.volume_anomaly(connection)
    findings = [
        *rate_shift.rate_shift(connection),
        *divergence.source_divergence(connection),
        *volume_findings,
        *silence.silent_source(connection),
        # Reads the volume anomalies rather than recomputing them, so the two can never
        # disagree about which day was a spike.
        *cooccurrence.co_occurrence(connection, volume_findings),
    ]

    if findings:
        connection.execute(
            text(
                f"INSERT INTO {FINDINGS_SCHEMA}.findings VALUES "
                "(:id, :finding_type, :title, :description, :sources_json, :computed_json, "
                ":window_json, :entities_json, :reviewer_status, :reviewed_by, :reviewed_at, "
                ":evidence_json)"
            ),
            [
                dict(
                    zip(
                        (
                            "id",
                            "finding_type",
                            "title",
                            "description",
                            "sources_json",
                            "computed_json",
                            "window_json",
                            "entities_json",
                            "reviewer_status",
                            "reviewed_by",
                            "reviewed_at",
                            "evidence_json",
                        ),
                        finding.as_row(f"find_{index + 1:04d}"),
                        strict=True,
                    )
                )
                for index, finding in enumerate(findings)
            ],
        )
    return findings
