"""Tuning a rule changes what the rule reports.

The tuning surface is worthless if an override is only recorded: what matters is that
the threshold a person set is the threshold the detections are evaluated against, and
that both `/detection/rules` and `/detection/detections` agree about it.
"""

from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.db.session import AppSessionFactory
from app.domains.detection.models import DetectionRuleOverride
from app.main import app

RULE = "spindle-overheat"
# Fixed instant, so a reading never changes underneath an assertion — the telemetry
# reconstruction is deterministic for a given `at`.
AT = "2026-08-18T09:42:35Z"


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture(autouse=True)
def _clear_overrides() -> None:
    with AppSessionFactory() as session:
        for override in session.query(DetectionRuleOverride).all():
            session.delete(override)
        session.commit()


def _rule(client: TestClient, rule_id: str = RULE) -> dict[str, Any]:
    rules = client.get("/api/v1/detection/rules", params={"at": AT}).json()
    return next(rule for rule in rules if rule["id"] == rule_id)


def test_an_untuned_rule_reports_its_built_in_threshold(client: TestClient) -> None:
    rule = _rule(client)

    assert rule["threshold"] == rule["default_threshold"]
    assert rule["tuned"] is False
    assert rule["enabled"] is True


def test_lowering_the_threshold_makes_the_rule_fire_more(client: TestClient) -> None:
    """The whole point. An override that did not reach the evaluator would be decoration."""
    before = _rule(client)

    response = client.patch(
        f"/api/v1/detection/rules/{RULE}",
        json={"threshold": before["default_threshold"] - 15.0, "set_by": "a.mensah"},
    )
    assert response.status_code == 200

    after = _rule(client)
    assert after["threshold"] == before["default_threshold"] - 15.0
    assert after["tuned"] is True
    assert after["firing_count"] > before["firing_count"]


def test_the_detections_endpoint_agrees_with_the_tuned_threshold(client: TestClient) -> None:
    """Two endpoints, one tuning. A firing count that did not match its own detections
    would send an analyst hunting for a detection that was never there."""
    client.patch(
        f"/api/v1/detection/rules/{RULE}",
        json={"threshold": 40.0, "set_by": "a.mensah"},
    )

    rule = _rule(client)
    detections = client.get(
        "/api/v1/detection/detections", params={"at": AT, "rule_id": RULE, "limit": 500}
    ).json()

    assert detections["total"] == rule["firing_count"]
    assert all(item["threshold"] == 40.0 for item in detections["items"])


def test_silencing_a_rule_stops_its_detections_without_hiding_the_rule(
    client: TestClient,
) -> None:
    client.patch(
        f"/api/v1/detection/rules/{RULE}",
        json={"threshold": 40.0, "set_by": "a.mensah"},
    )
    assert _rule(client)["firing_count"] > 0

    client.patch(f"/api/v1/detection/rules/{RULE}", json={"enabled": False, "set_by": "a.mensah"})

    silenced = _rule(client)
    assert silenced["enabled"] is False
    assert silenced["firing_count"] == 0
    # Still listed: "silenced" and "never existed" must not look the same.
    assert silenced["id"] == RULE
    detections = client.get(
        "/api/v1/detection/detections", params={"at": AT, "rule_id": RULE}
    ).json()
    assert detections["items"] == []


def test_silencing_does_not_discard_the_threshold_someone_set(client: TestClient) -> None:
    """PATCH semantics: an omitted field means "leave it", not "reset it"."""
    client.patch(f"/api/v1/detection/rules/{RULE}", json={"threshold": 40.0, "set_by": "a.mensah"})

    client.patch(
        f"/api/v1/detection/rules/{RULE}", json={"enabled": False, "set_by": "s.lindqvist"}
    )

    assert _rule(client)["threshold"] == 40.0


def test_other_rules_are_untouched(client: TestClient) -> None:
    other = _rule(client, "vibration-excess")

    client.patch(f"/api/v1/detection/rules/{RULE}", json={"threshold": 40.0, "set_by": "a.mensah"})

    assert _rule(client, "vibration-excess") == other


def test_every_adjustment_stays_readable(client: TestClient) -> None:
    client.patch(f"/api/v1/detection/rules/{RULE}", json={"threshold": 60.0, "set_by": "a.mensah"})
    client.patch(
        f"/api/v1/detection/rules/{RULE}",
        json={"threshold": 40.0, "set_by": "s.lindqvist", "note": "Still missing the 3am event."},
    )

    history = client.get(f"/api/v1/detection/rules/{RULE}/history").json()

    assert [entry["threshold"] for entry in history] == [60.0, 40.0]
    assert [entry["active"] for entry in history] == [False, True]
    assert history[-1]["set_by"] == "s.lindqvist"


def test_an_empty_adjustment_is_rejected(client: TestClient) -> None:
    """Neither field supplied means the request asks for nothing — and would otherwise
    write a row recording that nothing changed."""
    response = client.patch(f"/api/v1/detection/rules/{RULE}", json={"set_by": "a.mensah"})

    assert response.status_code == 422


def test_an_unknown_rule_is_rejected(client: TestClient) -> None:
    response = client.patch(
        "/api/v1/detection/rules/not-a-rule", json={"threshold": 1.0, "set_by": "a.mensah"}
    )

    assert response.status_code == 404


def test_tuning_is_not_on_the_legacy_unprefixed_surface(client: TestClient) -> None:
    response = client.patch(
        f"/detection/rules/{RULE}", json={"threshold": 40.0, "set_by": "a.mensah"}
    )

    assert response.status_code == 404
