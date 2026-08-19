"""The structural tree, against the real warehouse."""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.domains.hierarchy.schemas import TIERS
from app.main import app

_WAREHOUSE = Path(get_settings().warehouse_database_url.removeprefix("duckdb:///"))
pytestmark = pytest.mark.skipif(not _WAREHOUSE.exists(), reason=f"no warehouse at {_WAREHOUSE}")

client = TestClient(app)
FULL = {"limit": 20000}


def _tree(**params: object) -> dict:
    return client.get("/api/v1/hierarchy", params={**FULL, **params}).json()


def test_every_declared_tier_is_populated() -> None:
    tiers = {node["tier"] for node in _tree()["nodes"]}

    assert tiers == set(TIERS)


def test_only_countries_are_roots() -> None:
    for node in _tree()["nodes"]:
        if node["parent_id"] is None:
            assert node["tier"] == "country", node


def test_no_edge_points_at_a_node_that_was_not_returned() -> None:
    tree = _tree()
    ids = {node["id"] for node in tree["nodes"]}

    for edge in tree["edges"]:
        assert edge["source"] in ids
        assert edge["target"] in ids


def test_a_country_is_marked_as_derived_by_its_id() -> None:
    """Countries are not resolved entities and must not be mistakable for one."""
    countries = _tree(tier="country")["nodes"]

    assert countries
    assert all(node["id"].startswith("country:") for node in countries)


def test_descendant_machine_counts_add_up_to_the_total() -> None:
    tree = _tree()
    machines = sum(1 for node in tree["nodes"] if node["tier"] == "machine")
    by_country = sum(
        node["descendant_machines"] for node in tree["nodes"] if node["tier"] == "country"
    )

    assert by_country == machines


def test_a_root_returns_that_node_and_everything_below_it() -> None:
    subtree = _tree(root="plant_01")
    tiers = {node["tier"] for node in subtree["nodes"]}

    assert "plant" in tiers
    assert "machine" in tiers
    assert "country" not in tiers, "a subtree must not climb above its root"


def test_a_tier_filter_returns_only_that_tier() -> None:
    nodes = _tree(tier="machine")["nodes"]

    assert nodes
    assert {node["tier"] for node in nodes} == {"machine"}


def test_a_small_limit_reports_that_it_truncated() -> None:
    """Silently returning a partial tree would let a client draw a wrong picture."""
    assert client.get("/api/v1/hierarchy", params={"limit": 10}).json()["truncated"] is True
