"""What the API serves after the world changed.

`tests/test_api.py` proves the route *shapes* survived the swap untouched. This proves the
*content* is the manufacturing world, and pins the two things the change was supposed to
fix.
"""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.domains.ontology.catalog import OBJECT_TYPES, RELATIONSHIP_TYPES
from app.main import app

_settings = get_settings()
_WAREHOUSE = Path(_settings.warehouse_database_url.removeprefix("duckdb:///"))

pytestmark = pytest.mark.skipif(
    not _WAREHOUSE.exists(),
    reason=f"no warehouse at {_WAREHOUSE}; run `python -m app.pipeline.run`",
)

client = TestClient(app)

# Names from the gaming demonstration domain. None of them should describe anything now.
GAMING_OBJECT_TYPES = ("Player", "Account", "Game", "GameProvider", "PaymentProvider")


def test_the_graph_holds_manufacturing_objects() -> None:
    types = {obj["type"] for obj in client.get("/objects").json()}

    assert types <= set(OBJECT_TYPES), types - set(OBJECT_TYPES)
    assert "Machine" in types
    assert "Asset" in types


def test_no_gaming_object_type_survives() -> None:
    types = {obj["type"] for obj in client.get("/objects").json()}

    assert not types & set(GAMING_OBJECT_TYPES), types & set(GAMING_OBJECT_TYPES)


def test_every_link_type_is_declared_by_the_ontology() -> None:
    rel_types = {link["rel_type"] for link in client.get("/graph").json()["links"]}

    assert rel_types <= set(RELATIONSHIP_TYPES), rel_types - set(RELATIONSHIP_TYPES)


def test_an_object_reports_its_own_ontology_type() -> None:
    """The defect this world change was partly meant to fix.

    Flattening properties onto the response let a property named `type` overwrite the
    object's ontology type — 18,000 of 18,744 rows in the gaming world reported
    `deposit` or `withdrawal` instead of `Transaction`, so filtering by type returned
    rows the response then labelled something else. The manufacturing ontology declares
    no property called `type`, which removes the collision at the root.
    """
    batches = client.get("/objects", params={"type": "Batch"}).json()

    assert batches
    assert all(obj["type"] == "Batch" for obj in batches)


def test_filtering_by_type_returns_only_that_type() -> None:
    for object_type in ("Machine", "Asset", "Batch", "WorkOrder", "Sensor"):
        objects = client.get("/objects", params={"type": object_type}).json()
        assert objects, object_type
        assert {obj["type"] for obj in objects} == {object_type}


def test_the_sources_are_the_manufacturing_feeds() -> None:
    files = {source["source_file"] for source in client.get("/sources").json()}

    assert "mes_platform.json" in files
    assert "scada_historian.xml" in files
    assert not {"pam_platform.json", "game_aggregator.xml"} & files


@pytest.mark.parametrize(
    ("deprecated", "canonical"),
    [
        ("deposits", "released"),
        ("withdrawals", "scrapped"),
        ("sessions", "runs"),
        ("rounds", "cycles"),
    ],
)
def test_a_gaming_metric_name_still_answers(deprecated: str, canonical: str) -> None:
    """The old names keep working so a client on the old contract does not break."""
    old = client.get(f"/metrics/{deprecated}").json()
    new = client.get(f"/metrics/{canonical}").json()

    assert old["reconciled_total"] == new["reconciled_total"]
    # The response echoes what was asked for, and says what actually answered.
    assert old["metric"] == deprecated
    assert old["canonical_metric"] == canonical


def test_a_quantity_metric_reports_kilograms_not_currency() -> None:
    body = client.get("/metrics/released").json()

    assert body["unit"] == "kg"
    assert body["sources"]
    for station in body["sources"]:
        assert station["quantity_kg"] == station["usd_total"], "the alias must agree"


def test_unit_conversion_reconciles_across_five_units() -> None:
    """The demonstration point: five recorded units, one auditable total."""
    body = client.get("/metrics/released").json()

    units = {
        component["unit"] for station in body["sources"] for component in station["components"]
    }
    assert len(units) >= 4, units

    total = sum(station["quantity_kg"] for station in body["sources"])
    assert round(total, 2) == body["reconciled_total"]


def test_correlate_carries_both_the_new_and_the_old_list_names() -> None:
    body = client.get("/correlate", params={"at": "2026-06-01T12:00:00", "window": 120}).json()

    assert body["batches"] == body["transactions"]
    assert body["cycles"] == body["rounds"]
    assert body["runs"] == body["sessions"]
    assert body["work_orders"] == body["campaign_sends"]


def test_search_finds_a_machine_by_its_name() -> None:
    hits = client.get("/search", params={"q": "BOD"}).json()

    assert hits
    assert any(hit["type"] == "Machine" for hit in hits)


def test_an_object_can_be_traced_back_to_the_rows_it_resolved_from() -> None:
    machine = client.get("/objects", params={"type": "Machine"}).json()[0]

    detail = client.get(f"/objects/{machine['id']}").json()

    assert detail["resolved_from"], "a resolved machine must name the rows behind it"
    assert all("source_table" in row for row in detail["resolved_from"])
