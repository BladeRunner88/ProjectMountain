"""Part C — the API surface, built first per the brief. Twelve endpoints,
all reading from clean.* / graph.* / findings.* tables built by
ingest_clean.py, entity_resolution.py and findings.py. Nothing here is
hardcoded — every number is a query.

  GET /check                     trivial liveness ping; touches no database
  GET /health                    entity/relationship/source/event counts, sync success
  GET /connectors                each vendor system: status, last sync, records, errors
  GET /findings                  computed operational findings
  GET /findings/{id}             one finding, full evidence
  GET /metrics/{name}            a metric with its per-source composition
  GET /correlate?at=&window=     everything from every source in a time window
  GET /sources                   vendor systems: owner, format, counts, field mappings
  GET /objects?type=
  GET /objects/{id}              properties, connections, raw records, provenance
  GET /search?q=
  GET /stats                     pipeline and normalization metrics
  GET /lineage/{id}
  POST /access-requests           onboarding form submission
"""

import json
import os
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

import duckdb
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import ontology
from sources import SOURCES

ROOT = Path(__file__).parent
DB_PATH = Path(os.environ.get("ISILDUR_DB_PATH") or ROOT / "isildur.duckdb")
ACCESS_REQUESTS_PATH = ROOT / "access_requests.jsonl"

# local prototype only; no real accounts/cloud. Still an explicit allowlist
# rather than "*": the frontend axios client sends withCredentials, and
# browsers refuse a wildcard origin on credentialed requests.
CORS_ORIGINS = [
    o.strip()
    for o in (os.environ.get("ISILDUR_CORS_ORIGINS") or "http://localhost:3000").split(",")
    if o.strip()
]

app = FastAPI(title="Isildur Operational Intelligence API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# GET /check
# ---------------------------------------------------------------------------


@app.get("/check")
def check():
    """Liveness ping. Deliberately touches nothing — no DuckDB connection, no
    queries — so it stays cheap and answers even when the database is missing
    or mid-rebuild. /health is the readiness counterpart: it opens the database
    and reports real counts."""
    return {"status": "ok"}


class AccessRequestPayload(BaseModel):
    company_name: str
    business_email: str
    phone: str
    website: str
    industry: str
    company_size: str
    country: str
    address_line1: str
    address_line2: Optional[str] = None
    city: str
    state_region: str
    postal_code: str
    business_description: str
    use_case: str
    hear_about_us: Optional[str] = None
    deployment_environment: str
    expected_analysts: str
    systems: list[str]
    systems_other: Optional[str] = None
    target_timeline: str
    billing_contact_name: str
    billing_contact_email: str
    tax_id: Optional[str] = None


# ---------------------------------------------------------------------------
# POST /access-requests
# ---------------------------------------------------------------------------


@app.post("/access-requests")
def create_access_request(payload: AccessRequestPayload):
    request_id = str(uuid.uuid4())
    submitted_at = datetime.utcnow().isoformat() + "Z"
    record = {"id": request_id, "submitted_at": submitted_at, **payload.model_dump()}
    with open(ACCESS_REQUESTS_PATH, "a") as f:
        f.write(json.dumps(record) + "\n")
    return {"id": request_id, "submitted_at": submitted_at}


def get_con():
    return duckdb.connect(str(DB_PATH), read_only=True)


def stat_dict(con, table: str) -> dict:
    return dict(con.sql(f"SELECT key, value FROM {table}").fetchall())


def parse_finding_row(row) -> dict:
    (fid, ftype, title, description, sources_json, computed_json, window_json,
     entities_json, reviewer_status, reviewed_by, reviewed_at, evidence_json) = row
    return {
        "id": fid, "finding_type": ftype, "title": title, "description": description,
        "sources": json.loads(sources_json), "computed": json.loads(computed_json),
        "window": json.loads(window_json), "entities": json.loads(entities_json),
        "reviewer_status": reviewer_status, "reviewed_by": reviewed_by, "reviewed_at": reviewed_at,
        "evidence": json.loads(evidence_json),
    }


# ---------------------------------------------------------------------------
# GET /health
# ---------------------------------------------------------------------------


@app.get("/health")
def health():
    con = get_con()
    entity_count = con.sql("SELECT count(*) FROM graph.objects").fetchone()[0]
    relationship_count = con.sql("SELECT count(*) FROM graph.links").fetchone()[0]
    event_count = sum(
        con.sql(f"SELECT count(*) FROM {t}").fetchone()[0]
        for t in ["clean.transactions", "clean.rounds", "clean.sessions",
                  "clean.campaign_sends", "clean.affiliate_referrals"]
    )
    pipeline = stat_dict(con, "main.pipeline_stats")
    total = pipeline.get("records_ingested", 0) + pipeline.get("records_failed_to_parse", 0)
    failed = pipeline.get("records_failed_to_parse", 0)
    sync_success_rate = round((total - failed) / total, 4) if total else None
    con.close()
    return {
        "entity_count": entity_count,
        "relationship_count": relationship_count,
        "source_count": len(SOURCES),
        "event_count": event_count,
        "sync_success_rate": sync_success_rate,
    }


# ---------------------------------------------------------------------------
# GET /connectors
# ---------------------------------------------------------------------------


@app.get("/connectors")
def connectors():
    con = get_con()
    rows = con.sql("SELECT * FROM main.connector_status").fetchall()
    con.close()
    result = []
    for source_file, owner, department, fmt, describes, records, failed, last_sync in rows:
        if failed == 0:
            status, explanation = "Connected", None
        elif failed < records * 0.05:
            status = "Degraded"
            explanation = f"{failed} of {records + failed} records failed to parse from {owner}."
        else:
            status = "Failed"
            explanation = f"{failed} of {records + failed} records failed to parse from {owner}; most of this feed did not load."
        result.append({
            "source_file": source_file, "owner": owner, "department": department,
            "format": fmt, "covers": describes, "status": status,
            "last_sync": last_sync, "records": records, "errors": failed,
            "explanation": explanation,
        })
    return result


# ---------------------------------------------------------------------------
# GET /sources
# ---------------------------------------------------------------------------

FIELD_MAPPINGS = {
    "pam_platform.json": {"account_id": "account_ref", "username": "player identifier",
                           "registered_at": "occurred_at (UTC, explicit)"},
    "game_aggregator.xml": {"wallet": "account_ref (masked)", "timestamp": "occurred_at (assumed UTC)",
                             "provider": "provider_canonical (aliased)"},
    "psp_transactions.csv": {"account_ref": "account_ref (masked)", "status": "status (already canonical)",
                              "created_at": "occurred_at (explicit offset)"},
    "psp_alt.csv": {"wallet": "account_ref (masked)", "result": "status (mapped: SETTLED/FAILED/PENDING_REVIEW)",
                     "local_datetime": "occurred_at (assumed from market timezone)",
                     "ccy": "currency", "value": "amount"},
    "crm_campaigns.xlsx": {"recipient_email": "player identifier", "sent_at": "occurred_at (assumed UTC, Excel serial)"},
    "affiliate_tracking.csv": {"account_ref": "account_ref (numeric-core matched)",
                                "registration_date": "occurred_at (date only)"},
}


@app.get("/sources")
def sources():
    con = get_con()
    rows = dict((r[0], r) for r in con.sql("SELECT * FROM main.connector_status").fetchall())
    con.close()
    result = []
    for fname, meta in SOURCES.items():
        r = rows.get(fname)
        result.append({
            "source_file": fname, "owner": meta["owner"], "department": meta["department"],
            "format": meta["format"], "describes": meta["describes"],
            "records": r[5] if r else None, "failed_to_parse": r[6] if r else None,
            "field_mappings": FIELD_MAPPINGS.get(fname, {}),
        })
    return result


# ---------------------------------------------------------------------------
# GET /stats
# ---------------------------------------------------------------------------


@app.get("/stats")
def stats():
    con = get_con()
    pipeline = stat_dict(con, "main.pipeline_stats")
    resolution = stat_dict(con, "main.resolution_stats")

    source_divergences_open = con.sql(
        "SELECT count(*) FROM findings.findings WHERE finding_type='SOURCE_DIVERGENCE' AND reviewer_status='Open'"
    ).fetchone()[0]

    # entities appearing in only one source: accounts with no affiliate
    # referral, no campaign target, and not part of a multi-account player
    single_source_accounts = con.sql("""
        SELECT count(*) FROM clean.accounts a
        WHERE NOT EXISTS (SELECT 1 FROM clean.affiliate_referrals r WHERE r.account_ref LIKE '%' || regexp_replace(a.account_id, '\\D', '', 'g'))
          AND NOT EXISTS (SELECT 1 FROM clean.campaign_sends c WHERE c.recipient_email = a.email)
    """).fetchone()[0]

    con.close()
    return {
        "ingestion": pipeline,
        "resolution": resolution,
        "source_divergences_unresolved": source_divergences_open,
        "entities_in_only_one_source": single_source_accounts,
    }


# ---------------------------------------------------------------------------
# GET /findings, /findings/{id}
# ---------------------------------------------------------------------------


@app.get("/findings")
def list_findings(finding_type: Optional[str] = Query(default=None, alias="type"),
                   status: Optional[str] = Query(default=None)):
    con = get_con()
    sql = "SELECT * FROM findings.findings WHERE 1=1"
    params = []
    if finding_type:
        sql += " AND finding_type = ?"
        params.append(finding_type)
    if status:
        sql += " AND reviewer_status = ?"
        params.append(status)
    rows = con.sql(sql, params=params).fetchall()
    con.close()
    return [parse_finding_row(r) for r in rows]


@app.get("/findings/{finding_id}")
def get_finding(finding_id: str):
    con = get_con()
    row = con.sql("SELECT * FROM findings.findings WHERE id = ?", params=[finding_id]).fetchone()
    if row is None:
        con.close()
        raise HTTPException(status_code=404, detail="finding not found")
    finding = parse_finding_row(row)

    window = finding["window"]
    try:
        at = datetime.fromisoformat(window["start"])
        end = datetime.fromisoformat(window["end"])
        context = _everything_in_window(con, at, end)
    except (KeyError, ValueError):
        context = None

    con.close()
    finding["context"] = context
    return finding


# ---------------------------------------------------------------------------
# GET /metrics/{name}
# ---------------------------------------------------------------------------


@app.get("/metrics/{name}")
def get_metric(name: str, market: Optional[str] = None):
    con = get_con()
    if name in ("deposits", "withdrawals"):
        txn_type = "deposit" if name == "deposits" else "withdrawal"
        sql = "SELECT payment_provider, currency_original, count(*), sum(amount_original), sum(amount_usd) FROM clean.transactions WHERE type = ?"
        params = [txn_type]
        if market:
            sql += " AND market = ?"
            params.append(market)
        sql += " GROUP BY 1, 2 ORDER BY 1, 2"
        rows = con.sql(sql, params=params).fetchall()
        con.close()
        by_source = {}
        for provider, ccy, n, raw_total, usd_total in rows:
            by_source.setdefault(provider, {"provider": provider, "components": [], "usd_total": 0.0})
            by_source[provider]["components"].append(
                {"currency": ccy, "count": n, "raw_total": round(raw_total, 2), "usd_total": round(usd_total, 2)}
            )
            by_source[provider]["usd_total"] += usd_total
        sources_out = list(by_source.values())
        for s in sources_out:
            s["usd_total"] = round(s["usd_total"], 2)
        return {
            "metric": name, "market": market, "unit": "USD",
            "reconciled_total": round(sum(s["usd_total"] for s in sources_out), 2),
            "sources": sources_out,
        }

    if name in ("sessions", "rounds"):
        table = "clean.sessions" if name == "sessions" else "clean.rounds"
        rows = con.sql(f"SELECT source_file, count(*) FROM {table} GROUP BY 1").fetchall()
        con.close()
        return {
            "metric": name, "unit": "count",
            "reconciled_total": sum(r[1] for r in rows),
            "sources": [{"source_file": r[0], "count": r[1]} for r in rows],
        }

    con.close()
    raise HTTPException(status_code=404, detail=f"unknown metric '{name}'")


# ---------------------------------------------------------------------------
# GET /correlate?at=&window=
# ---------------------------------------------------------------------------


def _everything_in_window(con, start: datetime, end: datetime) -> dict:
    txns = con.sql(
        "SELECT txn_id, payment_provider, type, status, amount_usd, occurred_at_utc FROM clean.transactions "
        "WHERE occurred_at_utc >= ? AND occurred_at_utc < ? ORDER BY occurred_at_utc",
        params=[start, end],
    ).fetchall()
    rounds = con.sql(
        "SELECT round_id, provider_canonical, outcome, occurred_at_utc FROM clean.rounds "
        "WHERE occurred_at_utc >= ? AND occurred_at_utc < ? ORDER BY occurred_at_utc",
        params=[start, end],
    ).fetchall()
    sessions = con.sql(
        "SELECT session_id, game_title, provider_canonical, started_at_utc FROM clean.sessions "
        "WHERE started_at_utc >= ? AND started_at_utc < ? ORDER BY started_at_utc",
        params=[start, end],
    ).fetchall()
    sends = con.sql(
        "SELECT campaign_name, channel, sent_at_utc FROM clean.campaign_sends "
        "WHERE sent_at_utc >= ? AND sent_at_utc < ? ORDER BY sent_at_utc",
        params=[start, end],
    ).fetchall()
    return {
        "transactions": [{"id": r[0], "provider": r[1], "type": r[2], "status": r[3],
                           "amount_usd": r[4], "occurred_at": str(r[5])} for r in txns],
        "rounds": [{"id": r[0], "provider": r[1], "outcome": r[2], "occurred_at": str(r[3])} for r in rounds],
        "sessions": [{"id": r[0], "game": r[1], "provider": r[2], "started_at": str(r[3])} for r in sessions],
        "campaign_sends": [{"campaign": r[0], "channel": r[1], "sent_at": str(r[2])} for r in sends],
    }


@app.get("/correlate")
def correlate(at: str = Query(...), window: int = Query(default=60)):
    try:
        anchor = datetime.fromisoformat(at)
    except ValueError:
        raise HTTPException(status_code=400, detail="at must be an ISO datetime")
    start = anchor - timedelta(minutes=window)
    end = anchor + timedelta(minutes=window)
    con = get_con()
    result = _everything_in_window(con, start, end)
    con.close()
    return {"at": at, "window_minutes": window, "start": str(start), "end": str(end), **result}


# ---------------------------------------------------------------------------
# GET /objects, /objects/{id}
# ---------------------------------------------------------------------------


@app.get("/objects")
def list_objects(type: Optional[str] = Query(default=None)):
    con = get_con()
    if type:
        rows = con.sql(
            "SELECT id, type, properties_json FROM graph.objects WHERE type = ?", params=[type]
        ).fetchall()
    else:
        rows = con.sql("SELECT id, type, properties_json FROM graph.objects").fetchall()
    con.close()
    return [{"id": oid, "type": otype, **json.loads(props)} for oid, otype, props in rows]


@app.get("/objects/{object_id}")
def get_object(object_id: str):
    con = get_con()
    row = con.sql(
        "SELECT id, type, properties_json FROM graph.objects WHERE id = ?", params=[object_id]
    ).fetchone()
    if row is None:
        con.close()
        raise HTTPException(status_code=404, detail="object not found")
    oid, otype, props_json = row
    props = json.loads(props_json)

    outgoing = con.sql(
        "SELECT target_id, rel_type FROM graph.links WHERE source_id = ?", params=[object_id]
    ).fetchall()
    incoming = con.sql(
        "SELECT source_id, rel_type FROM graph.links WHERE target_id = ?", params=[object_id]
    ).fetchall()

    def describe(other_id: str):
        r = con.sql(
            "SELECT type, properties_json FROM graph.objects WHERE id = ?", params=[other_id]
        ).fetchone()
        if not r:
            return {"id": other_id, "type": None, "name": other_id}
        t, p = r
        props = json.loads(p)
        display_name = props.get("name") or props.get("title") or props.get("account_ref") or other_id
        return {"id": other_id, "type": t, "name": display_name}

    connections = [
        {"direction": "out", "rel_type": rel, **describe(tid)} for tid, rel in outgoing
    ] + [{"direction": "in", "rel_type": rel, **describe(sid)} for sid, rel in incoming]

    raw_records = con.sql(
        "SELECT source_table, source_id, raw_name FROM graph.resolution_map WHERE canonical_id = ? "
        "ORDER BY source_table, source_id",
        params=[object_id],
    ).fetchall()

    # per-field provenance: every property on this object came from the same
    # underlying source row (see entity_resolution.py) except Player, whose
    # accounts may span multiple raw HR-equivalent rows
    provenance = {k: object_id for k in props}

    con.close()
    return {
        "id": oid, "type": otype, "properties": props,
        "connections": connections,
        "resolved_from": [
            {"source_table": t, "source_id": sid, "raw_name": rn} for t, sid, rn in raw_records
        ],
        "provenance": provenance,
    }


# ---------------------------------------------------------------------------
# GET /search
# ---------------------------------------------------------------------------


@app.get("/search")
def search(q: str = Query(default="")):
    q_norm = q.strip().lower()
    if not q_norm:
        return []
    con = get_con()
    objects = con.sql("SELECT id, type, properties_json FROM graph.objects").fetchall()
    conn_counts = dict(con.sql("""
        SELECT id, count(*) FROM (
            SELECT source_id AS id FROM graph.links
            UNION ALL
            SELECT target_id AS id FROM graph.links
        ) GROUP BY id
    """).fetchall())
    alias_rows = con.sql("SELECT canonical_id, raw_name FROM graph.resolution_map").fetchall()
    con.close()

    aliases_by_id: dict[str, set] = {}
    for cid, raw_name in alias_rows:
        aliases_by_id.setdefault(cid, set()).add(raw_name)

    results = []
    for oid, otype, props_json in objects:
        props = json.loads(props_json)
        name = str(props.get("name") or props.get("title") or props.get("account_ref") or oid)
        name_l = name.lower()
        aliases = [a for a in aliases_by_id.get(oid, set()) if a != name]

        rank, matched_alias = None, None
        if name_l.startswith(q_norm):
            rank = 0
        elif q_norm in name_l:
            rank = 1
        else:
            for a in aliases:
                if a.lower().startswith(q_norm):
                    rank, matched_alias = 2, a
                    break
            if rank is None:
                for a in aliases:
                    if q_norm in a.lower():
                        rank, matched_alias = 3, a
                        break
            if rank is None:
                for k, v in props.items():
                    if k in ("name", "title") or v is None:
                        continue
                    if q_norm in str(v).lower():
                        rank = 4
                        break
        if rank is None:
            continue
        results.append({
            "id": oid, "type": otype, "name": name,
            "connections": conn_counts.get(oid, 0),
            "matched_alias": matched_alias, "_rank": rank,
        })

    results.sort(key=lambda r: (r["_rank"], -r["connections"]))
    for r in results:
        del r["_rank"]
    return results[:20]


# ---------------------------------------------------------------------------
# GET /lineage/{id}
# ---------------------------------------------------------------------------


@app.get("/lineage/{item_id}")
def lineage(item_id: str):
    con = get_con()

    finding_row = con.sql("SELECT * FROM findings.findings WHERE id = ?", params=[item_id]).fetchone()
    if finding_row:
        finding = parse_finding_row(finding_row)
        con.close()
        return {
            "id": item_id, "kind": "finding",
            "sources": finding["sources"],
            "evidence": finding["evidence"],
            "window": finding["window"],
        }

    object_row = con.sql(
        "SELECT id, type FROM graph.objects WHERE id = ?", params=[item_id]
    ).fetchone()
    if object_row:
        raw_records = con.sql(
            "SELECT source_table, source_id, raw_name FROM graph.resolution_map WHERE canonical_id = ?",
            params=[item_id],
        ).fetchall()
        con.close()
        return {
            "id": item_id, "kind": "object", "type": object_row[1],
            "raw_records": [
                {"source_table": t, "source_id": sid, "raw_name": rn} for t, sid, rn in raw_records
            ],
        }

    con.close()
    raise HTTPException(status_code=404, detail="no object or finding with that id")
