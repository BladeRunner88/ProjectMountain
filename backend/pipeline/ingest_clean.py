"""Ingest the six vendor sources and normalize them.

raw.* tables: one per vendor feed, parsed as-is (JSON/XML/CSV/XLSX) and
tagged with provenance (source file + owning department) from
sources.py — nothing here is hardcoded per row, the mapping is a fixed
manifest.

clean.* tables: field names mapped to a shared vocabulary, status values
mapped to a canonical set, currency converted to USD at a fixed stated
rate, timestamps normalized to UTC (tracking which had to be ASSUMED
because the source carried no timezone), all while keeping the original
raw value and its source alongside the normalized one so every figure is
traceable back to where it came from.
"""

import csv
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from xml.etree import ElementTree as ET

import duckdb
import openpyxl

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))  # ontology.py / sources.py live at backend root

from sources import SOURCES

DB_PATH = ROOT / "isildur.duckdb"
RAW_DIR = ROOT / "data" / "raw"

con = duckdb.connect(str(DB_PATH))
con.sql("CREATE SCHEMA IF NOT EXISTS raw")
con.sql("CREATE SCHEMA IF NOT EXISTS clean")

# ---------------------------------------------------------------------------
# normalization reference tables — fixed, stated, not invented per row
# ---------------------------------------------------------------------------

FX_TO_USD = {"USD": 1.0, "GBP": 1.27, "EUR": 1.09, "SEK": 0.095, "CAD": 0.74}

STATUS_MAP = {
    # NorthPay (PSP A) already uses the canonical vocabulary
    "approved": "approved", "declined": "declined", "pending": "pending",
    # Quantis Pay (PSP B) uses a different vocabulary entirely
    "settled": "approved", "failed": "declined", "pending_review": "pending",
}

# market -> assumed local UTC offset hours, used only when a source carries
# no timezone at all (psp_alt.csv). Ireland/Malta ignore DST for simplicity.
MARKET_UTC_OFFSET = {
    "UK": 0, "Ireland": 0, "Germany": 1, "Sweden": 1, "Canada": -5, "Malta": 1,
}

PROVIDER_ALIASES = {
    "pragmaticplay": "Pragmatic Play", "pragmatic play ltd": "Pragmatic Play",
    "netent": "NetEnt", "netent ab": "NetEnt",
    "playngo": "Play'n GO", "play n go": "Play'n GO",
    "evolution": "Evolution Gaming", "evolution gaming group": "Evolution Gaming",
    "redtiger": "Red Tiger", "red tiger gaming": "Red Tiger",
    "hacksaw": "Hacksaw Gaming", "hacksaw gaming ltd": "Hacksaw Gaming",
}


def canonical_provider(raw_name: str) -> str:
    key = raw_name.strip().lower()
    return PROVIDER_ALIASES.get(key, raw_name.strip())


EXCEL_EPOCH = datetime(1899, 12, 30)


def from_excel_serial(serial: float) -> datetime:
    return EXCEL_EPOCH + timedelta(days=serial)


# ---------------------------------------------------------------------------
# stats accumulator — everything printed at the end is a real count, not a
# guess, so Part G later can read these straight off the pipeline
# ---------------------------------------------------------------------------

stats = {
    "records_ingested": 0,
    "timestamps_normalized": 0,
    "timestamps_assumed_tz": 0,
    "currency_conversions": 0,
    "status_values_mapped": 0,
    "records_failed_to_parse": 0,
}

per_source = {name: {"records": 0, "failed": 0} for name in SOURCES}


def track(source_file, ok=True):
    if ok:
        per_source[source_file]["records"] += 1
    else:
        per_source[source_file]["failed"] += 1

# ---------------------------------------------------------------------------
# 1. pam_platform.json
# ---------------------------------------------------------------------------

pam = json.loads((RAW_DIR / "pam_platform.json").read_text())
dept = SOURCES["pam_platform.json"]["department"]

accounts_rows = []
for a in pam["accounts"]:
    accounts_rows.append((
        a["account_id"], a["username"].strip(), a["email"], a["market"], a["currency"],
        a["registered_at"], a["status"], a["balance"], "pam_platform.json", dept,
    ))
    stats["records_ingested"] += 1
    stats["timestamps_normalized"] += 1  # explicit Z offset, no assumption needed
    track("pam_platform.json")

con.sql("""
    CREATE OR REPLACE TABLE raw.pam_accounts (
        account_id VARCHAR, username VARCHAR, email VARCHAR, market VARCHAR, currency VARCHAR,
        registered_at VARCHAR, status VARCHAR, balance DOUBLE,
        source_file VARCHAR, department VARCHAR
    )
""")
con.executemany("INSERT INTO raw.pam_accounts VALUES (?,?,?,?,?,?,?,?,?,?)", accounts_rows)

sessions_rows = []
for s in pam["sessions"]:
    sessions_rows.append((
        s["session_id"], s["account_id"], s["game_title"], s["game_provider"],
        s["started_at"], s["ended_at"], s["declared_rounds"], s["device"],
        "pam_platform.json", dept,
    ))
    stats["records_ingested"] += 1
    stats["timestamps_normalized"] += 2  # started_at + ended_at, both explicit UTC
    track("pam_platform.json")

con.sql("""
    CREATE OR REPLACE TABLE raw.pam_sessions (
        session_id VARCHAR, account_id VARCHAR, game_title VARCHAR, game_provider VARCHAR,
        started_at VARCHAR, ended_at VARCHAR, declared_rounds INTEGER, device VARCHAR,
        source_file VARCHAR, department VARCHAR
    )
""")
con.executemany("INSERT INTO raw.pam_sessions VALUES (?,?,?,?,?,?,?,?,?,?)", sessions_rows)

# ---------------------------------------------------------------------------
# 2. game_aggregator.xml
# ---------------------------------------------------------------------------

tree = ET.parse(RAW_DIR / "game_aggregator.xml")
root = tree.getroot()
dept = SOURCES["game_aggregator.xml"]["department"]

games_rows = []
for g in root.find("games"):
    games_rows.append((g.get("id"), g.findtext("title"), g.findtext("provider"),
                        float(g.findtext("rtp")), "game_aggregator.xml", dept))
con.sql("""
    CREATE OR REPLACE TABLE raw.aggregator_games (
        game_id VARCHAR, title VARCHAR, provider_raw VARCHAR, rtp DOUBLE,
        source_file VARCHAR, department VARCHAR
    )
""")
con.executemany("INSERT INTO raw.aggregator_games VALUES (?,?,?,?,?,?)", games_rows)

rounds_rows = []
for r in root.find("rounds"):
    try:
        rounds_rows.append((
            r.get("id"), r.findtext("gameId"), r.findtext("wallet"),
            r.findtext("timestamp"), float(r.findtext("stake")), float(r.findtext("payout")),
            r.findtext("outcome"), "game_aggregator.xml", dept,
        ))
        stats["records_ingested"] += 1
        stats["timestamps_normalized"] += 1
        stats["timestamps_assumed_tz"] += 1  # naive timestamp, no tz in source
        track("game_aggregator.xml")
    except (TypeError, ValueError):
        stats["records_failed_to_parse"] += 1
        track("game_aggregator.xml", ok=False)

con.sql("""
    CREATE OR REPLACE TABLE raw.aggregator_rounds (
        round_id VARCHAR, game_id VARCHAR, wallet_masked VARCHAR, timestamp_raw VARCHAR,
        stake DOUBLE, payout DOUBLE, outcome VARCHAR, source_file VARCHAR, department VARCHAR
    )
""")
con.executemany("INSERT INTO raw.aggregator_rounds VALUES (?,?,?,?,?,?,?,?,?)", rounds_rows)

# ---------------------------------------------------------------------------
# 3 + 4. psp_transactions.csv (NorthPay) + psp_alt.csv (Quantis Pay)
# ---------------------------------------------------------------------------

with (RAW_DIR / "psp_transactions.csv").open() as f:
    psp_a_rows = list(csv.DictReader(f))
dept_a = SOURCES["psp_transactions.csv"]["department"]

with (RAW_DIR / "psp_alt.csv").open() as f:
    psp_b_rows = list(csv.DictReader(f))
dept_b = SOURCES["psp_alt.csv"]["department"]

con.sql("""
    CREATE OR REPLACE TABLE clean.transactions (
        txn_id VARCHAR, payment_provider VARCHAR, account_ref_masked VARCHAR,
        type VARCHAR, market VARCHAR,
        amount_original DOUBLE, currency_original VARCHAR, amount_usd DOUBLE,
        status_raw VARCHAR, status VARCHAR,
        occurred_at_utc TIMESTAMP, tz_assumed BOOLEAN,
        source_file VARCHAR, department VARCHAR
    )
""")

txn_rows = []
for row in psp_a_rows:
    try:
        dt = datetime.fromisoformat(row["created_at"])  # explicit offset present
        dt_utc = dt.astimezone(timezone.utc).replace(tzinfo=None)
        amount = float(row["amount"])
        ccy = row["currency"]
        amount_usd = round(amount * FX_TO_USD[ccy], 2)
        status = STATUS_MAP[row["status"].strip().lower()]
        txn_rows.append((
            row["txn_id"], "NorthPay", row["account_ref"], row["type"], row["market"],
            amount, ccy, amount_usd, row["status"], status, dt_utc, False,
            "psp_transactions.csv", dept_a,
        ))
        stats["records_ingested"] += 1
        stats["timestamps_normalized"] += 1
        stats["currency_conversions"] += 1
        stats["status_values_mapped"] += 1
        track("psp_transactions.csv")
    except (KeyError, ValueError):
        stats["records_failed_to_parse"] += 1
        track("psp_transactions.csv", ok=False)

for row in psp_b_rows:
    try:
        dt_naive = datetime.strptime(row["local_datetime"], "%m/%d/%Y %H:%M")
        offset = MARKET_UTC_OFFSET.get(row["country"], 0)
        dt_utc = dt_naive - timedelta(hours=offset)
        amount = float(row["value"])
        ccy = row["ccy"]
        amount_usd = round(amount * FX_TO_USD[ccy], 2)
        status = STATUS_MAP[row["result"].strip().lower()]
        txn_type = "deposit" if row["direction"] == "IN" else "withdrawal"
        txn_rows.append((
            row["reference"], "Quantis Pay", row["wallet"], txn_type, row["country"],
            amount, ccy, amount_usd, row["result"], status, dt_utc, True,
            "psp_alt.csv", dept_b,
        ))
        stats["records_ingested"] += 1
        stats["timestamps_normalized"] += 1
        stats["timestamps_assumed_tz"] += 1  # naive local time, tz inferred from market
        stats["currency_conversions"] += 1
        stats["status_values_mapped"] += 1
        track("psp_alt.csv")
    except (KeyError, ValueError):
        stats["records_failed_to_parse"] += 1
        track("psp_alt.csv", ok=False)

con.executemany(
    "INSERT INTO clean.transactions VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)", txn_rows
)

# ---------------------------------------------------------------------------
# 5. crm_campaigns.xlsx
# ---------------------------------------------------------------------------

wb = openpyxl.load_workbook(RAW_DIR / "crm_campaigns.xlsx")
ws = wb.active
dept = SOURCES["crm_campaigns.xlsx"]["department"]

crm_rows = []
for row in ws.iter_rows(min_row=2, values_only=True):
    campaign_name, segment, email, sent_serial, channel = row
    try:
        sent_utc = from_excel_serial(float(sent_serial))
        crm_rows.append((campaign_name, segment, email, sent_utc, True, channel,
                          "crm_campaigns.xlsx", dept))
        stats["records_ingested"] += 1
        stats["timestamps_normalized"] += 1
        stats["timestamps_assumed_tz"] += 1  # excel serial carries no tz marker
        track("crm_campaigns.xlsx")
    except (TypeError, ValueError):
        stats["records_failed_to_parse"] += 1
        track("crm_campaigns.xlsx", ok=False)

con.sql("""
    CREATE OR REPLACE TABLE clean.campaign_sends (
        campaign_name VARCHAR, segment VARCHAR, recipient_email VARCHAR,
        sent_at_utc TIMESTAMP, tz_assumed BOOLEAN, channel VARCHAR,
        source_file VARCHAR, department VARCHAR
    )
""")
con.executemany("INSERT INTO clean.campaign_sends VALUES (?,?,?,?,?,?,?,?)", crm_rows)

# ---------------------------------------------------------------------------
# 6. affiliate_tracking.csv
# ---------------------------------------------------------------------------

with (RAW_DIR / "affiliate_tracking.csv").open() as f:
    aff_rows_raw = list(csv.DictReader(f))
dept = SOURCES["affiliate_tracking.csv"]["department"]

aff_rows = []
for row in aff_rows_raw:
    aff_rows.append((row["click_id"], row["source"], row["account_ref"],
                      row["registration_date"], row["commission_status"],
                      "affiliate_tracking.csv", dept))
    stats["records_ingested"] += 1
    track("affiliate_tracking.csv")

con.sql("""
    CREATE OR REPLACE TABLE clean.affiliate_referrals (
        click_id VARCHAR, source VARCHAR, account_ref VARCHAR,
        registration_date DATE, commission_status VARCHAR,
        source_file VARCHAR, department VARCHAR
    )
""")
con.executemany("INSERT INTO clean.affiliate_referrals VALUES (?,?,?,?,?,?,?)", aff_rows)

# ---------------------------------------------------------------------------
# clean.accounts, clean.sessions, clean.rounds — field-name mapping +
# provider canonicalization, still carrying provenance
# ---------------------------------------------------------------------------

con.sql("""
    CREATE OR REPLACE TABLE clean.accounts AS
    SELECT account_id, username, email, market, currency,
           registered_at::TIMESTAMP AS registered_at_utc,
           status, balance, source_file, department
    FROM raw.pam_accounts
""")

sessions_clean = []
for s in sessions_rows:
    (sid, aid, title, provider_raw, started, ended, rounds, device, sf, d) = s
    sessions_clean.append((sid, aid, title, provider_raw, canonical_provider(provider_raw),
                            started, ended, rounds, device, sf, d))

con.sql("""
    CREATE OR REPLACE TABLE clean.sessions (
        session_id VARCHAR, account_id VARCHAR, game_title VARCHAR,
        provider_raw VARCHAR, provider_canonical VARCHAR,
        started_at_utc TIMESTAMP, ended_at_utc TIMESTAMP, declared_rounds INTEGER,
        device VARCHAR, source_file VARCHAR, department VARCHAR
    )
""")
con.executemany("INSERT INTO clean.sessions VALUES (?,?,?,?,?,?,?,?,?,?,?)", sessions_clean)

rounds_clean = []
game_provider_lookup = {g[0]: g[2] for g in games_rows}  # game_id -> provider_raw
for r in rounds_rows:
    (rid, gid, wallet, ts_raw, stake, payout, outcome, sf, d) = r
    dt_utc = datetime.strptime(ts_raw, "%Y-%m-%d %H:%M:%S")  # assumed UTC
    provider_raw = game_provider_lookup.get(gid, "")
    rounds_clean.append((rid, gid, wallet, canonical_provider(provider_raw),
                          dt_utc, True, stake, payout, outcome, sf, d))

con.sql("""
    CREATE OR REPLACE TABLE clean.rounds (
        round_id VARCHAR, game_id VARCHAR, wallet_masked VARCHAR, provider_canonical VARCHAR,
        occurred_at_utc TIMESTAMP, tz_assumed BOOLEAN, stake DOUBLE, payout DOUBLE,
        outcome VARCHAR, source_file VARCHAR, department VARCHAR
    )
""")
con.executemany("INSERT INTO clean.rounds VALUES (?,?,?,?,?,?,?,?,?,?,?)", rounds_clean)

con.sql("""
    CREATE OR REPLACE TABLE clean.games AS
    SELECT game_id, title, provider_raw, provider_raw AS provider_canonical, rtp,
           source_file, department
    FROM raw.aggregator_games
""")
con.sql("""
    UPDATE clean.games SET provider_canonical = CASE
        WHEN lower(provider_raw) IN ('pragmaticplay','pragmatic play ltd') THEN 'Pragmatic Play'
        WHEN lower(provider_raw) IN ('netent','netent ab') THEN 'NetEnt'
        WHEN lower(provider_raw) IN ('playngo','play n go') THEN 'Play''n GO'
        WHEN lower(provider_raw) IN ('evolution','evolution gaming group') THEN 'Evolution Gaming'
        WHEN lower(provider_raw) IN ('redtiger','red tiger gaming') THEN 'Red Tiger'
        WHEN lower(provider_raw) IN ('hacksaw','hacksaw gaming ltd') THEN 'Hacksaw Gaming'
        ELSE provider_raw
    END
""")

# ---------------------------------------------------------------------------
# persist stats so the API can read them without recomputing ingestion
# ---------------------------------------------------------------------------

sync_at = datetime.now(timezone.utc).isoformat()

con.sql("DROP TABLE IF EXISTS main.pipeline_stats")
con.sql("CREATE TABLE main.pipeline_stats (key VARCHAR, value BIGINT)")
con.executemany("INSERT INTO main.pipeline_stats VALUES (?, ?)", list(stats.items()))

con.sql("DROP TABLE IF EXISTS main.connector_status")
con.sql("""CREATE TABLE main.connector_status (
    source_file VARCHAR, owner VARCHAR, department VARCHAR, format VARCHAR,
    describes VARCHAR, records BIGINT, failed BIGINT, last_sync VARCHAR
)""")
con.executemany(
    "INSERT INTO main.connector_status VALUES (?,?,?,?,?,?,?,?)",
    [
        (fname, meta["owner"], meta["department"], meta["format"], meta["describes"],
         per_source[fname]["records"], per_source[fname]["failed"], sync_at)
        for fname, meta in SOURCES.items()
    ],
)

con.close()

print("INGESTION SUMMARY")
print("=" * 40)
for k, v in stats.items():
    print(f"  {k:<28} {v:>7,}")
