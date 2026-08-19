"""Detection, against the real warehouse."""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.domains.detection.rules import RULES
from app.main import app

_WAREHOUSE = Path(get_settings().warehouse_database_url.removeprefix("duckdb:///"))
pytestmark = pytest.mark.skipif(not _WAREHOUSE.exists(), reason=f"no warehouse at {_WAREHOUSE}")

client = TestClient(app)
AT = "2026-07-01T12:00:00Z"


def _detections(**params: object) -> dict:
    return client.get("/api/v1/detection/detections", params={"at": AT, **params}).json()


def test_every_rule_explains_why_its_threshold_is_where_it_is() -> None:
    """A threshold with no stated reason is a number somebody will change blindly."""
    for rule in client.get("/api/v1/detection/rules", params={"at": AT}).json():
        assert rule["why"], rule["id"]
        assert rule["unit"], rule["id"]


def test_the_same_instant_yields_the_same_detections() -> None:
    first = client.get("/api/v1/detection/detections", params={"at": AT})
    second = client.get("/api/v1/detection/detections", params={"at": AT})

    assert first.content == second.content


def test_a_detection_agrees_with_the_reading_behind_it() -> None:
    """Both come from one reconstruction, so they cannot drift apart."""
    detection = _detections(limit=1)["items"][0]
    snapshot = client.get(
        "/api/v1/telemetry/snapshot", params={"at": AT, "window_seconds": 0, "limit": 500}
    ).json()

    reading = next(r for r in snapshot["readings"] if r["sensor_id"] == detection["sensor_id"])
    assert reading["value"] == detection["value"]


def test_every_detection_actually_crosses_its_threshold() -> None:
    for detection in _detections(limit=100)["items"]:
        rule = next(r for r in RULES if r.id == detection["rule_id"])
        if rule.direction == "above":
            assert detection["value"] > detection["threshold"], detection
        else:
            assert detection["value"] < detection["threshold"], detection


def test_the_worst_excursion_comes_first() -> None:
    items = _detections(limit=50)["items"]
    magnitudes = [abs(item["exceeded_by"]) for item in items]

    assert magnitudes == sorted(magnitudes, reverse=True)


def test_filtering_by_rule_returns_only_that_rule() -> None:
    items = _detections(rule_id="vibration-excess", limit=50)["items"]

    assert {item["rule_id"] for item in items} <= {"vibration-excess"}


def test_filtering_by_severity_returns_only_that_severity() -> None:
    items = _detections(severity="critical", limit=50)["items"]

    assert {item["severity"] for item in items} <= {"critical"}


def test_the_firing_count_matches_the_detections_returned() -> None:
    rules = {
        r["id"]: r["firing_count"]
        for r in client.get("/api/v1/detection/rules", params={"at": AT}).json()
    }
    items = _detections(limit=500)["items"]

    for rule_id, count in rules.items():
        actual = sum(1 for item in items if item["rule_id"] == rule_id)
        assert actual == count, rule_id
