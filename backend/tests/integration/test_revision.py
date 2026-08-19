"""The revision queue, and the audit chain that makes its decisions evidence.

The chain is the reason this domain moved server-side. In the browser it verified only
what the current tab had generated, so a reload erased both the decisions and the proof
that they had been made.
"""

from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.db.session import AppSessionFactory
from app.domains.revision.models import RevisionAuditEntry, RevisionQueueItem
from app.main import app

ITEM: dict[str, Any] = {
    "source_tab": "detection",
    "kind": "tuning",
    "subject_id": "spindle-overheat",
    "priority": "critical",
    "summary": "Rule accuracy fell below its floor after the threshold change.",
    "detail": {"accuracy_pct": 54},
}


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture(autouse=True)
def _clear() -> None:
    with AppSessionFactory() as session:
        for entry in session.query(RevisionAuditEntry).all():
            session.delete(entry)
        for item in session.query(RevisionQueueItem).all():
            session.delete(item)
        session.commit()


def _raise(client: TestClient, **overrides: Any) -> dict[str, Any]:
    response = client.post("/api/v1/revision/queue", json={**ITEM, **overrides})
    assert response.status_code == 201
    body: dict[str, Any] = response.json()
    return body


def test_a_raised_item_lands_open_and_unowned(client: TestClient) -> None:
    item = _raise(client)

    assert item["stage"] == "open"
    assert item["owner"] is None
    assert item["resolved_at"] is None
    assert item["detail"] == {"accuracy_pct": 54}


def test_the_queue_reports_a_real_total_not_the_page_size(client: TestClient) -> None:
    for index in range(5):
        _raise(client, subject_id=f"rule-{index}")

    page = client.get("/api/v1/revision/queue", params={"limit": 2}).json()

    assert len(page["items"]) == 2
    assert page["total"] == 5


def test_approving_moves_the_item_and_stamps_it(client: TestClient) -> None:
    item = _raise(client)

    acted = client.post(
        f"/api/v1/revision/queue/{item['id']}/actions",
        json={"action": "approve", "actor": "j.okafor"},
    ).json()

    assert acted["stage"] == "resolved-correct"
    assert acted["owner"] == "j.okafor"
    assert acted["resolved_at"] is not None


def test_annotating_does_not_close_the_item(client: TestClient) -> None:
    """A note is not a decision — but it still belongs in the chain."""
    item = _raise(client)

    acted = client.post(
        f"/api/v1/revision/queue/{item['id']}/actions",
        json={"action": "annotate", "actor": "j.okafor", "note": "Asked the shift lead."},
    ).json()

    assert acted["stage"] == "under-review"
    assert acted["resolved_at"] is None
    assert len(client.get("/api/v1/revision/audit").json()) == 1


def test_a_resolved_item_cannot_be_decided_twice(client: TestClient) -> None:
    item = _raise(client)
    client.post(
        f"/api/v1/revision/queue/{item['id']}/actions",
        json={"action": "approve", "actor": "j.okafor"},
    )

    second = client.post(
        f"/api/v1/revision/queue/{item['id']}/actions",
        json={"action": "reject", "actor": "someone.else"},
    )

    assert second.status_code == 409


def test_every_decision_is_sealed_in_order(client: TestClient) -> None:
    first = _raise(client, subject_id="rule-a")
    second = _raise(client, subject_id="rule-b")
    client.post(
        f"/api/v1/revision/queue/{first['id']}/actions",
        json={"action": "approve", "actor": "j.okafor"},
    )
    client.post(
        f"/api/v1/revision/queue/{second['id']}/actions",
        json={"action": "reject", "actor": "a.mensah"},
    )

    chain = client.get("/api/v1/revision/audit").json()

    assert [entry["sequence"] for entry in chain] == [1, 2]
    assert chain[0]["prev_seal"] is None
    # Each link names the one before it — that is what makes the chain a chain.
    assert chain[1]["prev_seal"] == chain[0]["seal"]


def test_the_chain_verifies_intact(client: TestClient) -> None:
    item = _raise(client)
    client.post(
        f"/api/v1/revision/queue/{item['id']}/actions",
        json={"action": "approve", "actor": "j.okafor"},
    )

    verification = client.get("/api/v1/revision/audit/verification").json()

    assert verification == {"intact": True, "entries": 1, "broken_at": None}


def test_verification_catches_a_row_edited_behind_the_api(client: TestClient) -> None:
    """The case an application-level check can never see, and the only reason to store a
    seal at all: someone with database access rewriting what a decision said."""
    first = _raise(client, subject_id="rule-a")
    second = _raise(client, subject_id="rule-b")
    for item in (first, second):
        client.post(
            f"/api/v1/revision/queue/{item['id']}/actions",
            json={"action": "approve", "actor": "j.okafor"},
        )
    assert client.get("/api/v1/revision/audit/verification").json()["intact"] is True

    with AppSessionFactory() as session:
        # A literal, not an f-string over APP_SCHEMA: the schema name is a constant and
        # interpolating it only earns an S608 suppression.
        session.execute(
            text("UPDATE app.revision_audit_entries SET actor = 'not.them' WHERE sequence = 1")
        )
        session.commit()

    verification = client.get("/api/v1/revision/audit/verification").json()

    assert verification["intact"] is False
    assert verification["broken_at"] == 1


def test_an_unknown_item_is_rejected(client: TestClient) -> None:
    response = client.post(
        "/api/v1/revision/queue/2f1c9a4e-0000-4000-8000-000000000000/actions",
        json={"action": "approve", "actor": "j.okafor"},
    )

    assert response.status_code == 404


def test_an_unknown_action_is_rejected_at_the_boundary(client: TestClient) -> None:
    item = _raise(client)

    response = client.post(
        f"/api/v1/revision/queue/{item['id']}/actions",
        json={"action": "escalate", "actor": "j.okafor"},
    )

    assert response.status_code == 422


def test_the_queue_is_not_on_the_legacy_unprefixed_surface(client: TestClient) -> None:
    assert client.post("/revision/queue", json=ITEM).status_code == 404


def test_a_retried_action_applies_once(client: TestClient) -> None:
    """The client never saw the first response and sends the same request again.

    Without the key this is a 409 on a decision the caller itself made; with it, the
    stored outcome is returned and the chain grows by exactly one link.
    """
    item = _raise(client)
    body = {"action": "approve", "actor": "j.okafor", "idempotency_key": "retry-1"}

    first = client.post(f"/api/v1/revision/queue/{item['id']}/actions", json=body)
    second = client.post(f"/api/v1/revision/queue/{item['id']}/actions", json=body)

    assert first.status_code == second.status_code == 200
    assert first.json() == second.json()
    assert len(client.get("/api/v1/revision/audit").json()) == 1


def test_reusing_a_key_on_a_different_item_is_refused(client: TestClient) -> None:
    """Silently returning the other item's record would tell the caller their decision
    landed somewhere it never touched."""
    first = _raise(client, subject_id="rule-a")
    second = _raise(client, subject_id="rule-b")
    body = {"action": "approve", "actor": "j.okafor", "idempotency_key": "shared"}
    client.post(f"/api/v1/revision/queue/{first['id']}/actions", json=body)

    response = client.post(f"/api/v1/revision/queue/{second['id']}/actions", json=body)

    assert response.status_code == 409
