"""Access requests land in the database.

The JSONL archive that ran alongside the table through the cutover has been removed, so
the table is the only store and these tests assert against it alone.
"""

from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.session import AppSessionFactory
from app.domains.access.models import AccessRequest
from app.main import app

VALID_PAYLOAD: dict[str, Any] = {
    "company_name": "Northwind Fabrication",
    "business_email": "ops@northwind.example",
    "phone": "+1 555 0100",
    "website": "https://northwind.example",
    "industry": "manufacturing",
    "company_size": "11-50",
    "country": "DE",
    "address_line1": "1 Werkstrasse",
    "city": "Stuttgart",
    "state_region": "Baden-Wurttemberg",
    "postal_code": "70173",
    "business_description": "Contract machining across three plants.",
    "use_case": "Reconciling MES and CMMS asset registers.",
    "deployment_environment": "on-prem",
    "expected_analysts": "1-5",
    "systems": ["mes", "cmms"],
    "target_timeline": "this quarter",
    "billing_contact_name": "A Person",
    "billing_contact_email": "billing@northwind.example",
}


API = get_settings().api_prefix


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def _session() -> Session:
    return AppSessionFactory()


def test_a_submission_is_stored_as_a_row(client: TestClient) -> None:
    response = client.post(f"{API}/access-requests", json=VALID_PAYLOAD)

    assert response.status_code == 200
    with _session() as session:
        stored = session.scalar(
            select(AccessRequest).where(AccessRequest.id == response.json()["id"])
        )
    assert stored is not None
    assert stored.company_name == "Northwind Fabrication"
    assert stored.systems == ["mes", "cmms"], "list fields must round-trip, not stringify"
    assert stored.address_line2 is None


def test_the_receipt_identifies_the_stored_row(client: TestClient) -> None:
    body = client.post(f"{API}/access-requests", json=VALID_PAYLOAD).json()

    assert set(body) == {"id", "submitted_at"}
    assert body["submitted_at"].endswith("Z"), "clients parse a trailing Z, not +00:00"


def test_each_submission_is_recorded_once(client: TestClient) -> None:
    """Guards the retry contract: a replayed block must not insert a second row."""
    with _session() as session:
        before = session.scalar(select(func.count()).select_from(AccessRequest)) or 0

    client.post(f"{API}/access-requests", json=VALID_PAYLOAD)

    with _session() as session:
        after = session.scalar(select(func.count()).select_from(AccessRequest)) or 0
    assert after - before == 1


def test_an_invalid_submission_is_rejected_before_anything_is_written(
    client: TestClient,
) -> None:
    incomplete = {"company_name": "Only this"}
    with _session() as session:
        before = session.scalar(select(func.count()).select_from(AccessRequest)) or 0

    response = client.post(f"{API}/access-requests", json=incomplete)

    assert response.status_code == 422
    with _session() as session:
        after = session.scalar(select(func.count()).select_from(AccessRequest)) or 0
    assert after == before, "validation must run before anything is written"


def test_an_oversized_field_is_rejected_before_anything_is_written(
    client: TestClient,
) -> None:
    oversized = {**VALID_PAYLOAD, "company_name": "N" * 121}
    with _session() as session:
        before = session.scalar(select(func.count()).select_from(AccessRequest)) or 0

    response = client.post(f"{API}/access-requests", json=oversized)

    assert response.status_code == 422
    with _session() as session:
        after = session.scalar(select(func.count()).select_from(AccessRequest)) or 0
    assert after == before


def test_an_unknown_field_is_rejected(client: TestClient) -> None:
    response = client.post(
        f"{API}/access-requests",
        json={**VALID_PAYLOAD, "role": "admin"},
    )
    assert response.status_code == 422
