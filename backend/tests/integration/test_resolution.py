"""Candidate pairs, human labels, and the metrics that depend on them.

The point of this domain is that accuracy is measured against pairs a person judged, not
asserted by the resolver about itself. These tests are mostly about that distinction.
"""

from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.db.session import AppSessionFactory
from app.domains.resolution.models import GroundTruthLabel, ResolutionWeightOverride
from app.main import app


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture(autouse=True)
def _clear() -> None:
    with AppSessionFactory() as session:
        for label in session.query(GroundTruthLabel).all():
            session.delete(label)
        for weight in session.query(ResolutionWeightOverride).all():
            session.delete(weight)
        session.commit()


def _pairs(client: TestClient, **params: Any) -> dict[str, Any]:
    response = client.get("/api/v1/resolution/pairs", params={"limit": 100, **params})
    assert response.status_code == 200
    body: dict[str, Any] = response.json()
    return body


def test_only_real_merges_are_listed(client: TestClient) -> None:
    """A record that resolved to its own entity alone was never a judgement call.

    Listing those would bury the handful of genuine merges among hundreds of non-events.
    """
    page = _pairs(client)

    assert page["total"] > 0
    for pair in page["items"]:
        assert pair["left"]["source_id"] != pair["right"]["source_id"]
        assert pair["id"] == "::".join(
            sorted([pair["left"]["source_id"], pair["right"]["source_id"]])
        )


def test_pairs_arrive_least_similar_first(client: TestClient) -> None:
    """The least similar pair the resolver merged anyway is the likeliest mistake."""
    scores = [pair["score"] for pair in _pairs(client)["items"]]

    assert scores == sorted(scores)


def test_a_pair_id_is_stable_whichever_way_round_it_is_read(client: TestClient) -> None:
    """A row id would not survive the pipeline re-minting its candidate list."""
    pair = _pairs(client)["items"][0]

    fetched = client.get(f"/api/v1/resolution/pairs/{pair['id']}").json()

    assert fetched["id"] == pair["id"]
    assert fetched["score"] == pair["score"]


def test_an_unjudged_pair_reports_no_label_rather_than_a_guess(client: TestClient) -> None:
    pair = _pairs(client)["items"][0]

    assert pair["label"] is None
    assert pair["labelled_by"] is None


def test_a_label_sticks_to_the_pair(client: TestClient) -> None:
    pair = _pairs(client)["items"][0]

    created = client.post(
        f"/api/v1/resolution/pairs/{pair['id']}/label",
        json={"label": "match", "labelled_by": "j.okafor", "note": "Same nameplate serial."},
    )

    assert created.status_code == 201
    body = created.json()
    assert body["label"] == "match"
    assert body["labelled_by"] == "j.okafor"
    assert client.get(f"/api/v1/resolution/pairs/{pair['id']}").json()["label"] == "match"


def test_metrics_count_only_what_a_human_judged(client: TestClient) -> None:
    """The whole reason ground-truth labels exist.

    With nothing labelled, precision and recall are None — not 1.0, and not 0.0. "No
    data" and "nothing correct" are different answers and only one means it is broken.
    """
    empty = client.get("/api/v1/resolution/metrics").json()

    assert empty["labelled_pairs"] == 0
    assert empty["precision"] is None
    assert empty["recall"] is None
    assert empty["total_pairs"] > 0


def test_a_confirmed_merge_above_the_threshold_counts_as_precision(client: TestClient) -> None:
    high = max(_pairs(client)["items"], key=lambda pair: pair["score"])
    client.post(
        f"/api/v1/resolution/pairs/{high['id']}/label",
        json={"label": "match", "labelled_by": "j.okafor"},
    )

    metrics = client.get(
        "/api/v1/resolution/metrics", params={"auto_merge": high["score"], "reject": 0.0}
    ).json()

    assert metrics["true_positives"] == 1
    assert metrics["false_positives"] == 0
    assert metrics["precision"] == 1.0


def test_a_rejected_merge_above_the_threshold_is_a_false_positive(client: TestClient) -> None:
    high = max(_pairs(client)["items"], key=lambda pair: pair["score"])
    client.post(
        f"/api/v1/resolution/pairs/{high['id']}/label",
        json={"label": "not-match", "labelled_by": "j.okafor"},
    )

    metrics = client.get(
        "/api/v1/resolution/metrics", params={"auto_merge": high["score"], "reject": 0.0}
    ).json()

    assert metrics["false_positives"] == 1
    assert metrics["precision"] == 0.0


def test_unsure_is_not_evidence_either_way(client: TestClient) -> None:
    pair = _pairs(client)["items"][0]
    client.post(
        f"/api/v1/resolution/pairs/{pair['id']}/label",
        json={"label": "unsure", "labelled_by": "j.okafor"},
    )

    metrics = client.get("/api/v1/resolution/metrics").json()

    assert metrics["labelled_pairs"] == 0


def test_moving_the_thresholds_does_not_persist_anything(client: TestClient) -> None:
    """The slider recomputes; it does not commit a decision nobody made."""
    first = client.get(
        "/api/v1/resolution/metrics", params={"auto_merge": 0.99, "reject": 0.5}
    ).json()
    client.get("/api/v1/resolution/metrics", params={"auto_merge": 0.5, "reject": 0.1})

    again = client.get(
        "/api/v1/resolution/metrics", params={"auto_merge": 0.99, "reject": 0.5}
    ).json()
    assert again == first


def test_a_relabel_supersedes_the_earlier_verdict(client: TestClient) -> None:
    pair = _pairs(client)["items"][0]
    client.post(
        f"/api/v1/resolution/pairs/{pair['id']}/label",
        json={"label": "match", "labelled_by": "j.okafor"},
    )

    client.post(
        f"/api/v1/resolution/pairs/{pair['id']}/label",
        json={"label": "not-match", "labelled_by": "a.mensah"},
    )

    assert client.get(f"/api/v1/resolution/pairs/{pair['id']}").json()["label"] == "not-match"


def test_unlabelled_only_hides_what_has_been_judged(client: TestClient) -> None:
    pair = _pairs(client)["items"][0]
    before = _pairs(client, unlabelled_only=True)["total"]
    client.post(
        f"/api/v1/resolution/pairs/{pair['id']}/label",
        json={"label": "match", "labelled_by": "j.okafor"},
    )

    assert _pairs(client, unlabelled_only=True)["total"] == before - 1


def test_a_weight_replaces_the_one_before_it(client: TestClient) -> None:
    client.put(
        "/api/v1/resolution/config",
        json={"field": "asset_tag", "weight": 0.4, "set_by": "j.okafor"},
    )
    client.put(
        "/api/v1/resolution/config",
        json={"field": "asset_tag", "weight": 0.8, "set_by": "a.mensah"},
    )

    config = client.get("/api/v1/resolution/config").json()

    assert len(config) == 1
    assert config[0]["weight"] == 0.8


def test_an_unknown_pair_is_rejected(client: TestClient) -> None:
    response = client.post(
        "/api/v1/resolution/pairs/NOPE::ALSO-NOPE/label",
        json={"label": "match", "labelled_by": "j.okafor"},
    )

    assert response.status_code == 404


def test_resolution_is_not_on_the_legacy_unprefixed_surface(client: TestClient) -> None:
    assert client.get("/resolution/pairs").status_code == 404
