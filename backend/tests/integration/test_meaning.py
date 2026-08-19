"""Field bindings, and the coverage number that depends on being honest about gaps.

The pipeline leaves a field it cannot map alone rather than guessing. This surface exists
to show what it left, so the tests are largely about unbound fields being visible rather
than quietly absent.
"""

from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.db.session import AppSessionFactory
from app.domains.meaning.models import ContextRuleOverride
from app.main import app


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture(autouse=True)
def _clear() -> None:
    with AppSessionFactory() as session:
        for binding in session.query(ContextRuleOverride).all():
            session.delete(binding)
        session.commit()


def _coverage(client: TestClient) -> dict[str, Any]:
    response = client.get("/api/v1/meaning/coverage")
    assert response.status_code == 200
    body: dict[str, Any] = response.json()
    return body


def _unbound(client: TestClient) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = client.get(
        "/api/v1/meaning/rules", params={"unbound_only": True}
    ).json()
    return items


def test_unbound_fields_are_listed_not_hidden(client: TestClient) -> None:
    unbound = _unbound(client)

    assert len(unbound) > 0
    assert all(field["target_property"] is None for field in unbound)


def test_the_pipeline_bindings_are_reported_as_the_pipeline_s(client: TestClient) -> None:
    """A human binding and a built-in one must be distinguishable, or nobody can tell
    which decisions were reviewed."""
    rules = client.get("/api/v1/meaning/rules").json()
    bound = [field for field in rules if field["target_property"] is not None]

    assert len(bound) > 0
    assert all(field["bound_by_kind"] == "pipeline" for field in bound)
    assert all(field["bound_by"] is None for field in bound)


def test_provenance_columns_are_not_counted_as_source_fields(client: TestClient) -> None:
    """`source_file` and `department` are written by the pipeline, not sent by the vendor.

    Counting them would inflate coverage with columns we produced ourselves.
    """
    rules = client.get("/api/v1/meaning/rules").json()

    names = {field["source_field"] for field in rules}
    assert "source_file" not in names
    assert "department" not in names


def test_coverage_is_per_feed_not_one_pooled_number(client: TestClient) -> None:
    """A forty-column feed would drown out a six-column one, and it is the small
    neglected feed that usually carries the field nobody mapped."""
    coverage = _coverage(client)

    assert len(coverage["sources"]) > 1
    for source in coverage["sources"]:
        assert source["bound_fields"] + source["unbound_fields"] == source["total_fields"]
        assert len(source["unbound"]) == source["unbound_fields"]


def test_binding_a_field_moves_it_out_of_unbound(client: TestClient) -> None:
    target = _unbound(client)[0]
    before = _coverage(client)["bound_fields"]

    created = client.post(
        "/api/v1/meaning/rules",
        json={
            "source_file": target["source_file"],
            "source_field": target["source_field"],
            "target_property": "Machine.serial",
            "bound_by": "j.okafor",
        },
    )

    assert created.status_code == 201
    assert _coverage(client)["bound_fields"] == before + 1
    remaining = {(f["source_file"], f["source_field"]) for f in _unbound(client)}
    assert (target["source_file"], target["source_field"]) not in remaining


def test_a_human_binding_is_marked_as_such(client: TestClient) -> None:
    target = _unbound(client)[0]
    client.post(
        "/api/v1/meaning/rules",
        json={
            "source_file": target["source_file"],
            "source_field": target["source_field"],
            "target_property": "Machine.serial",
            "transform": "trim",
            "bound_by": "j.okafor",
        },
    )

    rules = client.get(
        "/api/v1/meaning/rules", params={"source_file": target["source_file"]}
    ).json()
    bound = next(f for f in rules if f["source_field"] == target["source_field"])

    assert bound["bound_by_kind"] == "human"
    assert bound["bound_by"] == "j.okafor"
    assert bound["transform"] == "trim"
    assert bound["bound_at"].endswith("Z")


def test_rebinding_supersedes_rather_than_duplicating(client: TestClient) -> None:
    target = _unbound(client)[0]
    body = {
        "source_file": target["source_file"],
        "source_field": target["source_field"],
        "target_property": "Machine.serial",
        "bound_by": "j.okafor",
    }
    client.post("/api/v1/meaning/rules", json=body)
    before = _coverage(client)["bound_fields"]

    client.post("/api/v1/meaning/rules", json={**body, "target_property": "Asset.serial"})

    # Still one bound field, not two: the same column cannot mean two things at once.
    assert _coverage(client)["bound_fields"] == before
    rules = client.get(
        "/api/v1/meaning/rules", params={"source_file": target["source_file"]}
    ).json()
    bound = next(f for f in rules if f["source_field"] == target["source_field"])
    assert bound["target_property"] == "Asset.serial"


def test_a_human_binding_overrides_the_pipeline_s(client: TestClient) -> None:
    rules = client.get("/api/v1/meaning/rules").json()
    already = next(f for f in rules if f["target_property"] is not None)

    client.post(
        "/api/v1/meaning/rules",
        json={
            "source_file": already["source_file"],
            "source_field": already["source_field"],
            "target_property": "Machine.corrected_property",
            "bound_by": "a.mensah",
        },
    )

    updated = client.get(
        "/api/v1/meaning/rules", params={"source_file": already["source_file"]}
    ).json()
    field = next(f for f in updated if f["source_field"] == already["source_field"])
    assert field["target_property"] == "Machine.corrected_property"
    assert field["bound_by_kind"] == "human"


def test_a_field_no_feed_ever_delivered_is_refused(client: TestClient) -> None:
    """Otherwise the binding sits there forever, claiming coverage of nothing."""
    response = client.post(
        "/api/v1/meaning/rules",
        json={
            "source_file": "mes_platform.json",
            "source_field": "not_a_real_column",
            "target_property": "Machine.serial",
            "bound_by": "j.okafor",
        },
    )

    assert response.status_code == 404


def test_meaning_is_not_on_the_legacy_unprefixed_surface(client: TestClient) -> None:
    assert client.get("/meaning/coverage").status_code == 404


def test_every_feed_is_inventoried_not_just_the_two_with_raw_tables(client: TestClient) -> None:
    """Regression: the inventory used to be read from `raw.*` columns.

    Only two of the six feeds land in a raw table, and those columns carry the loader's
    names rather than the vendor's, so four feeds reported nothing and SCADA reported 0%
    coverage against fields it had actually mapped. The pipeline now records what each
    file really contained.
    """
    coverage = _coverage(client)

    assert len(coverage["sources"]) == 6
    assert all(source["total_fields"] > 0 for source in coverage["sources"])


def test_a_feed_whose_fields_were_renamed_by_its_loader_still_scores(
    client: TestClient,
) -> None:
    """The SCADA loader reads <tag> and stores it as `tag_masked`.

    Against raw columns this feed scored 0% while its manifest mapped three fields.
    """
    scada = next(
        source
        for source in _coverage(client)["sources"]
        if source["source_file"] == "scada_historian.xml"
    )

    assert scada["bound_fields"] > 0
