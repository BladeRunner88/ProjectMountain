"""A verdict on a finding survives the request that made it.

The two halves live in different database files — the finding in the read-only warehouse,
the verdict in the API-owned database — so these tests are the only place the merge
between them is exercised end to end.
"""

from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.db.session import AppSessionFactory
from app.domains.findings.models import FindingReview
from app.main import app

REVIEW: dict[str, Any] = {
    "verdict": "confirmed",
    "reviewer": "j.okafor",
    "rationale": "Matched against the CMMS work order for the same shift.",
}


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture(autouse=True)
def _clear_reviews() -> None:
    """Reviews are global state: the overlay reads every row, so one test's verdict would
    otherwise change what the next test sees in an unrelated finding list."""
    with AppSessionFactory() as session:
        for review in session.query(FindingReview).all():
            session.delete(review)
        session.commit()


def _a_finding_id(client: TestClient) -> str:
    findings = client.get("/api/v1/findings").json()
    if not findings:
        pytest.skip("no findings in the warehouse — run the pipeline first")
    finding_id: str = findings[0]["id"]
    return finding_id


def test_a_verdict_is_stored_and_read_back(client: TestClient) -> None:
    finding_id = _a_finding_id(client)

    created = client.post(f"/api/v1/findings/{finding_id}/reviews", json=REVIEW)

    assert created.status_code == 201
    body = created.json()
    assert body["finding_id"] == finding_id
    assert body["verdict"] == "confirmed"
    assert body["decided_at"].endswith("Z")

    history = client.get(f"/api/v1/findings/{finding_id}/reviews").json()
    assert [entry["id"] for entry in history] == [body["id"]]


def test_the_verdict_overrides_the_pipeline_status_on_the_finding_itself(
    client: TestClient,
) -> None:
    """Without this the review is write-only — stored, and invisible everywhere it matters."""
    finding_id = _a_finding_id(client)
    assert client.get(f"/api/v1/findings/{finding_id}").json()["reviewer_status"] == "Open"

    client.post(f"/api/v1/findings/{finding_id}/reviews", json=REVIEW)

    detail = client.get(f"/api/v1/findings/{finding_id}").json()
    assert detail["reviewer_status"] == "Confirmed"
    assert detail["reviewed_by"] == "j.okafor"
    assert detail["reviewed_at"].endswith("Z")


def test_a_reversal_supersedes_rather_than_erases(client: TestClient) -> None:
    finding_id = _a_finding_id(client)
    client.post(f"/api/v1/findings/{finding_id}/reviews", json=REVIEW)

    client.post(
        f"/api/v1/findings/{finding_id}/reviews",
        json={**REVIEW, "verdict": "dismissed", "rationale": "Duplicate of find_0002."},
    )

    assert client.get(f"/api/v1/findings/{finding_id}").json()["reviewer_status"] == "Dismissed"
    history = client.get(f"/api/v1/findings/{finding_id}/reviews").json()
    # Both verdicts readable, in the order they were reached — that trail is the point of
    # an append-only table, and an UPDATE would have destroyed it.
    assert [entry["verdict"] for entry in history] == ["confirmed", "dismissed"]


def test_the_status_filter_sees_the_human_verdict_not_the_stale_column(
    client: TestClient,
) -> None:
    """The filter moved out of SQL for exactly this case.

    The warehouse column still says "unreviewed" — it is rebuilt from source files that
    know nothing about who looked at the output — so a WHERE clause on it would return
    an empty list here.
    """
    finding_id = _a_finding_id(client)
    client.post(f"/api/v1/findings/{finding_id}/reviews", json=REVIEW)

    confirmed = client.get("/api/v1/findings", params={"status": "Confirmed"}).json()

    assert [finding["id"] for finding in confirmed] == [finding_id]


def test_an_unreviewed_finding_still_reports_exactly_what_the_pipeline_said(
    client: TestClient,
) -> None:
    """The overlay must be invisible until someone actually reviews something."""
    findings = client.get("/api/v1/findings").json()
    if not findings:
        pytest.skip("no findings in the warehouse — run the pipeline first")

    # "Open" is the pipeline's own seed value, asserted literally so a change to it has
    # to be a deliberate edit here rather than a silently shifting overlay.
    assert {finding["reviewer_status"] for finding in findings} == {"Open"}
    assert all(finding["reviewed_by"] is None for finding in findings)


def test_a_verdict_cannot_be_filed_against_a_finding_that_does_not_exist(
    client: TestClient,
) -> None:
    response = client.post("/api/v1/findings/find_does_not_exist/reviews", json=REVIEW)

    assert response.status_code == 404


def test_an_unknown_verdict_is_rejected_at_the_boundary(client: TestClient) -> None:
    """DuckDB will not enforce the closed set, so the Literal has to."""
    finding_id = _a_finding_id(client)

    response = client.post(
        f"/api/v1/findings/{finding_id}/reviews", json={**REVIEW, "verdict": "looks-fine"}
    )

    assert response.status_code == 422


def test_the_write_endpoint_is_not_on_the_legacy_unprefixed_surface(client: TestClient) -> None:
    """The legacy mount exists to keep the old frontend working, not to grow.

    404, not 405: the path is absent there entirely, rather than existing with the wrong
    method — which is the stronger guarantee.
    """
    finding_id = _a_finding_id(client)

    assert client.post(f"/findings/{finding_id}/reviews", json=REVIEW).status_code == 404
