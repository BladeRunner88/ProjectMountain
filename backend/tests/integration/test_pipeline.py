"""The manufacturing pipeline, end to end, against a real DuckDB file.

Run at `small` scale, which is the entire reason that scale exists: a real warehouse in
under a second means the pipeline is tested rather than mocked.
"""

from collections.abc import Iterator

import pytest
from sqlalchemy import Engine, create_engine, text

from app.pipeline.findings.run_findings import compute_all
from app.pipeline.generate.run_generate import generate_all
from app.pipeline.ingest.run_ingest import ingest_all
from app.pipeline.manifest import SOURCES
from app.pipeline.resolve.run_resolve import resolve_all
from app.pipeline.scale import SMALL
from app.pipeline.world import World


@pytest.fixture(scope="module")
def built(tmp_path_factory: pytest.TempPathFactory) -> Iterator[tuple[Engine, World]]:
    """One warehouse, built once, shared by every assertion below."""
    directory = tmp_path_factory.mktemp("warehouse")
    raw = directory / "raw"
    world, _ = generate_all(SMALL, raw)

    engine = create_engine(f"duckdb:///{directory / 'warehouse.duckdb'}")
    with engine.begin() as connection:
        ingest_all(connection, raw)
        resolve_all(connection)
        compute_all(connection)
    yield engine, world
    engine.dispose()


def _scalar(engine: Engine, statement: str) -> int:
    with engine.connect() as connection:
        return connection.execute(text(statement)).scalar() or 0


def _rows(engine: Engine, statement: str) -> list[tuple[object, ...]]:
    with engine.connect() as connection:
        return [tuple(row) for row in connection.execute(text(statement)).all()]


def test_every_source_produces_rows(built: tuple[Engine, World]) -> None:
    engine, _ = built
    counts = dict(_rows(engine, "SELECT source_file, records FROM main.connector_status"))  # type: ignore[arg-type]

    assert set(counts) == set(SOURCES)
    assert all(count > 0 for count in counts.values()), counts


def test_the_lab_feed_reports_the_rows_it_could_not_parse(built: tuple[Engine, World]) -> None:
    """A feed that silently dropped its broken rows would look perfectly healthy."""
    engine, _ = built
    failed = _scalar(
        engine, "SELECT failed FROM main.connector_status WHERE source_file = 'qc_lab.csv'"
    )

    assert failed == SMALL.lab_malformed


def test_resolution_recovers_the_ground_truth_machines(built: tuple[Engine, World]) -> None:
    """The generated feeds describe N machines under more than N names. Resolution has to
    land on exactly N — one too many is a missed merge, one too few is a false one."""
    engine, world = built

    resolved = _scalar(engine, "SELECT count(*) FROM graph.objects WHERE type = 'Machine'")

    assert resolved == len(world.machines)


def test_every_double_registration_is_collapsed(built: tuple[Engine, World]) -> None:
    engine, world = built
    expected = sum(machine.double_registered for machine in world.machines)

    detected = _scalar(
        engine,
        "SELECT value FROM main.resolution_stats WHERE key = 'machines_registered_more_than_once'",
    )

    assert detected == expected


def test_no_link_points_at_a_missing_object(built: tuple[Engine, World]) -> None:
    engine, _ = built

    dangling = _scalar(
        engine,
        "SELECT count(*) FROM graph.links l WHERE NOT EXISTS "
        "(SELECT 1 FROM graph.objects o WHERE o.id = l.source_id) OR NOT EXISTS "
        "(SELECT 1 FROM graph.objects o WHERE o.id = l.target_id)",
    )

    assert dangling == 0


def test_every_object_type_in_the_graph_is_declared_by_the_ontology(
    built: tuple[Engine, World],
) -> None:
    from app.domains.ontology.catalog import OBJECT_TYPES

    engine, _ = built
    present = {row[0] for row in _rows(engine, "SELECT DISTINCT type FROM graph.objects")}

    assert present <= set(OBJECT_TYPES), present - set(OBJECT_TYPES)


def test_every_relationship_in_the_graph_is_declared_by_the_ontology(
    built: tuple[Engine, World],
) -> None:
    from app.domains.ontology.catalog import RELATIONSHIP_TYPES

    engine, _ = built
    present = {row[0] for row in _rows(engine, "SELECT DISTINCT rel_type FROM graph.links")}

    assert present <= set(RELATIONSHIP_TYPES), present - set(RELATIONSHIP_TYPES)


def test_no_object_property_is_named_type(built: tuple[Engine, World]) -> None:
    """The pre-refactor ontology had one, and flattening it into the API response
    overwrote the object's own ontology type on 96% of rows."""
    from app.domains.ontology.catalog import OBJECT_TYPES

    offenders = [
        object_type.name
        for object_type in OBJECT_TYPES.values()
        if "type" in object_type.properties
    ]

    assert offenders == []
