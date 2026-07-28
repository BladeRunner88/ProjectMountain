"""Part E — the five computable finding types.

Every number here comes from a query against clean.* / graph.* — nothing
is invented, no confidence percentage is fabricated. Language never
asserts causation: findings say a value moved, or that two things
occurred alongside each other, and stop there. The reviewer concludes.

Finding types, and why these five and no others: they are the ones
answerable without inventing anything.
  RATE_SHIFT          a rate moved outside its own trailing baseline
  SOURCE_DIVERGENCE    two systems that should agree do not
  VOLUME_ANOMALY       a count outside its normal distribution, in std devs
  SILENT_SOURCE        a source stopped reporting; cheapest and most useful
  CO_OCCURRENCE        two cross-source events landed in the same window
"""

import json
import statistics
from datetime import timedelta
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parent.parent
DB_PATH = ROOT / "isildur.duckdb"

con = duckdb.connect(str(DB_PATH))
con.sql("CREATE SCHEMA IF NOT EXISTS findings")

findings: list[dict] = []
_counter = 0


def new_id(prefix: str) -> str:
    global _counter
    _counter += 1
    return f"{prefix}_{_counter:04d}"


def add_finding(finding_type, title, description, sources, computed, window, entities, evidence):
    findings.append({
        "id": new_id("find"),
        "finding_type": finding_type,
        "title": title,
        "description": description,
        "sources": sources,
        "computed": computed,
        "window": window,
        "entities": entities,
        "reviewer_status": "Open",
        "reviewed_by": None,
        "reviewed_at": None,
        "evidence": evidence,
    })


# ---------------------------------------------------------------------------
# 1. RATE SHIFT — deposit approval rate per (payment provider, market).
#    Day-level rates are too noisy at this volume (a handful of txns/day
#    makes single-day rates swing wildly by chance), so this slides a
#    5-day window across the period and runs a two-proportion z-test
#    against everything outside the window — a properly powered test
#    accounts for sample size instead of treating every noisy day as a
#    shift. Only the single most extreme non-overlapping window per pair
#    is reported.
# ---------------------------------------------------------------------------

ROLLING_DAYS = 5
MIN_WINDOW_N = 25
Z_THRESHOLD = 4.0


def two_proportion_z(x1, n1, x2, n2):
    if n1 == 0 or n2 == 0:
        return 0.0
    p1, p2 = x1 / n1, x2 / n2
    pooled = (x1 + x2) / (n1 + n2)
    se = (pooled * (1 - pooled) * (1 / n1 + 1 / n2)) ** 0.5
    if se == 0:
        return 0.0
    return (p1 - p2) / se


pairs = con.sql("SELECT DISTINCT payment_provider, market FROM clean.transactions").fetchall()

for provider, market in pairs:
    daily = con.sql("""
        SELECT date_trunc('day', occurred_at_utc) AS day,
               count(*) AS total,
               sum(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS approved
        FROM clean.transactions
        WHERE payment_provider = ? AND market = ? AND type = 'deposit'
        GROUP BY 1 ORDER BY 1
    """, params=[provider, market]).fetchall()
    if len(daily) < ROLLING_DAYS + 10:
        continue

    total_n = sum(d[1] for d in daily)
    total_x = sum(d[2] for d in daily)

    best = None
    for i in range(len(daily) - ROLLING_DAYS + 1):
        window = daily[i:i + ROLLING_DAYS]
        n1 = sum(d[1] for d in window)
        x1 = sum(d[2] for d in window)
        if n1 < MIN_WINDOW_N:
            continue
        n2, x2 = total_n - n1, total_x - x1
        z = two_proportion_z(x1, n1, x2, n2)
        if z <= -Z_THRESHOLD and (best is None or z < best[0]):
            best = (z, window, n1, x1, n2, x2)

    if best is None:
        continue
    z, window, n1, x1, n2, x2 = best
    current_rate = x1 / n1
    baseline_rate = x2 / n2
    window_start, window_end = window[0][0], window[-1][0] + timedelta(days=1)

    add_finding(
        finding_type="RATE_SHIFT",
        title=f"Deposit approval rate shifted for {provider} in {market}",
        description=(
            f"Deposit approval rate for {provider} in {market} moved to "
            f"{current_rate:.1%} over a {ROLLING_DAYS} day window, against a trailing "
            f"baseline of {baseline_rate:.1%} (z = {z:.1f}, n = {n1})."
        ),
        sources=[provider, "clean.transactions"],
        computed={"current_rate": round(current_rate, 4), "baseline_rate": round(baseline_rate, 4),
                  "deviation_pp": round((current_rate - baseline_rate) * 100, 1),
                  "z_score": round(z, 2), "window_n": n1, "unit": "percentage_points"},
        window={"start": str(window_start), "end": str(window_end)},
        entities=[{"type": "PaymentProvider", "name": provider}, {"type": "Market", "name": market}],
        evidence={"window_transactions": n1, "window_approved": x1,
                  "baseline_transactions": n2, "baseline_approved": x2,
                  "daily_rates": [{"day": str(d), "rate": round(a / t, 4) if t else None, "n": t}
                                  for d, t, a in daily]},
    )

# ---------------------------------------------------------------------------
# 2. SOURCE DIVERGENCE — platform reports session activity for a game that
#    the aggregator reports no rounds for, same day
# ---------------------------------------------------------------------------

platform_daily = con.sql("""
    SELECT game_title, date_trunc('day', started_at_utc) AS day, count(*) AS n_sessions
    FROM clean.sessions GROUP BY 1, 2 HAVING count(*) >= 3
""").fetchall()

aggregator_daily = dict()
for game_title, day, n_rounds in con.sql("""
    SELECT g.title, date_trunc('day', r.occurred_at_utc) AS day, count(*) AS n_rounds
    FROM clean.rounds r JOIN clean.games g ON r.game_id = g.game_id
    GROUP BY 1, 2
""").fetchall():
    aggregator_daily[(game_title, day)] = n_rounds

for game_title, day, n_sessions in platform_daily:
    n_rounds = aggregator_daily.get((game_title, day), 0)
    if n_rounds == 0:
        add_finding(
            finding_type="SOURCE_DIVERGENCE",
            title=f"{game_title} shows platform activity with no aggregator rounds",
            description=(
                f"Platform provider recorded {n_sessions} sessions for {game_title} on "
                f"{day.date()}. Game aggregator reports no rounds for that game on the same day."
            ),
            sources=["pam_platform.json", "game_aggregator.xml"],
            computed={"platform_sessions": n_sessions, "aggregator_rounds": n_rounds},
            window={"start": str(day), "end": str(day + timedelta(days=1))},
            entities=[{"type": "Game", "name": game_title}],
            evidence={"platform_sessions": n_sessions, "aggregator_rounds": n_rounds, "day": str(day)},
        )

# ---------------------------------------------------------------------------
# 3. VOLUME ANOMALY — daily counts per entity type outside 2.5 std devs
# ---------------------------------------------------------------------------

VOLUME_QUERIES = {
    "sessions": "SELECT date_trunc('day', started_at_utc) AS day, count(*) FROM clean.sessions GROUP BY 1",
    "rounds": "SELECT date_trunc('day', occurred_at_utc) AS day, count(*) FROM clean.rounds GROUP BY 1",
    "deposits": "SELECT date_trunc('day', occurred_at_utc) AS day, count(*) FROM clean.transactions WHERE type='deposit' GROUP BY 1",
}

volume_anomalies_by_day = {}  # for reuse in co-occurrence

for entity_type, query in VOLUME_QUERIES.items():
    daily = con.sql(query).fetchall()
    counts = [c for _, c in daily]
    mean_c = statistics.mean(counts)
    stdev_c = statistics.pstdev(counts)
    if stdev_c == 0:
        continue
    for day, count in daily:
        z = (count - mean_c) / stdev_c
        if abs(z) >= 2.5:
            add_finding(
                finding_type="VOLUME_ANOMALY",
                title=f"{entity_type.capitalize()} volume anomaly on {day.date()}",
                description=(
                    f"{entity_type.capitalize()} count on {day.date()} was {count:,}, "
                    f"{abs(z):.1f} standard deviations from its normal distribution."
                ),
                sources=["clean." + entity_type if entity_type != "deposits" else "clean.transactions"],
                computed={"count": count, "mean": round(mean_c, 1), "stdev": round(stdev_c, 1),
                          "deviation_std": round(z, 2)},
                window={"start": str(day), "end": str(day + timedelta(days=1))},
                entities=[{"type": "EntityType", "name": entity_type}],
                evidence={"count": count, "mean": round(mean_c, 1), "stdev": round(stdev_c, 1)},
            )
            if z > 0:
                volume_anomalies_by_day.setdefault(entity_type, []).append((day, count, z))

# ---------------------------------------------------------------------------
# 4. SILENT SOURCE — provider's max inter-round gap far exceeds its median
# ---------------------------------------------------------------------------

providers = con.sql("SELECT DISTINCT provider_canonical FROM clean.rounds").fetchall()
for (provider,) in providers:
    timestamps = [t for (t,) in con.sql(
        "SELECT occurred_at_utc FROM clean.rounds WHERE provider_canonical = ? ORDER BY 1",
        params=[provider],
    ).fetchall()]
    if len(timestamps) < 20:
        continue
    gaps = [(timestamps[i + 1] - timestamps[i]).total_seconds() / 60 for i in range(len(timestamps) - 1)]
    median_gap = statistics.median(gaps)
    max_gap = max(gaps)
    max_idx = gaps.index(max_gap)
    if median_gap > 0 and max_gap >= median_gap * 15 and max_gap >= 240:
        last_seen = timestamps[max_idx]
        resumed_at = timestamps[max_idx + 1]
        add_finding(
            finding_type="SILENT_SOURCE",
            title=f"{provider} stopped reporting rounds for {max_gap / 60:.1f} hours",
            description=(
                f"{provider} last reported a round at {last_seen}, then produced nothing until "
                f"{resumed_at}. Its typical gap between rounds is {median_gap:.1f} minutes."
            ),
            sources=["game_aggregator.xml"],
            computed={"gap_minutes": round(max_gap, 1), "expected_gap_minutes": round(median_gap, 1),
                      "gap_multiple": round(max_gap / median_gap, 1)},
            window={"start": str(last_seen), "end": str(resumed_at)},
            entities=[{"type": "GameProvider", "name": provider}],
            evidence={"last_seen": str(last_seen), "resumed_at": str(resumed_at),
                      "expected_gap_minutes": round(median_gap, 1)},
        )

# ---------------------------------------------------------------------------
# 5. CO OCCURRENCE — a campaign send shortly before a session volume spike.
#    Never state one produced the other.
# ---------------------------------------------------------------------------

for day, count, z in volume_anomalies_by_day.get("sessions", []):
    window_start, window_end = day, day + timedelta(days=1)
    sends = con.sql("""
        SELECT campaign_name, sent_at_utc FROM clean.campaign_sends
        WHERE sent_at_utc >= ? AND sent_at_utc < ?
        ORDER BY sent_at_utc
    """, params=[window_start, window_end]).fetchall()
    if not sends:
        continue

    # find the peak 15 minute bucket of sessions that day to anchor the gap
    peak_bucket = con.sql("""
        SELECT date_trunc('hour', started_at_utc)
               + INTERVAL (floor(date_part('minute', started_at_utc) / 15) * 15) MINUTE AS bucket,
               count(*) AS n
        FROM clean.sessions
        WHERE started_at_utc >= ? AND started_at_utc < ?
        GROUP BY 1 ORDER BY n DESC LIMIT 1
    """, params=[window_start, window_end]).fetchone()
    if not peak_bucket:
        continue
    spike_time = peak_bucket[0]

    campaign_name, sent_at = min(sends, key=lambda s: abs((s[1] - spike_time).total_seconds()))
    gap_minutes = round((spike_time - sent_at).total_seconds() / 60, 1)
    if -180 <= gap_minutes <= 180:
        add_finding(
            finding_type="CO_OCCURRENCE",
            title=f"Session spike on {day.date()} occurs alongside a campaign send",
            description=(
                f"A session volume spike on {day.date()} occurs alongside the "
                f"\"{campaign_name}\" campaign send, {abs(gap_minutes):.0f} minutes apart. "
                f"This does not establish that one caused the other."
            ),
            sources=["crm_campaigns.xlsx", "pam_platform.json"],
            computed={"gap_minutes": gap_minutes, "session_count": count, "deviation_std": round(z, 2)},
            window={"start": str(window_start), "end": str(window_end)},
            entities=[{"type": "Campaign", "name": campaign_name}],
            evidence={"campaign_sent_at": str(sent_at), "spike_bucket": str(spike_time),
                      "session_count_that_day": count},
        )

# ---------------------------------------------------------------------------
# persist
# ---------------------------------------------------------------------------

con.sql("DROP TABLE IF EXISTS findings.findings")
con.sql("""
    CREATE TABLE findings.findings (
        id VARCHAR, finding_type VARCHAR, title VARCHAR, description VARCHAR,
        sources_json VARCHAR, computed_json VARCHAR, window_json VARCHAR,
        entities_json VARCHAR, reviewer_status VARCHAR, reviewed_by VARCHAR,
        reviewed_at VARCHAR, evidence_json VARCHAR
    )
""")
rows = [
    (f["id"], f["finding_type"], f["title"], f["description"],
     json.dumps(f["sources"]), json.dumps(f["computed"]), json.dumps(f["window"]),
     json.dumps(f["entities"]), f["reviewer_status"], f["reviewed_by"], f["reviewed_at"],
     json.dumps(f["evidence"]))
    for f in findings
]
con.executemany("INSERT INTO findings.findings VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", rows)
con.close()

print("FINDINGS SUMMARY")
print("=" * 60)
by_type = {}
for f in findings:
    by_type.setdefault(f["finding_type"], []).append(f)
for ftype, items in by_type.items():
    print(f"\n{ftype} ({len(items)})")
    for f in items[:5]:
        print(f"  - {f['title']}")
        print(f"    {f['computed']}")
print(f"\ntotal findings: {len(findings)}")
