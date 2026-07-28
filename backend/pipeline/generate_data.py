"""Part A — six vendor systems for a synthetic online gaming operator.

Different owners, different formats, different field names for the same
concepts, different status vocabularies, different currencies, and
deliberately inconsistent time handling (including sources with no
timezone at all). No shared id scheme across systems on purpose — the
whole point of the platform is inferring the join.

All data is synthetic. Payment identifiers are masked to last four
characters everywhere they appear.

  pam_platform.json        Platform provider    JSON   accounts, sessions
  game_aggregator.xml      Game aggregator      XML    rounds, games, RTP
  psp_transactions.csv     Payment provider A    CSV    deposits/withdrawals
  psp_alt.csv              Payment provider B    CSV    same, different vocab
  crm_campaigns.xlsx       CRM                  Excel  campaign sends
  affiliate_tracking.csv   Affiliate platform    CSV    referrals

Three seeded operational events (at least one window each) so Part E's
findings have something real to compute, not invent:
  - PSP-B approval rate drops for Germany for a multi day window
  - GameProvider "Red Tiger" goes quiet for several hours (no rounds)
  - A CRM campaign send coincides with a session spike a short time later
"""

import csv
import json
import random
from datetime import date, datetime, timedelta
from pathlib import Path
from xml.dom import minidom
from xml.etree import ElementTree as ET

import openpyxl

random.seed(11)

OUT_DIR = Path(__file__).resolve().parent.parent / "data" / "raw"
OUT_DIR.mkdir(parents=True, exist_ok=True)

TODAY = date.today()
WINDOW_DAYS = 90
WINDOW_START = TODAY - timedelta(days=WINDOW_DAYS)

# ---------------------------------------------------------------------------
# Vocab
# ---------------------------------------------------------------------------

FIRST_NAMES = [
    "James", "Mary", "Robert", "Patricia", "John", "Jennifer", "Michael",
    "Linda", "David", "Elizabeth", "William", "Barbara", "Richard", "Susan",
    "Joseph", "Jessica", "Thomas", "Sarah", "Charles", "Karen", "Daniel",
    "Nancy", "Matthew", "Lisa", "Anthony", "Betty", "Mark", "Margaret",
    "Priya", "Wei", "Fatima", "Hiro", "Olumide", "Ingrid", "Diego", "Aisling",
]
LAST_NAMES = [
    "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller",
    "Davis", "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez",
    "Wilson", "Anderson", "Thomas", "Taylor", "Moore", "Jackson", "Martin",
    "Lee", "Perez", "Thompson", "White", "Harris", "Sanchez", "Clark",
]

# market -> currency
MARKETS = {
    "UK": "GBP", "Ireland": "EUR", "Germany": "EUR",
    "Sweden": "SEK", "Canada": "CAD", "Malta": "EUR",
}
MARKET_NAMES = list(MARKETS.keys())

# canonical provider name -> how each vendor writes it, inconsistently
GAME_PROVIDERS = {
    "Pragmatic Play": {"aggregator": "PragmaticPlay", "platform": "Pragmatic Play Ltd"},
    "NetEnt": {"aggregator": "NETENT", "platform": "NetEnt AB"},
    "Play'n GO": {"aggregator": "PlaynGO", "platform": "Play n GO"},
    "Evolution Gaming": {"aggregator": "Evolution", "platform": "Evolution Gaming Group"},
    "Red Tiger": {"aggregator": "RedTiger", "platform": "Red Tiger Gaming"},
    "Hacksaw Gaming": {"aggregator": "Hacksaw", "platform": "Hacksaw Gaming Ltd"},
}
GAME_TITLES = {
    "Pragmatic Play": ["Wolf Gold", "Sweet Bonanza", "Gates of Olympus"],
    "NetEnt": ["Starburst", "Gonzo's Quest", "Dead or Alive 2"],
    "Play'n GO": ["Book of Dead", "Reactoonz", "Fire Joker"],
    "Evolution Gaming": ["Lightning Roulette", "Crazy Time", "Blackjack Party"],
    "Red Tiger": ["Dragon's Fire", "Pirates Plenty", "Piggy Riches Megaways"],
    "Hacksaw Gaming": ["Wanted Dead or a Wild", "Le Bandit", "Chaos Crew"],
}
QUIET_PROVIDER = "Red Tiger"

PSP_A_NAME, PSP_B_NAME = "NorthPay", "Quantis Pay"
DECLINE_TARGET_MARKET = "Germany"

# ---------------------------------------------------------------------------
# Mess helpers
# ---------------------------------------------------------------------------


def messy_case(s: str) -> str:
    style = random.choice(["as_is", "as_is", "upper", "lower", "title"])
    return {"upper": s.upper(), "lower": s.lower(), "title": s.title()}.get(style, s)


def messy_pad(s: str) -> str:
    if random.random() < 0.25:
        s = " " * random.randint(1, 2) + s
    if random.random() < 0.25:
        s = s + " " * random.randint(1, 2)
    return s


def mask_last4(token: str) -> str:
    digits = "".join(c for c in token if c.isalnum())
    return f"****{digits[-4:]}"


# ---------------------------------------------------------------------------
# Canonical players (ground truth — never written directly to any file)
# ---------------------------------------------------------------------------


def build_players(n=260):
    players = []
    for i in range(n):
        first, last = random.choice(FIRST_NAMES), random.choice(LAST_NAMES)
        market = random.choice(MARKET_NAMES)
        username = f"{first[0].lower()}{last.lower()}{random.randint(10, 999)}"
        email = f"{first.lower()}.{last.lower()}{random.randint(1, 999)}@mailbox.example"
        players.append({
            "idx": i, "first": first, "last": last,
            "username": username, "email": email,
            "market": market, "currency": MARKETS[market],
            "registered_at": WINDOW_START - timedelta(days=random.randint(0, 900)),
            "multi_account": random.random() < 0.12,
        })
    return players


# ---------------------------------------------------------------------------
# 1. pam_platform.json — Platform provider, accounts + sessions
# ---------------------------------------------------------------------------


def build_pam(players):
    accounts, sessions = [], []
    acct_i = 1
    session_i = 1
    account_by_player = {}

    for p in players:
        n_accounts = 2 if p["multi_account"] else 1
        accts_for_player = []
        for _ in range(n_accounts):
            aid = f"ACC-{acct_i:06d}"
            market = p["market"] if not accts_for_player else random.choice(MARKET_NAMES)
            accounts.append({
                "account_id": aid,
                "username": messy_pad(messy_case(p["username"])),
                "email": p["email"],
                "market": market,
                "currency": MARKETS[market],
                "registered_at": p["registered_at"].isoformat() + "T09:00:00Z",
                "status": random.choices(
                    ["active", "active", "active", "self_excluded", "closed"],
                    weights=[70, 10, 10, 5, 5],
                )[0],
                "balance": round(random.uniform(0, 900), 2),
            })
            accts_for_player.append(aid)
            acct_i += 1
        account_by_player[p["idx"]] = accts_for_player

    # session spike event: pick an anchor datetime, spike sessions right after it
    spike_at = datetime.combine(
        WINDOW_START + timedelta(days=random.randint(20, WINDOW_DAYS - 10)),
        datetime.min.time(),
    ) + timedelta(hours=random.randint(9, 15))

    n_sessions = 5000
    for i in range(n_sessions):
        p = random.choice(players)
        aid = random.choice(account_by_player[p["idx"]])
        provider = random.choice(list(GAME_PROVIDERS.keys()))
        game = random.choice(GAME_TITLES[provider])
        started = datetime.combine(
            WINDOW_START + timedelta(days=random.randint(0, WINDOW_DAYS - 1)),
            datetime.min.time(),
        ) + timedelta(hours=random.uniform(0, 24))
        # keep sessions out of the quiet-provider blackout window (defined below)
        rounds = random.randint(3, 80)
        sessions.append({
            "session_id": f"SESS-{session_i:06d}",
            "account_id": aid,
            "game_title": game,
            "game_provider": GAME_PROVIDERS[provider]["platform"],
            "started_at": started.isoformat() + "Z",
            "ended_at": (started + timedelta(minutes=random.randint(2, 90))).isoformat() + "Z",
            "declared_rounds": rounds,
            "device": random.choice(["mobile", "desktop", "mobile", "tablet"]),
        })
        session_i += 1

    # the spike itself: extra sessions clustered in the 90 minutes after spike_at
    for _ in range(260):
        p = random.choice(players)
        aid = random.choice(account_by_player[p["idx"]])
        provider = random.choice(list(GAME_PROVIDERS.keys()))
        game = random.choice(GAME_TITLES[provider])
        started = spike_at + timedelta(minutes=random.randint(0, 90))
        rounds = random.randint(3, 80)
        sessions.append({
            "session_id": f"SESS-{session_i:06d}",
            "account_id": aid,
            "game_title": game,
            "game_provider": GAME_PROVIDERS[provider]["platform"],
            "started_at": started.isoformat() + "Z",
            "ended_at": (started + timedelta(minutes=random.randint(2, 90))).isoformat() + "Z",
            "declared_rounds": rounds,
            "device": random.choice(["mobile", "desktop"]),
        })
        session_i += 1

    path = OUT_DIR / "pam_platform.json"
    path.write_text(json.dumps({"accounts": accounts, "sessions": sessions}, indent=2))
    print(f"wrote {len(accounts):>5} accounts, {len(sessions):>5} sessions -> {path.name}")
    return account_by_player, spike_at


# ---------------------------------------------------------------------------
# 2. game_aggregator.xml — rounds, games, providers, RTP, stakes (naive time)
# ---------------------------------------------------------------------------


def build_aggregator(players):
    root = ET.Element("aggregatorFeed")

    providers_el = ET.SubElement(root, "providers")
    for name, variants in GAME_PROVIDERS.items():
        p_el = ET.SubElement(providers_el, "provider", {"id": name.replace(" ", "").replace("'", "")})
        p_el.text = variants["aggregator"]

    games_el = ET.SubElement(root, "games")
    game_id_by_title = {}
    gid = 1
    for provider, titles in GAME_TITLES.items():
        for title in titles:
            game_id = f"GM-{gid:04d}"
            game_id_by_title[title] = (game_id, provider)
            g_el = ET.SubElement(games_el, "game", {"id": game_id})
            ET.SubElement(g_el, "title").text = title
            ET.SubElement(g_el, "provider").text = GAME_PROVIDERS[provider]["aggregator"]
            ET.SubElement(g_el, "rtp").text = f"{random.uniform(94.5, 97.8):.2f}"
            gid += 1

    # quiet-provider blackout window: several hours with zero rounds
    # (used by the SILENT_SOURCE finding — a partial-day gap)
    blackout_day = WINDOW_START + timedelta(days=random.randint(30, WINDOW_DAYS - 15))
    blackout_start = datetime.combine(blackout_day, datetime.min.time()) + timedelta(hours=10)
    blackout_end = blackout_start + timedelta(hours=7)
    quiet_games = set(GAME_TITLES[QUIET_PROVIDER])

    # a second, different provider goes fully dark for an entire day in the
    # aggregator feed, while the platform's own sessions (generated
    # independently, with no knowledge of the aggregator's outage) keep
    # showing activity for that provider that day — the SOURCE_DIVERGENCE
    # finding's exact scenario: two systems that should agree, don't.
    divergence_provider = "NetEnt"
    divergence_day = WINDOW_START + timedelta(days=random.randint(10, WINDOW_DAYS - 30))
    divergent_games = set(GAME_TITLES[divergence_provider])

    rounds_el = ET.SubElement(root, "rounds")
    n_rounds = 45000
    rid = 1
    while rid <= n_rounds:
        title = random.choice(list(game_id_by_title.keys()))
        game_id, provider = game_id_by_title[title]
        ts = datetime.combine(
            WINDOW_START + timedelta(days=random.randint(0, WINDOW_DAYS - 1)),
            datetime.min.time(),
        ) + timedelta(hours=random.uniform(0, 24))

        if title in quiet_games and blackout_start <= ts <= blackout_end:
            continue  # skip — this provider is silent during the blackout
        if title in divergent_games and ts.date() == divergence_day:
            continue  # skip — this provider reports nothing at all this day

        p = random.choice(players)
        wallet = mask_last4(p["username"] + str(p["idx"]))
        stake = round(random.uniform(0.2, 20), 2)
        outcome = random.choices(["win", "loss"], weights=[42, 58])[0]
        r_el = ET.SubElement(rounds_el, "round", {"id": f"RND-{rid:06d}"})
        ET.SubElement(r_el, "gameId").text = game_id
        ET.SubElement(r_el, "wallet").text = wallet
        ET.SubElement(r_el, "timestamp").text = ts.strftime("%Y-%m-%d %H:%M:%S")  # no tz
        ET.SubElement(r_el, "stake").text = str(stake)
        ET.SubElement(r_el, "payout").text = str(round(stake * random.uniform(0, 3), 2) if outcome == "win" else 0)
        ET.SubElement(r_el, "outcome").text = outcome
        rid += 1

    xml_str = minidom.parseString(ET.tostring(root)).toprettyxml(indent="  ")
    path = OUT_DIR / "game_aggregator.xml"
    path.write_text(xml_str)
    print(f"wrote {n_rounds:>5} rounds -> {path.name}  "
          f"(quiet: {QUIET_PROVIDER} from {blackout_start} to {blackout_end}; "
          f"dark all day: {divergence_provider} on {divergence_day})")
    return blackout_start, blackout_end


# ---------------------------------------------------------------------------
# 3. psp_transactions.csv — Payment provider A (NorthPay)
# ---------------------------------------------------------------------------


def build_psp_a(players, account_by_player):
    rows = []
    txn = 1
    for _ in range(10000):
        p = random.choice(players)
        aid = random.choice(account_by_player[p["idx"]])
        ts = datetime.combine(
            WINDOW_START + timedelta(days=random.randint(0, WINDOW_DAYS - 1)), datetime.min.time()
        ) + timedelta(hours=random.uniform(0, 24))
        offset = random.choice(["+00:00", "+01:00", "-05:00", "+02:00"])
        status = random.choices(["approved", "declined", "pending"], weights=[82, 13, 5])[0]
        rows.append({
            "txn_id": f"NP-{txn:07d}",
            "account_ref": mask_last4(aid),
            "type": random.choice(["deposit", "deposit", "deposit", "withdrawal"]),
            "amount": round(random.uniform(10, 800), 2),
            "currency": p["currency"],
            "status": status,
            "created_at": ts.strftime("%Y-%m-%dT%H:%M:%S") + offset,
            "payment_method_masked": mask_last4(f"card{random.randint(10**12, 10**13)}"),
            "market": p["market"],
        })
        txn += 1
    path = OUT_DIR / "psp_transactions.csv"
    with path.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    print(f"wrote {len(rows):>5} rows -> {path.name}")


# ---------------------------------------------------------------------------
# 4. psp_alt.csv — Payment provider B (Quantis Pay): different field names,
#    different status vocabulary, different currency handling, naive local
#    time, and a deliberately depressed approval rate for one market
# ---------------------------------------------------------------------------


def build_psp_b(players, account_by_player):
    rows = []
    ref = 1

    decline_day = WINDOW_START + timedelta(days=random.randint(35, WINDOW_DAYS - 20))
    decline_window = (decline_day, decline_day + timedelta(days=5))

    for _ in range(8000):
        p = random.choice(players)
        aid = random.choice(account_by_player[p["idx"]])
        d = WINDOW_START + timedelta(days=random.randint(0, WINDOW_DAYS - 1))
        ts = datetime.combine(d, datetime.min.time()) + timedelta(hours=random.uniform(0, 24))

        in_target_window = (
            p["market"] == DECLINE_TARGET_MARKET and decline_window[0] <= d <= decline_window[1]
        )
        if in_target_window:
            result = random.choices(
                ["SETTLED", "FAILED", "PENDING_REVIEW"], weights=[20, 72, 8]
            )[0]
        else:
            result = random.choices(
                ["SETTLED", "FAILED", "PENDING_REVIEW"], weights=[80, 14, 6]
            )[0]

        rows.append({
            "reference": f"QP{ref:07d}",
            "wallet": mask_last4(aid),
            "direction": random.choice(["IN", "IN", "IN", "OUT"]),
            "value": round(random.uniform(10, 800) * (0.92 if p["currency"] != "EUR" else 1), 2),
            "ccy": p["currency"],
            "result": result,
            "local_datetime": ts.strftime("%m/%d/%Y %H:%M"),  # naive, no tz
            "card_masked": mask_last4(f"card{random.randint(10**12, 10**13)}"),
            "country": p["market"],
        })
        ref += 1

    # a handful of genuinely malformed rows — a real export defect, not a
    # simulated one, so a "Degraded" connector status downstream reflects
    # an actual parse failure rather than an invented one
    n_malformed = 0
    for _ in range(18):
        p = random.choice(players)
        aid = random.choice(account_by_player[p["idx"]])
        rows.append({
            "reference": f"QP{ref:07d}",
            "wallet": mask_last4(aid),
            "direction": random.choice(["IN", "OUT"]),
            "value": round(random.uniform(10, 800), 2),
            "ccy": p["currency"],
            "result": random.choice(["SETTLED", "FAILED"]),
            "local_datetime": "",  # export defect: timestamp missing entirely
            "card_masked": mask_last4(f"card{random.randint(10**12, 10**13)}"),
            "country": p["market"],
        })
        ref += 1
        n_malformed += 1

    random.shuffle(rows)
    path = OUT_DIR / "psp_alt.csv"
    with path.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    print(f"wrote {len(rows):>5} rows -> {path.name}  "
          f"(approval drop: {DECLINE_TARGET_MARKET} {decline_window[0]} to {decline_window[1]}; "
          f"{n_malformed} rows with missing timestamp)")
    return decline_window


# ---------------------------------------------------------------------------
# 5. crm_campaigns.xlsx — CRM campaign sends (Excel serial datetime)
# ---------------------------------------------------------------------------

EXCEL_EPOCH = datetime(1899, 12, 30)


def excel_serial_datetime(dt: datetime) -> float:
    return (dt - EXCEL_EPOCH).total_seconds() / 86400


def build_crm(players, spike_at):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Sends"
    ws.append(["campaign_name", "segment", "recipient_email", "sent_at", "channel"])

    campaign_names = [
        "Weekend Reload Bonus", "VIP Birthday Offer", "Welcome Series Part 2",
        "Free Spins Friday", "Win Back 30 Day", "New Game Launch Alert",
        "Deposit Match Tuesday", "Loyalty Tier Upgrade", "Abandoned Signup Nudge",
        "Big Match Weekend Promo",
    ]
    segments = ["High Value", "New Players", "Dormant 30d", "All Active", "VIP"]
    channels = ["email", "email", "sms", "push"]

    row_n = 0
    for _ in range(1800):
        d = WINDOW_START + timedelta(days=random.randint(0, WINDOW_DAYS - 1))
        sent = datetime.combine(d, datetime.min.time()) + timedelta(hours=random.uniform(7, 21))
        ws.append([
            random.choice(campaign_names),
            random.choice(segments),
            random.choice(players)["email"],
            excel_serial_datetime(sent),
            random.choice(channels),
        ])
        row_n += 1

    # the campaign send that precedes the session spike
    trigger_sent = spike_at - timedelta(minutes=random.randint(10, 35))
    for _ in range(400):
        ws.append([
            "Big Match Weekend Promo",
            "All Active",
            random.choice(players)["email"],
            excel_serial_datetime(trigger_sent),
            "push",
        ])
        row_n += 1

    path = OUT_DIR / "crm_campaigns.xlsx"
    wb.save(path)
    print(f"wrote {row_n:>5} rows -> {path.name}  (trigger send at {trigger_sent})")
    return trigger_sent


# ---------------------------------------------------------------------------
# 6. affiliate_tracking.csv — referrals, date only, own account reference
# ---------------------------------------------------------------------------


def build_affiliate(players, account_by_player):
    sources = ["SearchAds-Google", "AffPartner-BetLink", "AffPartner-CasinoHub",
               "Influencer-StreamX", "Direct-Referral", "SocialAds-Meta"]
    rows = []
    chosen = random.sample(players, k=min(400, len(players)))
    for i, p in enumerate(chosen):
        aid = account_by_player[p["idx"]][0]
        numeric = aid.split("-")[1]
        rows.append({
            "click_id": f"CLK-{i + 1:06d}",
            "source": random.choice(sources),
            "account_ref": f"REF-{numeric}",
            "registration_date": p["registered_at"].isoformat(),
            "commission_status": random.choice(["pending", "approved", "approved", "void"]),
        })
    random.shuffle(rows)
    path = OUT_DIR / "affiliate_tracking.csv"
    with path.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    print(f"wrote {len(rows):>5} rows -> {path.name}")


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    for old in OUT_DIR.glob("*"):
        old.unlink()

    players = build_players()
    account_by_player, spike_at = build_pam(players)
    blackout_start, blackout_end = build_aggregator(players)
    build_psp_a(players, account_by_player)
    decline_window = build_psp_b(players, account_by_player)
    trigger_sent = build_crm(players, spike_at)
    build_affiliate(players, account_by_player)

    print("\nseeded operational events:")
    print(f"  1. approval rate drop   : Quantis Pay / {DECLINE_TARGET_MARKET} "
          f"/ {decline_window[0]} to {decline_window[1]}")
    print(f"  2. provider goes quiet  : {QUIET_PROVIDER} / {blackout_start} to {blackout_end}")
    print(f"  3. campaign -> spike    : send at {trigger_sent}, session spike at {spike_at} "
          f"({round((spike_at - trigger_sent).total_seconds() / 60)} min gap)")
