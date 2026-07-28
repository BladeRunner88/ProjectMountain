"""Provenance manifest for the six vendor systems.

Raw source files don't carry a self-referential "which system am I"
column (a real PSP export wouldn't). Instead this manifest is the single
source of truth for where each file came from, so ingestion can tag every
raw row with its origin and that provenance can be carried through
cleaning, resolution, and the findings engine.
"""

SOURCES = {
    "pam_platform.json": {
        "owner": "Platform provider",
        "department": "Platform provider",
        "format": "json",
        "describes": "accounts, sessions, balances",
    },
    "game_aggregator.xml": {
        "owner": "Game aggregator",
        "department": "Game aggregator",
        "format": "xml",
        "describes": "rounds, game ids, providers, RTP, stakes",
    },
    "psp_transactions.csv": {
        "owner": "NorthPay",
        "department": "Payment provider A",
        "format": "csv",
        "describes": "deposits, withdrawals, approvals, declines",
    },
    "psp_alt.csv": {
        "owner": "Quantis Pay",
        "department": "Payment provider B",
        "format": "csv",
        "describes": "deposits, withdrawals, approvals, declines",
    },
    "crm_campaigns.xlsx": {
        "owner": "CRM",
        "department": "CRM",
        "format": "xlsx",
        "describes": "campaign sends, segments, timestamps",
    },
    "affiliate_tracking.csv": {
        "owner": "Affiliate platform",
        "department": "Affiliate platform",
        "format": "csv",
        "describes": "referrals, sources, registrations",
    },
}
