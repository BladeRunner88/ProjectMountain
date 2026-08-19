"""Access requests land in the database and in the archive.

The archive write is transitional — the table is the store of record. Both are asserted
so the cutover can be verified before the file is retired.
"""

import json
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.session import AppSessionFactory
from app.domains.access import deps as access_deps
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


@pytest.fixture
def archive_path(tmp_path: Path) -> Iterator[Path]:
    """Redirect the transitional JSONL archive away from the developer's own file."""
    original = access_deps.ACCESS_REQUESTS_PATH
    redirected = tmp_path / "access_requests.jsonl"
    access_deps.ACCESS_REQUESTS_PATH = redirected
    yield redirected
    access_deps.ACCESS_REQUESTS_PATH = original


@pytest.fixture
def client(archive_path: Path) -> TestClient:
    return TestClient(app)


def _session() -> Session:
    return AppSessionFactory()


def test_a_submission_is_stored_as_a_row(client: TestClient, archive_path: Path) -> None:
    response = client.post("/access-requests", json=VALID_PAYLOAD)

    assert response.status_code == 200
    with _session() as session:
        stored = session.scalar(
            select(AccessRequest).where(AccessRequest.id == response.json()["id"])
        )
    assert stored is not None
    assert stored.company_name == "Northwind Fabrication"
    assert stored.systems == ["mes", "cmms"], "list fields must round-trip, not stringify"
    assert stored.address_line2 is None


def test_the_receipt_identifies_the_stored_row(client: TestClient, archive_path: Path) -> None:
    body = client.post("/access-requests", json=VALID_PAYLOAD).json()

    assert set(body) == {"id", "submitted_at"}
    assert body["submitted_at"].endswith("Z"), "clients parse a trailing Z, not +00:00"


def test_the_same_submission_also_reaches_the_archive(
    client: TestClient, archive_path: Path
) -> None:
    body = client.post("/access-requests", json=VALID_PAYLOAD).json()

    lines = archive_path.read_text(encoding="utf-8").splitlines()
    assert len(lines) == 1
    archived = json.loads(lines[0])
    assert archived["id"] == body["id"]
    assert archived["submitted_at"] == body["submitted_at"]


def test_each_submission_is_recorded_once(client: TestClient, archive_path: Path) -> None:
    """Guards the retry contract: a replayed block must not double-write either store."""
    with _session() as session:
        before = session.scalar(select(func.count()).select_from(AccessRequest)) or 0

    client.post("/access-requests", json=VALID_PAYLOAD)

    with _session() as session:
        after = session.scalar(select(func.count()).select_from(AccessRequest)) or 0
    assert after - before == 1
    assert len(archive_path.read_text(encoding="utf-8").splitlines()) == 1


def test_an_invalid_submission_is_rejected_before_anything_is_written(
    client: TestClient, archive_path: Path
) -> None:
    incomplete = {"company_name": "Only this"}

    response = client.post("/access-requests", json=incomplete)

    assert response.status_code == 422
    assert not archive_path.exists(), "validation must run before the archive is touched"
