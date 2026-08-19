"""The seeded incidents, detected at full scale.

Full scale rather than small, and that is not laziness. The detectors compare an event
against the surrounding data's own normal: a seven-hour silence is only remarkable when
the usual gap is minutes. At small scale the median gap between cycles is eleven hours, so
the same seeded silence is genuinely unremarkable and the detector is right not to fire.
Testing it at small scale would mean weakening the thresholds until the test passed, which
would test nothing.

Structural properties — resolution, ontology conformance, dangling links — do not depend
on volume and are covered fast in test_pipeline.py.
"""

from collections.abc import Iterator

import pytest
from sqlalchemy import Engine, create_engine, text

from app.pipeline.findings.run_findings import compute_all
from app.pipeline.generate.run_generate import generate_all
from app.pipeline.ingest.run_ingest import ingest_all
from app.pipeline.resolve.run_resolve import resolve_all
from app.pipeline.scale import FULL
from app.pipeline.world import DEGRADED_PLANT, QUIET_SUPPLIER

pytestmark = pytest.mark.slow

SEEDED_FINDING_TYPES = (
    "RATE_SHIFT",
    "SOURCE_DIVERGENCE",
    "VOLUME_ANOMALY",
    "SILENT_SOURCE",
    "CO_OCCURRENCE",
)


@pytest.fixture(scope="module")
def warehouse(tmp_path_factory: pytest.TempPathFactory) -> Iterator[Engine]:
    directory = tmp_path_factory.mktemp("full-warehouse")
    raw = directory / "raw"
    generate_all(FULL, raw)

    engine = create_engine(f"duckdb:///{directory / 'warehouse.duckdb'}")
    with engine.begin() as connection:
        ingest_all(connection, raw)
        resolve_all(connection)
        compute_all(connection)
    yield engine
    engine.dispose()


def _titles(engine: Engine, finding_type: str) -> list[str]:
    with engine.connect() as connection:
        rows = connection.execute(
            text("SELECT title FROM findings.findings WHERE finding_type = :finding_type"),
            {"finding_type": finding_type},
        ).all()
    return [str(row[0]) for row in rows]


@pytest.mark.parametrize("finding_type", SEEDED_FINDING_TYPES)
def test_each_seeded_incident_is_found(finding_type: str, warehouse: Engine) -> None:
    with warehouse.connect() as connection:
        found = connection.execute(
            text("SELECT count(*) FROM findings.findings WHERE finding_type = :finding_type"),
            {"finding_type": finding_type},
        ).scalar()

    assert found, f"{finding_type} was seeded into the data but not detected"


def test_the_rate_shift_names_the_plant_whose_release_rate_was_degraded(
    warehouse: Engine,
) -> None:
    titles = _titles(warehouse, "RATE_SHIFT")

    assert any(DEGRADED_PLANT in title for title in titles), titles


def test_the_silence_names_the_supplier_that_went_quiet(warehouse: Engine) -> None:
    titles = _titles(warehouse, "SILENT_SOURCE")

    assert any(QUIET_SUPPLIER in title for title in titles), titles


def test_the_divergence_is_reported_where_one_feed_has_rows_and_the_other_does_not(
    warehouse: Engine,
) -> None:
    with warehouse.connect() as connection:
        computed = connection.execute(
            text(
                "SELECT computed_json FROM findings.findings "
                "WHERE finding_type = 'SOURCE_DIVERGENCE' LIMIT 1"
            )
        ).scalar()

    assert computed is not None
    assert '"historian_cycles": 0' in computed
    assert '"mes_runs": 0' not in computed, "a divergence needs rows on one side"


def test_co_occurrence_language_stops_short_of_claiming_cause(warehouse: Engine) -> None:
    """The one thing this product must never do is infer causation from proximity."""
    with warehouse.connect() as connection:
        descriptions = [
            str(row[0])
            for row in connection.execute(
                text(
                    "SELECT description FROM findings.findings WHERE finding_type = 'CO_OCCURRENCE'"
                )
            ).all()
        ]

    assert descriptions
    for description in descriptions:
        assert "no causal link is claimed" in description


def test_every_finding_carries_the_sources_it_was_computed_from(warehouse: Engine) -> None:
    """A number nobody can trace back is exactly what this product exists to replace."""
    with warehouse.connect() as connection:
        rows = connection.execute(
            text("SELECT id, sources_json, window_json FROM findings.findings")
        ).all()

    assert rows
    for finding_id, sources, window in rows:
        assert sources not in (None, "[]"), finding_id
        assert '"start"' in str(window) and '"end"' in str(window), finding_id
