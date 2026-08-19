"""Route-surface tests for the read endpoints.

The oldest tests in the repository. They were written against the flat `api.py` and
passed UNMODIFIED through the entire migration -- the domain split, the ontology change
from online gaming to manufacturing, and the move to SQLAlchemy -- which is what made
them the safety net for all of it.

Phase 7 is the first change they needed, and only two: the import, now that `api.py` is
gone, and the `/api/v1` prefix, now that the unprefixed mount it was written against has
been removed. Every assertion below is untouched.

Read-only against the warehouse, so running the suite while a dev server is up is safe.
Point at a database elsewhere with ISILDUR_DB_PATH.
"""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.db.session import warehouse_engine
from app.domains.sources.catalog import SOURCES
from app.main import app

API = get_settings().api_prefix
DB_PATH = Path(get_settings().warehouse_database_url.removeprefix("duckdb:///"))

if not DB_PATH.exists():
    pytest.skip(
        f"no database at {DB_PATH}; run the pipeline or set ISILDUR_DB_PATH",
        allow_module_level=True,
    )

client = TestClient(app)


def _warehouse_cursor():
    """A read-only cursor onto the warehouse.

    Deliberately not a fresh `duckdb.connect`: DuckDB refuses a second connection to a
    file already open in this process under a different configuration, and the engine
    sets options of its own. A cursor shares the engine's connection and is safe to
    close.
    """
    with warehouse_engine.connect() as connection:
        return connection.connection.driver_connection.cursor()


# --- fixtures: real ids pulled from the database ---------------------------


@pytest.fixture(scope="module")
def con():
    c = _warehouse_cursor()
    yield c
    c.close()


@pytest.fixture(scope="module")
def finding_id(con):
    row = con.sql("SELECT id FROM findings.findings LIMIT 1").fetchone()
    if row is None:
        pytest.skip("no findings in database")
    return row[0]


@pytest.fixture(scope="module")
def object_id(con):
    row = con.sql("SELECT id FROM graph.objects LIMIT 1").fetchone()
    if row is None:
        pytest.skip("no graph objects in database")
    return row[0]


# --- GET /check, GET /health ----------------------------------------------


def test_check_is_a_trivial_ping():
    r = client.get(f"{API}/check")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_check_does_not_open_the_database(monkeypatch):
    """A liveness probe that touches the database is not a liveness probe.

    Patched at the engine rather than at the old module global: `warehouse_engine.connect`
    is now the single door onto the warehouse, so this catches any route that opens it.
    """

    def boom(*_args, **_kwargs):
        raise AssertionError("/check must not touch DuckDB")

    monkeypatch.setattr(warehouse_engine, "connect", boom)
    assert client.get(f"{API}/check").status_code == 200


def test_health_reports_real_counts():
    r = client.get(f"{API}/health")
    assert r.status_code == 200
    body = r.json()
    assert set(body) == {
        "entity_count",
        "relationship_count",
        "source_count",
        "event_count",
        "sync_success_rate",
    }
    assert body["entity_count"] > 0
    assert body["source_count"] == len(SOURCES)


# --- POST /access-requests -------------------------------------------------


ACCESS_REQUEST = {
    "company_name": "Test Co",
    "business_email": "ops@test.example",
    "phone": "+1 555 0100",
    "website": "https://test.example",
    "industry": "igaming",
    "company_size": "11-50",
    "country": "MT",
    "address_line1": "1 Test Street",
    "city": "Valletta",
    "state_region": "Malta",
    "postal_code": "VLT1000",
    "business_description": "Testing the access request route.",
    "use_case": "Cross-source reconciliation.",
    "deployment_environment": "cloud",
    "expected_analysts": "1-5",
    "systems": ["pam", "psp"],
    "target_timeline": "this quarter",
    "billing_contact_name": "Test Person",
    "billing_contact_email": "billing@test.example",
}


def test_create_access_request():
    # The JSONL archive this test used to assert on is gone: it was a transitional
    # double-write, and the table has been the store of record since Phase 2. The row
    # itself is asserted in tests/integration/test_access_requests.py.
    r = client.post(f"{API}/access-requests", json=ACCESS_REQUEST)
    assert r.status_code == 200
    body = r.json()
    assert body["id"] and body["submitted_at"]


def test_create_access_request_rejects_incomplete_payload():
    r = client.post(f"{API}/access-requests", json={"company_name": "Test Co"})
    assert r.status_code == 422


# --- GET /connectors, /sources, /stats ------------------------------------


def test_connectors():
    r = client.get(f"{API}/connectors")
    assert r.status_code == 200
    rows = r.json()
    assert rows
    for row in rows:
        assert row["status"] in ("Connected", "Degraded", "Failed")
        assert row["source_file"]


def test_sources_covers_every_declared_source():
    r = client.get(f"{API}/sources")
    assert r.status_code == 200
    assert {s["source_file"] for s in r.json()} == set(SOURCES)


def test_stats():
    r = client.get(f"{API}/stats")
    assert r.status_code == 200
    body = r.json()
    assert set(body) == {
        "ingestion",
        "resolution",
        "source_divergences_unresolved",
        "entities_in_only_one_source",
    }
    assert body["ingestion"]


# --- GET /findings, /findings/{id} ----------------------------------------


def test_list_findings():
    r = client.get(f"{API}/findings")
    assert r.status_code == 200
    findings = r.json()
    assert findings
    assert all(isinstance(f["evidence"], (list, dict)) for f in findings)


def test_list_findings_filtered_by_type():
    all_findings = client.get(f"{API}/findings").json()
    ftype = all_findings[0]["finding_type"]
    filtered = client.get(f"{API}/findings", params={"type": ftype}).json()
    assert filtered
    assert {f["finding_type"] for f in filtered} == {ftype}
    assert len(filtered) <= len(all_findings)


def test_get_finding(finding_id):
    r = client.get(f"{API}/findings/{finding_id}")
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == finding_id
    assert "context" in body


def test_get_finding_404():
    r = client.get(f"{API}/findings/does-not-exist")
    assert r.status_code == 404


# --- GET /metrics/{name} ---------------------------------------------------


@pytest.mark.parametrize("name", ["released", "scrapped", "runs", "cycles"])
def test_get_metric(name):
    r = client.get(f"{API}/metrics/{name}")
    assert r.status_code == 200
    body = r.json()
    assert body["metric"] == name
    assert body["reconciled_total"] is not None
    assert body["sources"]


def test_get_metric_404():
    r = client.get(f"{API}/metrics/not-a-metric")
    assert r.status_code == 404


# --- GET /correlate --------------------------------------------------------


def test_correlate():
    r = client.get(f"{API}/correlate", params={"at": "2024-06-01T12:00:00", "window": 120})
    assert r.status_code == 200
    body = r.json()
    assert body["window_minutes"] == 120
    # Renamed in Phase 7 from the gaming-era transactions/rounds/sessions/campaign_sends.
    for key in ("batches", "cycles", "runs", "work_orders"):
        assert isinstance(body[key], list)


def test_correlate_rejects_bad_timestamp():
    assert client.get(f"{API}/correlate", params={"at": "yesterday"}).status_code == 400


def test_correlate_requires_at():
    assert client.get(f"{API}/correlate").status_code == 422


# --- GET /objects, /objects/{id} ------------------------------------------


def test_list_objects():
    r = client.get(f"{API}/objects")
    assert r.status_code == 200
    objects = r.json()
    assert objects
    assert all("id" in o and "type" in o for o in objects)


def test_list_objects_filtered_by_type():
    otype = client.get(f"{API}/objects").json()[0]["type"]
    filtered = client.get(f"{API}/objects", params={"type": otype}).json()
    assert filtered
    assert {o["type"] for o in filtered} == {otype}


def test_get_object(object_id):
    r = client.get(f"{API}/objects/{object_id}")
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == object_id
    assert isinstance(body["connections"], list)
    assert isinstance(body["resolved_from"], list)
    assert set(body["provenance"]) == set(body["properties"])


def test_get_object_404():
    assert client.get(f"{API}/objects/does-not-exist").status_code == 404


# --- GET /graph -----------------------------------------------------------


def test_graph_returns_objects_and_links():
    r = client.get(f"{API}/graph")
    assert r.status_code == 200
    body = r.json()
    assert body["objects"]
    assert body["links"]
    assert all("id" in o and "type" in o for o in body["objects"])
    assert all(set(link) == {"source", "target", "rel_type"} for link in body["links"])


def test_graph_matches_the_objects_listing():
    graph = client.get(f"{API}/graph").json()
    listed = client.get(f"{API}/objects").json()
    assert {o["id"] for o in graph["objects"]} == {o["id"] for o in listed}


def test_graph_links_only_reference_returned_objects():
    graph = client.get(f"{API}/graph").json()
    ids = {o["id"] for o in graph["objects"]}
    assert all(link["source"] in ids and link["target"] in ids for link in graph["links"])


def test_graph_filtered_by_type_drops_dangling_links():
    otype = client.get(f"{API}/objects").json()[0]["type"]
    graph = client.get(f"{API}/graph", params={"type": otype}).json()
    ids = {o["id"] for o in graph["objects"]}
    assert ids
    assert {o["type"] for o in graph["objects"]} == {otype}
    # Edges to filtered-out nodes must not survive, or the client would render
    # links pointing at nodes it never received.
    assert all(link["source"] in ids and link["target"] in ids for link in graph["links"])


# --- GET /search -----------------------------------------------------------


def test_search_empty_query_returns_nothing():
    r = client.get(f"{API}/search", params={"q": "  "})
    assert r.status_code == 200
    assert r.json() == []


def test_search_finds_an_object_by_name(object_id):
    name = client.get(f"{API}/objects/{object_id}").json()["properties"].get("name")
    if not name:
        pytest.skip("first object has no name property")
    r = client.get(f"{API}/search", params={"q": name})
    assert r.status_code == 200
    hits = r.json()
    assert hits
    assert len(hits) <= 20
    # /search truncates to the top 20 by (rank, connections), so a very common
    # name could push this object out of the page; only assert membership when
    # the result set is not truncated
    if len(hits) < 20:
        assert object_id in {h["id"] for h in hits}


def test_search_miss_returns_empty():
    r = client.get(f"{API}/search", params={"q": "zzzzzz-no-such-entity-zzzzzz"})
    assert r.status_code == 200
    assert r.json() == []


# --- GET /lineage/{id} -----------------------------------------------------


def test_lineage_of_a_finding(finding_id):
    r = client.get(f"{API}/lineage/{finding_id}")
    assert r.status_code == 200
    body = r.json()
    assert body["kind"] == "finding"
    assert "sources" in body and "evidence" in body


def test_lineage_of_an_object(object_id):
    r = client.get(f"{API}/lineage/{object_id}")
    assert r.status_code == 200
    body = r.json()
    assert body["kind"] == "object"
    assert isinstance(body["raw_records"], list)


def test_lineage_404():
    assert client.get(f"{API}/lineage/does-not-exist").status_code == 404


# --- CORS ------------------------------------------------------------------


@pytest.fixture(scope="module")
def allowed_origin():
    assert get_settings().cors_origins, "ISILDUR_CORS_ORIGINS resolved to an empty allowlist"
    return get_settings().cors_origins[0]


def test_cors_allows_a_configured_origin_with_credentials(allowed_origin):
    origin = allowed_origin
    r = client.get(f"{API}/stats", headers={"Origin": origin})
    assert r.headers["access-control-allow-origin"] == origin
    assert r.headers["access-control-allow-credentials"] == "true"


def test_cors_rejects_an_unconfigured_origin():
    r = client.get(f"{API}/stats", headers={"Origin": "http://evil.example"})
    # the request itself still runs server-side; what matters is that the
    # browser gets no grant back
    assert "access-control-allow-origin" not in r.headers


def test_cors_preflight_from_a_configured_origin(allowed_origin):
    origin = allowed_origin
    r = client.options(
        "/stats",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert r.status_code == 200
    assert r.headers["access-control-allow-origin"] == origin
    assert r.headers["access-control-allow-credentials"] == "true"
