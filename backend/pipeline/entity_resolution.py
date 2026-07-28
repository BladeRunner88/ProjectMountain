"""Resolve accounts to players and build graph.objects / graph.links from
the normalized clean.* tables, following the ontology in ontology.py.

Player resolution: accounts are grouped by normalized username (accounts
belonging to the same player carry the same underlying username, just
formatted differently — casing, whitespace). No fuzzy matching needed
here; the mess is formatting, not representation, so NORMALIZE + EXACT
MATCH is sufficient and honestly reported as such.

Cross-source links use derivable-but-not-identical keys, exactly the
"no shared key, must be inferred" scenario the brief asks for:
  - MADE_BY (Transaction -> Account): last 4 chars of the masked account
    reference matched against account ids. Collisions are possible with
    296 accounts and a 4-char space; unresolved/ambiguous matches are
    counted, not hidden.
  - REFERRED (AffiliateSource -> Account): the numeric core of the
    affiliate's own reference format matched against the account id's
    numeric core.
  - TARGETED (Campaign -> Player): CRM's recipient email matched against
    the account's email (an exact, reliable match — CRM tools do hold
    real contact info).
  - PLAYED (Account -> Game): session's game title matched against the
    aggregator's game catalog.
"""

import json
import re
import sys
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))  # ontology.py lives at backend root

import ontology

DB_PATH = ROOT / "isildur.duckdb"

con = duckdb.connect(str(DB_PATH))
con.sql("CREATE SCHEMA IF NOT EXISTS graph")

report = {}

# ---------------------------------------------------------------------------
# Player resolution: group accounts by normalized username
# ---------------------------------------------------------------------------

accounts = con.sql(
    "SELECT account_id, username, email, market, currency, registered_at_utc, status FROM clean.accounts"
).fetchall()

groups: dict[str, list] = {}
for row in accounts:
    key = row[1].strip().lower()
    groups.setdefault(key, []).append(row)

players_by_key = {}
player_objects = []
account_objects = []
belongs_to_links = []

for i, (key, rows) in enumerate(sorted(groups.items()), start=1):
    player_id = f"player_{i:05d}"
    players_by_key[key] = player_id
    canonical_row = rows[0]
    player_objects.append({
        "id": player_id, "type": "Player",
        "properties": {
            "name": canonical_row[1].strip(),
            "market": canonical_row[3],
            "registered_at": str(canonical_row[5]),
        },
        "n_accounts": len(rows),
    })
    for r in rows:
        account_id, username, email, market, currency, registered_at, status = r
        account_objects.append({
            "id": account_id, "type": "Account",
            "properties": {
                "account_ref": account_id, "market": market,
                "currency": currency, "status": status,
            },
        })
        belongs_to_links.append((account_id, player_id, "BELONGS_TO"))

report["accounts_ingested"] = len(accounts)
report["players_resolved"] = len(players_by_key)
report["multi_account_players"] = sum(1 for rows in groups.values() if len(rows) > 1)

# ---------------------------------------------------------------------------
# GameProvider + Game objects, SUPPLIED_BY links
# ---------------------------------------------------------------------------

games = con.sql("SELECT game_id, title, provider_canonical, rtp FROM clean.games").fetchall()
providers = sorted({g[2] for g in games})

provider_objects = [{"id": f"provider_{i+1:02d}", "type": "GameProvider", "properties": {"name": p}}
                     for i, p in enumerate(providers)]
provider_id_by_name = {p["properties"]["name"]: p["id"] for p in provider_objects}

game_objects = []
game_id_by_title = {}
supplied_by_links = []
for gid, title, provider, rtp in games:
    obj_id = f"game_{gid}"
    game_objects.append({"id": obj_id, "type": "Game", "properties": {"title": title, "rtp": rtp}})
    game_id_by_title[title] = obj_id
    supplied_by_links.append((obj_id, provider_id_by_name[provider], "SUPPLIED_BY"))

# ---------------------------------------------------------------------------
# PLAYED links: Account -> Game, from sessions
# ---------------------------------------------------------------------------

sessions = con.sql("SELECT account_id, game_title FROM clean.sessions").fetchall()
played_links = []
unmatched_games = 0
for account_id, title in sessions:
    game_obj = game_id_by_title.get(title)
    if game_obj:
        played_links.append((account_id, game_obj, "PLAYED"))
    else:
        unmatched_games += 1
report["sessions_linked_to_games"] = len(played_links)
report["sessions_unmatched_game"] = unmatched_games

# ---------------------------------------------------------------------------
# PaymentProvider + Transaction objects, PROCESSED_BY + MADE_BY links
# ---------------------------------------------------------------------------

account_last4 = {}
for account_id, *_ in accounts:
    account_last4.setdefault(account_id[-4:], []).append(account_id)

account_numeric = {re.sub(r"\D", "", account_id): account_id for account_id, *_ in accounts}

payment_providers = con.sql("SELECT DISTINCT payment_provider FROM clean.transactions").fetchall()
payment_provider_objects = [
    {"id": f"psp_{i+1:02d}", "type": "PaymentProvider", "properties": {"name": p[0]}}
    for i, p in enumerate(payment_providers)
]
psp_id_by_name = {p["properties"]["name"]: p["id"] for p in payment_provider_objects}

transactions = con.sql("""
    SELECT txn_id, payment_provider, account_ref_masked, type, market,
           amount_original, currency_original, amount_usd, status_raw, status,
           occurred_at_utc, tz_assumed, source_file, department
    FROM clean.transactions
""").fetchall()

transaction_objects = []
processed_by_links = []
made_by_links = []
txn_unresolved = 0
txn_ambiguous = 0

for t in transactions:
    (txn_id, psp, ref_masked, ttype, market, amount, ccy, amount_usd,
     status_raw, status, occurred_at, tz_assumed, sf, dept) = t
    transaction_objects.append({
        "id": txn_id, "type": "Transaction",
        "properties": {
            "type": ttype, "amount": amount_usd, "currency": "USD",
            "status": status, "occurred_at": str(occurred_at),
        },
    })
    processed_by_links.append((txn_id, psp_id_by_name[psp], "PROCESSED_BY"))

    last4 = ref_masked.replace("*", "")
    candidates = account_last4.get(last4, [])
    if len(candidates) == 1:
        made_by_links.append((txn_id, candidates[0], "MADE_BY"))
    elif len(candidates) == 0:
        txn_unresolved += 1
    else:
        txn_ambiguous += 1

report["transactions_resolved_to_account"] = len(made_by_links)
report["transactions_unresolved"] = txn_unresolved
report["transactions_ambiguous_last4"] = txn_ambiguous

# ---------------------------------------------------------------------------
# Campaign objects, TARGETED links (Campaign -> Player via email)
# ---------------------------------------------------------------------------

email_to_player = {}
for row in accounts:
    account_id, username, email, *_ = row
    key = username.strip().lower()
    if email:
        email_to_player[email.strip().lower()] = players_by_key[key]

campaign_rows = con.sql("""
    SELECT DISTINCT campaign_name, segment, channel FROM clean.campaign_sends
""").fetchall()
campaign_objects = [
    {"id": f"campaign_{i+1:03d}", "type": "Campaign",
     "properties": {"name": c[0], "segment": c[1], "channel": c[2]}}
    for i, c in enumerate(campaign_rows)
]
campaign_id_by_key = {(c[0], c[1], c[2]): campaign_objects[i]["id"] for i, c in enumerate(campaign_rows)}

sends = con.sql("SELECT campaign_name, segment, channel, recipient_email FROM clean.campaign_sends").fetchall()
targeted_links = set()
sends_unresolved = 0
for name, segment, channel, email in sends:
    cid = campaign_id_by_key[(name, segment, channel)]
    player_id = email_to_player.get(email.strip().lower())
    if player_id:
        targeted_links.add((cid, player_id, "TARGETED"))
    else:
        sends_unresolved += 1
targeted_links = list(targeted_links)
report["campaign_sends_total"] = len(sends)
report["campaign_sends_resolved_to_player"] = len(sends) - sends_unresolved
report["campaign_sends_unresolved"] = sends_unresolved

# ---------------------------------------------------------------------------
# AffiliateSource objects, REFERRED links (AffiliateSource -> Account)
# ---------------------------------------------------------------------------

aff_rows = con.sql("SELECT source, account_ref FROM clean.affiliate_referrals").fetchall()
aff_sources = sorted({r[0] for r in aff_rows})
affiliate_objects = [{"id": f"affiliate_{i+1:02d}", "type": "AffiliateSource", "properties": {"name": s}}
                      for i, s in enumerate(aff_sources)]
aff_id_by_name = {s: affiliate_objects[i]["id"] for i, s in enumerate(aff_sources)}

referred_links = []
ref_unresolved = 0
for source, account_ref in aff_rows:
    numeric = re.sub(r"\D", "", account_ref)
    account_id = account_numeric.get(numeric)
    if account_id:
        referred_links.append((aff_id_by_name[source], account_id, "REFERRED"))
    else:
        ref_unresolved += 1
report["affiliate_referrals_total"] = len(aff_rows)
report["affiliate_referrals_resolved"] = len(referred_links)
report["affiliate_referrals_unresolved"] = ref_unresolved

# ---------------------------------------------------------------------------
# Market objects, OPERATES_IN links (Account -> Market)
# ---------------------------------------------------------------------------

market_rows = con.sql("SELECT DISTINCT market, currency FROM clean.accounts").fetchall()
market_objects = [{"id": f"market_{i+1:02d}", "type": "Market", "properties": {"name": m, "currency": c}}
                   for i, (m, c) in enumerate(market_rows)]
market_id_by_name = {m: market_objects[i]["id"] for i, (m, c) in enumerate(market_rows)}

operates_in_links = [(account_id, market_id_by_name[market], "OPERATES_IN")
                      for account_id, username, email, market, *_ in accounts]

# ---------------------------------------------------------------------------
# write graph.objects / graph.links / graph.resolution_map
# ---------------------------------------------------------------------------

all_objects = (player_objects + account_objects + provider_objects + game_objects
               + payment_provider_objects + transaction_objects + campaign_objects
               + affiliate_objects + market_objects)

object_rows = []
for o in all_objects:
    schema_props = ontology.OBJECT_TYPES[o["type"]].properties
    data = {k: o["properties"].get(k) for k in schema_props}
    object_rows.append((o["id"], o["type"], json.dumps(data)))

con.sql("DROP TABLE IF EXISTS graph.objects")
con.sql("CREATE TABLE graph.objects (id VARCHAR, type VARCHAR, properties_json VARCHAR)")
con.executemany("INSERT INTO graph.objects VALUES (?, ?, ?)", object_rows)

all_links = (belongs_to_links + played_links + supplied_by_links + processed_by_links
             + made_by_links + list(targeted_links) + referred_links + operates_in_links)

con.sql("DROP TABLE IF EXISTS graph.links")
con.sql("CREATE TABLE graph.links (source_id VARCHAR, target_id VARCHAR, rel_type VARCHAR)")
con.executemany("INSERT INTO graph.links VALUES (?, ?, ?)", all_links)

# resolution_map: which raw account rows collapsed into which player
resolution_rows = []
for key, rows in groups.items():
    player_id = players_by_key[key]
    for r in rows:
        resolution_rows.append(("Player", "clean.accounts", r[0], r[1], player_id))

con.sql("DROP TABLE IF EXISTS graph.resolution_map")
con.sql("""CREATE TABLE graph.resolution_map (
    object_type VARCHAR, source_table VARCHAR, source_id VARCHAR,
    raw_name VARCHAR, canonical_id VARCHAR
)""")
con.executemany("INSERT INTO graph.resolution_map VALUES (?, ?, ?, ?, ?)", resolution_rows)

con.sql("DROP TABLE IF EXISTS main.resolution_stats")
con.sql("CREATE TABLE main.resolution_stats (key VARCHAR, value BIGINT)")
con.executemany("INSERT INTO main.resolution_stats VALUES (?, ?)", list(report.items()))

con.close()

print("RESOLUTION SUMMARY")
print("=" * 40)
for k, v in report.items():
    print(f"  {k:<34} {v:>7,}")
print(f"\n  objects: {len(all_objects):,}   links: {len(all_links):,}")
