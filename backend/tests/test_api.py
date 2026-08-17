"""Route-surface tests for api.py.

Read-only: every test opens the existing `isildur.duckdb` through the same
`duckdb.connect(..., read_only=True)` the app uses, so running the suite while
a dev server is up is safe. The one writing route (POST /access-requests) has
its output file redirected to a tmp path.

Point at a database elsewhere with ISILDUR_DB_PATH:

    ISILDUR_DB_PATH=/path/to/isildur.duckdb venv/bin/pytest tests/ -v
"""

import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

import api  # noqa: E402

if not api.DB_PATH.exists():
    pytest.skip(
        f"no database at {api.DB_PATH}; run the pipeline or set ISILDUR_DB_PATH",
        allow_module_level=True,
    )

client = TestClient(api.app)


# --- fixtures: real ids pulled from the database ---------------------------


@pytest.fixture(scope="module")
def con():
    c = api.get_con()
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
    r = client.get("/check")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_check_does_not_open_the_database(monkeypatch):
    def boom(*_args, **_kwargs):
        raise AssertionError("/check must not touch DuckDB")

    monkeypatch.setattr(api, "get_con", boom)
    assert client.get("/check").status_code == 200


def test_health_reports_real_counts():
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert set(body) == {
        "entity_count", "relationship_count", "source_count",
        "event_count", "sync_success_rate",
    }
    assert body["entity_count"] > 0
    assert body["source_count"] == len(api.SOURCES)


# --- POST /access-requests -------------------------------------------------


ACCESS_REQUEST = {
    "company_name": "Test Co", "business_email": "ops@test.example",
    "phone": "+1 555 0100", "website": "https://test.example",
    "industry": "igaming", "company_size": "11-50", "country": "MT",
    "address_line1": "1 Test Street", "city": "Valletta",
    "state_region": "Malta", "postal_code": "VLT1000",
    "business_description": "Testing the access request route.",
    "use_case": "Cross-source reconciliation.",
    "deployment_environment": "cloud", "expected_analysts": "1-5",
    "systems": ["pam", "psp"], "target_timeline": "this quarter",
    "billing_contact_name": "Test Person",
    "billing_contact_email": "billing@test.example",
}


def test_create_access_request(tmp_path, monkeypatch):
    out = tmp_path / "access_requests.jsonl"
    monkeypatch.setattr(api, "ACCESS_REQUESTS_PATH", out)
    r = client.post("/access-requests", json=ACCESS_REQUEST)
    assert r.status_code == 200
    body = r.json()
    assert body["id"] and body["submitted_at"]
    assert out.read_text().strip()


def test_create_access_request_rejects_incomplete_payload(tmp_path, monkeypatch):
    out = tmp_path / "access_requests.jsonl"
    monkeypatch.setattr(api, "ACCESS_REQUESTS_PATH", out)
    r = client.post("/access-requests", json={"company_name": "Test Co"})
    assert r.status_code == 422
    assert not out.exists()


# --- GET /connectors, /sources, /stats ------------------------------------


def test_connectors():
    r = client.get("/connectors")
    assert r.status_code == 200
    rows = r.json()
    assert rows
    for row in rows:
        assert row["status"] in ("Connected", "Degraded", "Failed")
        assert row["source_file"]


def test_sources_covers_every_declared_source():
    r = client.get("/sources")
    assert r.status_code == 200
    assert {s["source_file"] for s in r.json()} == set(api.SOURCES)


def test_stats():
    r = client.get("/stats")
    assert r.status_code == 200
    body = r.json()
    assert set(body) == {
        "ingestion", "resolution",
        "source_divergences_unresolved", "entities_in_only_one_source",
    }
    assert body["ingestion"]


# --- GET /findings, /findings/{id} ----------------------------------------


def test_list_findings():
    r = client.get("/findings")
    assert r.status_code == 200
    findings = r.json()
    assert findings
    assert all(isinstance(f["evidence"], (list, dict)) for f in findings)


def test_list_findings_filtered_by_type():
    all_findings = client.get("/findings").json()
    ftype = all_findings[0]["finding_type"]
    filtered = client.get("/findings", params={"type": ftype}).json()
    assert filtered
    assert {f["finding_type"] for f in filtered} == {ftype}
    assert len(filtered) <= len(all_findings)


def test_get_finding(finding_id):
    r = client.get(f"/findings/{finding_id}")
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == finding_id
    assert "context" in body


def test_get_finding_404():
    r = client.get("/findings/does-not-exist")
    assert r.status_code == 404


# --- GET /metrics/{name} ---------------------------------------------------


@pytest.mark.parametrize("name", ["deposits", "withdrawals", "sessions", "rounds"])
def test_get_metric(name):
    r = client.get(f"/metrics/{name}")
    assert r.status_code == 200
    body = r.json()
    assert body["metric"] == name
    assert body["reconciled_total"] is not None
    assert body["sources"]


def test_get_metric_404():
    r = client.get("/metrics/not-a-metric")
    assert r.status_code == 404


# --- GET /correlate --------------------------------------------------------


def test_correlate():
    r = client.get("/correlate", params={"at": "2024-06-01T12:00:00", "window": 120})
    assert r.status_code == 200
    body = r.json()
    assert body["window_minutes"] == 120
    for key in ("transactions", "rounds", "sessions", "campaign_sends"):
        assert isinstance(body[key], list)


def test_correlate_rejects_bad_timestamp():
    assert client.get("/correlate", params={"at": "yesterday"}).status_code == 400


def test_correlate_requires_at():
    assert client.get("/correlate").status_code == 422


# --- GET /objects, /objects/{id} ------------------------------------------


def test_list_objects():
    r = client.get("/objects")
    assert r.status_code == 200
    objects = r.json()
    assert objects
    assert all("id" in o and "type" in o for o in objects)


def test_list_objects_filtered_by_type():
    otype = client.get("/objects").json()[0]["type"]
    filtered = client.get("/objects", params={"type": otype}).json()
    assert filtered
    assert {o["type"] for o in filtered} == {otype}


def test_get_object(object_id):
    r = client.get(f"/objects/{object_id}")
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == object_id
    assert isinstance(body["connections"], list)
    assert isinstance(body["resolved_from"], list)
    assert set(body["provenance"]) == set(body["properties"])


def test_get_object_404():
    assert client.get("/objects/does-not-exist").status_code == 404


# --- GET /graph -----------------------------------------------------------


def test_graph_returns_objects_and_links():
    r = client.get("/graph")
    assert r.status_code == 200
    body = r.json()
    assert body["objects"]
    assert body["links"]
    assert all("id" in o and "type" in o for o in body["objects"])
    assert all(
        set(link) == {"source", "target", "rel_type"} for link in body["links"]
    )


def test_graph_matches_the_objects_listing():
    graph = client.get("/graph").json()
    listed = client.get("/objects").json()
    assert {o["id"] for o in graph["objects"]} == {o["id"] for o in listed}


def test_graph_links_only_reference_returned_objects():
    graph = client.get("/graph").json()
    ids = {o["id"] for o in graph["objects"]}
    assert all(
        link["source"] in ids and link["target"] in ids for link in graph["links"]
    )


def test_graph_filtered_by_type_drops_dangling_links():
    otype = client.get("/objects").json()[0]["type"]
    graph = client.get("/graph", params={"type": otype}).json()
    ids = {o["id"] for o in graph["objects"]}
    assert ids
    assert {o["type"] for o in graph["objects"]} == {otype}
    # Edges to filtered-out nodes must not survive, or the client would render
    # links pointing at nodes it never received.
    assert all(
        link["source"] in ids and link["target"] in ids for link in graph["links"]
    )


# --- GET /search -----------------------------------------------------------


def test_search_empty_query_returns_nothing():
    r = client.get("/search", params={"q": "  "})
    assert r.status_code == 200
    assert r.json() == []


def test_search_finds_an_object_by_name(object_id):
    name = client.get(f"/objects/{object_id}").json()["properties"].get("name")
    if not name:
        pytest.skip("first object has no name property")
    r = client.get("/search", params={"q": name})
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
    r = client.get("/search", params={"q": "zzzzzz-no-such-entity-zzzzzz"})
    assert r.status_code == 200
    assert r.json() == []


# --- GET /lineage/{id} -----------------------------------------------------


def test_lineage_of_a_finding(finding_id):
    r = client.get(f"/lineage/{finding_id}")
    assert r.status_code == 200
    body = r.json()
    assert body["kind"] == "finding"
    assert "sources" in body and "evidence" in body


def test_lineage_of_an_object(object_id):
    r = client.get(f"/lineage/{object_id}")
    assert r.status_code == 200
    body = r.json()
    assert body["kind"] == "object"
    assert isinstance(body["raw_records"], list)


def test_lineage_404():
    assert client.get("/lineage/does-not-exist").status_code == 404


# --- CORS ------------------------------------------------------------------


@pytest.fixture(scope="module")
def allowed_origin():
    assert api.CORS_ORIGINS, "ISILDUR_CORS_ORIGINS resolved to an empty allowlist"
    return api.CORS_ORIGINS[0]


def test_cors_allows_a_configured_origin_with_credentials(allowed_origin):
    origin = allowed_origin
    r = client.get("/stats", headers={"Origin": origin})
    assert r.headers["access-control-allow-origin"] == origin
    assert r.headers["access-control-allow-credentials"] == "true"


def test_cors_rejects_an_unconfigured_origin():
    r = client.get("/stats", headers={"Origin": "http://evil.example"})
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
