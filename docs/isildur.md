# Isildur / ASE — Product Requirements Document

| Field | Value |
|---|---|
| **Title** | Isildur / ASE Product Requirements and Product Documentation |
| **Purpose** | Long-term product reference for developers, PMs, stakeholders, and future contributors. Describes what the product is, how users interact with it, and how the current prototype actually behaves. |
| **Last updated** | Thursday, 13 August 2026 |
| **Source of truth** | Derived from the Isildur codebase at the time of writing (frontend, backend, pipeline, marketing copy, and working-tree changes). Not a separately authored vision document. |
| **Scope** | This repository is a **local working prototype**. There is no cloud deployment, no real user accounts, no external SaaS integrations, and all sample data is synthetic. |

### How to read evidence labels

Throughout this document:

| Label | Meaning |
|---|---|
| **Confirmed** | Directly implemented in code, data, or routed UI. |
| **Reasonable inference** | Strongly implied by copy, comments, or architecture, but not a separately verified production behavior. |
| **Uncertain / incomplete** | Stubbed, marketing-only, session-only, contradictory across layers, or only partially wired. |

---

## 1. Product Overview

### 1.1 What is Isildur?

**Confirmed.** Isildur is the company. **ASE** (the product in this repository) is an ontology-powered data intelligence platform. The landing page describes it as:

> a data intelligence platform. It connects the systems an organization already runs, resolves messy records into clean entities, and models every relationship as a single searchable graph.

The hero line is: *“Every system speaks. Nothing understands.”* The stated purpose is to turn scattered operational data into one picture a person can act on.

A second product, **Elendil**, is listed on the marketing site as “Coming soon”: a central system for orchestrating decisions with a human feedback loop. **Elendil has no implementation in this repository.**

### 1.2 Problem it solves

**Confirmed (product claim + backend demonstration).** Organizations run many vendor systems that do not share IDs, field names, status vocabularies, currencies, or timezones. No single system can answer “what is actually happening?” because:

- the same real-world thing appears under different names and keys
- two systems that should agree often do not
- a number on a dashboard cannot be traced back to the raw record
- operational events (a silent feed, a rate shift, a volume spike) are invisible until someone joins the data by hand

ASE’s prototype demonstrates resolving that mess into one queryable knowledge graph, then surfacing discrepancies as findings with evidence.

### 1.3 Main purpose of this repository

**Confirmed.** This repo is a local prototype with two halves:

1. **Backend** — Python, DuckDB, FastAPI. Synthesizes a messy multi-vendor landscape for a **synthetic online gaming operator**, cleans it, resolves it into an ontology-backed graph, computes findings, and serves them read-only over HTTP.
2. **Frontend** — React, Next.js 16 App Router, Tailwind, at `frontend/next-app/`. A marketing site, a gated onboarding form, and an authenticated-looking app (graph, search, dashboard, control room, demo workspace).

**Critical product fact:** the backend demonstration domain and most of the in-app demonstration domain are **not the same world**. See §15.

| Layer | Demonstration domain | Confirmed |
|---|---|---|
| Backend pipeline + `GET /objects`, `/search`, `/findings`, etc. | Online gaming operator (players, accounts, games, payments, CRM, affiliates) | Yes |
| `/app/graph` and `/app/search` | Consume the **gaming** backend API | Yes |
| Control Room, `/app/graph-next`, `/app/dashboard`, `/demo` | High-altitude **expedition safety** (climbers, routes, sensors, operators) generated in the browser | Yes |
| `/app/control-room/findings` | A third leftover mock: **Argent Holdings** payments/org graph | Yes |

### 1.4 Key goals and value proposition

**Confirmed from marketing + How it works + Control Room architecture comments.**

| Goal | How the prototype supports it | Evidence |
|---|---|---|
| Connect existing systems without replacing them | Six synthetic vendor feeds in different formats | Backend pipeline |
| Normalize messy records | Field maps, status maps, FX, timezone assumptions, provenance on every row | `ingest_clean.py` |
| Resolve entities without a shared key | Username, last-4, numeric-core, email matching | `entity_resolution.py` |
| One searchable graph | `graph.objects` / `graph.links` + `GET /search` | Backend + Search page |
| Trace every number | Lineage endpoint, object provenance, findings evidence | Backend API |
| Surface discrepancies without inventing causation | Five computed finding types; language stops at co-occurrence | `findings.py` |
| Human review of model decisions | Control Room Revision / Identity / Meaning (session-only, expedition domain) | Frontend ASE |
| Deploy under customer control | Marketing + Processing “Deploy” copy; everything currently runs locally | Mixed — see §10 and §14 |

**Uncertain / incomplete.** Landing copy also promises “ask questions in plain English,” role-based object access, a full audit trail of every access, and cloud / on-prem / air-gapped deployment. Those are **not implemented** as product capabilities in this prototype (see §15).

---

## 2. Target Users

There is **no multi-tenant user directory, login, or organization switcher**. “Users” below are the people the UI and form copy are written for.

### 2.1 Prospective customer / buyer (public site)

**Confirmed.** Anyone can open the marketing site. The request-access form is written for an organization evaluating ASE:

- legal company identity and work email
- industry (Government, Manufacturing, Telecom, Logistics, Energy and Utilities, Other)
- company size bands
- systems they need to connect (databases, spreadsheets, ERP, CRM, legacy, live sensor/telemetry, other)
- deployment preference (Isildur-hosted cloud, private cloud, on-prem, air-gapped)
- expected analyst count
- timeline and billing contact

**What they want:** understand the product, request a demo / access, eventually see ASE on their data.

**Primary use cases:** browse landing and How it works → request access → enter the local demo workspace.

### 2.2 Analyst / operator (gated app)

**Confirmed (after local access grant).** The app shell is for someone exploring a resolved operational picture: graph, search, dashboard, control room, findings.

In the **expedition** demo, Control Room further simulates four operational roles used only as UI permission matrices (not server accounts):

| Role | Where it appears | Confirmed |
|---|---|---|
| Coordinator | Revision and Exposure role selector (default) | Yes — client-side |
| Medic | Same selectors | Yes — client-side |
| Guide | Same selectors | Yes — client-side |
| Observer | Same selectors; fewest actions | Yes — client-side |

**What they want (inferred from surfaces):** see who/what is in the graph, find discrepancies, inspect provenance, decide what needs a human, understand confidence and source failure.

### 2.3 Demo audience (Control Room Trust demo)

**Confirmed.** A scripted walkthrough can be started from the Trust tab for four audience cuts: Executive, Engineer, Medic, Auditor. This is a product-demo runner, not a login role.

### 2.4 Internal / Isildur reviewer of access requests

**Uncertain / incomplete.** Form copy says “We review every organization before granting access” and that Isildur will contact the billing email about deployment and pricing. There is **no reviewer UI, no approval workflow, and no email send**. Access is granted in the browser as soon as `POST /access-requests` succeeds. Requests are appended to `backend/access_requests.jsonl` (gitignored).

### 2.5 Who is *not* a user of this prototype

- End customers of a gaming operator or expedition company (those are synthetic entities inside the graph)
- Paying subscribers (no payments)
- Authenticated employees with passwords, SSO, or MFA
- Admins of a multi-tenant SaaS

---

## 3. Core Features

### 3.1 Marketing site

| | |
|---|---|
| **Purpose** | Explain Isildur/ASE and drive request-access |
| **User can** | Read product story, open How it works, start Get Started / Request access |
| **How it works** | Public React routes; no API required |
| **Restrictions** | About, Contact, and Documentation pages are stubs (“coming soon”). Footer legal links are `href="#"` placeholders. Elendil is disabled in the nav. Showcase “See all” has no destination. |
| **Related** | `Landing.tsx`, `Nav`, `Footer`, landing components |

### 3.2 Request access (gated onboarding)

| | |
|---|---|
| **Purpose** | Collect organization details and unlock the local app |
| **User can** | Complete 4 steps, submit, see a confirmation, enter the demo |
| **How it works** | Client validation → `POST /access-requests` → append JSONL → `grantAccess()` writes `localStorage` key `isildur_access_request` |
| **Restrictions** | Work email required (free-mail domains rejected on the client). Backend does **not** re-validate business rules (any JSON matching the Pydantic shape is stored). Submitting **immediately grants app access** despite “under review” copy. |
| **Related** | `RequestAccess.tsx`, `lib/access.tsx`, `lib/validation.ts`, `POST /access-requests` |

### 3.3 Knowledge graph (backend-backed) — `/app/graph`

| | |
|---|---|
| **Purpose** | Force-directed view of resolved objects and typed links from DuckDB |
| **User can** | Pan/zoom, click a node, open a side panel (properties, connections, raw records), deep-link with `?focus=` |
| **How it works** | `getObjects()` lists `/objects`, then **every** `/objects/{id}` is fetched and `linksFromDetails()` assembles the edges (no bulk graph endpoint). Renders with `react-force-graph-2d`. |
| **Restrictions** | Node colors/labels assume `Person` / `Organization` / `Location` and a `name` field. Backend types are `Player`, `Account`, `Game`, etc. Games use `title`, accounts use `account_ref` — many nodes will show blank labels. Empty state if the pipeline has not been run. |
| **Related** | `features/graph/components/{GraphView,ForceGraphCanvas,SidePanel}.tsx`, `features/graph/services/objects.ts`, `lib/axios.ts` |

### 3.4 Search — `/app/search`

| | |
|---|---|
| **Purpose** | Spotlight search over resolved graph objects |
| **User can** | Type a query, keyboard-navigate results, open a result on the graph |
| **How it works** | Every keystroke hits `GET /search?q=` (aborted if superseded). Server ranks prefix/contains on name, aliases from the resolution map, then other properties. Max 20 results. |
| **Restrictions** | Type badges in the UI still say PERSON / ORGANIZATION / LOCATION; unknown types fall back to the raw type string. Placeholder mentions “documents”; documents are not a backend object type. |
| **Related** | `features/search/components/SearchView.tsx`, `features/search/services/search.ts`, `GET /search` |

### 3.5 Expedition dashboard — `/app/dashboard`

| | |
|---|---|
| **Purpose** | Live-feeling operational dashboard for the **expedition** demo |
| **User can** | View KPIs (lowest SpO2, route congestion, anomaly load), expedition clock, route analysis, connected systems, findings list, data stream |
| **How it works** | Reads `GraphSimulationContext` (client-side simulated climbers, environments, vitals). **Does not call the backend.** |
| **Restrictions** | Not a gaming pipeline health dashboard — it has nothing to do with the backend domain. Permit registry is shown as degraded by construction. |
| **Related** | `features/dashboard/components/Dashboard.tsx`, demo graph simulation |

### 3.6 Control Room — `/app/control-room/*`

| | |
|---|---|
| **Purpose** | Full ASE “evidence graph” console: pipeline health, ontology, identity, meaning, reasoning, detection, prediction, revision, exposure, trust |
| **User can** | Switch 11 tabs (keyboard 1–9, 0, `-`), command palette (`Cmd/Ctrl+K`), inspect traced values, change session-only model settings, run a scripted demo |
| **How it works** | In-browser dataset (`features/ase/services/dataset.ts`, seed `20260804`). Live tick every 5s supersedes some observations. **No backend.** |
| **Restrictions** | Expedition domain only. Role permissions are a dropdown, not authentication. Each tab is its own route segment, so an unknown tab id is a 404 rather than a stub. Findings sidebar item is a **different** page (see 3.8). |
| **Related** | `app/(app)/app/control-room/*`, `features/control-room/*`, `features/ase/*` |

Eleven tabs (all **confirmed** as built UI, not stubs):

| Tab | Stage caption | What the user sees |
|---|---|---|
| Overview | All stages | Headline counts, “Needs you” queue, pipeline health line, evidence strip |
| Processing | Stages 1–5 · Observe & resolve | Flow diagram, stages table, **Runtime** and **Deploy** prose (not live metrics) |
| Model | 02 · Ontology | Competency questions, sources, things, facts, validity, records, versions |
| Identity | 03 · Entity Resolution | Climber roster, source records, method, scoring weights, decision thresholds |
| Meaning | 04 · Context Engine | Readings as English statements, rules, coverage, impact; can add a human rule in-session |
| Reasoning | 05 · Reasoning Engine | Why something is wrong, ruled-out factors, counterfactuals |
| Detection | 06 · Anomaly Detection | Rules, map, firings, tuning/suppression |
| Prediction | 09 · Intelligence Synthesis | Per-climber operational risk (explicitly not medical diagnosis) |
| Revision | 10 · Human Feedback Loop | Queue of items needing a human; role-gated actions |
| Exposure | Source resilience | What remains knowable if a source fails; outage simulation |
| Trust | Trust and performance | Engineering decisions, security findings list, quality, connections, limitations, demo runner |

### 3.7 Next-generation graph — `/app/graph-next`

| | |
|---|---|
| **Purpose** | Rebuild of the graph as Network / Strata / Terrain views over the expedition dataset |
| **User can** | Search locally, switch view mode, inspect an investigation panel, Escape to clear selection |
| **How it works** | `CURRENT_DATASET` from `graph/dataset.ts` (127 domain entities + sub-nodes; seed `8300`). Intended to replace `/app/graph` later. |
| **Restrictions** | **Not linked in the sidebar.** Must be opened by URL. Does not use the backend. |
| **Related** | `GraphNext.tsx`, `graph/*` |

### 3.8 Findings list — `/app/control-room/findings`

| | |
|---|---|
| **Purpose** | List computed data discrepancies awaiting review |
| **User can** | Read flag kind, reason, sources; “View in graph”; some rows “Open reconciliation” |
| **How it works** | Client mock `features/findings/mock/generate.ts` (Argent Holdings orgs/accounts/providers/transactions). **Not** `GET /findings`. |
| **Restrictions** | “View in graph” navigates to `/app/control-room?focus=…` (Control Room is not a graph). “Open reconciliation” navigates to `/app/control-room/reconciliation/:metricKey`, **which is not a defined route** (no such segment and no catch-all under `app/(app)/app/control-room/`, so it 404s). |
| **Related** | `features/findings/components/FindingsPage.tsx`, `features/findings/mock/*` |

### 3.9 Demo workspace — `/demo/enter` → `/demo/workspace`

| | |
|---|---|
| **Purpose** | Cinematic entry then an interactive climber graph with optional “lenses” |
| **User can** | Pick lenses (live telemetry, anomaly detection, team structure, route progression, physiological risk, supply and logistics), view legend, open graph, select climbers/environments |
| **How it works** | Welcome screen then `ClimberGraphCanvas`. Deep-link `?selectType=&selectId=` skips intro. |
| **Restrictions** | Welcome line hardcodes **“Welcome Sentinet to ASE”** plus the stored company name. Lenses copy says they can be changed later from the Control Room; that wiring is not confirmed as a shared setting. |
| **Related** | `features/demo/components/{DemoEnter,DemoWorkspace,ClimberGraphCanvas}.tsx` |

### 3.10 Backend data pipeline (operator-facing only via API)

| | |
|---|---|
| **Purpose** | Produce the gaming knowledge graph and findings the Graph/Search pages read |
| **User can** | Not a UI feature. A developer runs four Python scripts in order. |
| **How it works** | Generate raw files → ingest/clean into DuckDB → resolve graph → compute findings |
| **Restrictions** | Batch, not streaming. Must be re-run to refresh. DuckDB file is gitignored. |
| **Related** | `backend/pipeline/*`, `ontology.py`, `sources.py` |

### 3.11 Operational findings (backend)

| | |
|---|---|
| **Purpose** | Five finding types computed from real queries, never invented rates |
| **User can** | Only via API today (`GET /findings`, `GET /findings/{id}`). No first-class frontend for this payload. |
| **How it works** | See §7. Reviewer fields exist (`Open`, `reviewed_by`, `reviewed_at`) but **no API writes them**; all findings persist as Open. |
| **Related** | `findings.py`, `api.py` |

### 3.12 Connectors, metrics, correlate, lineage (backend API)

| | |
|---|---|
| **Purpose** | Connector health, reconciled metrics (deposits/withdrawals/sessions/rounds), time-window correlation, lineage for an object or finding |
| **User can** | Not exposed as dedicated app pages. Consumable only via HTTP. |
| **Restrictions** | Unknown metric names 404. Correlate requires ISO `at`. Lineage 404s if id is neither finding nor object. |
| **Related** | `GET /connectors`, `/metrics/{name}`, `/correlate`, `/lineage/{id}`, `/health`, `/stats`, `/sources` |

---

## 4. User Roles and Permissions

### 4.1 What actually gates the app

**Confirmed.** There are two states:

| State | How it is set | What it unlocks |
|---|---|---|
| No access | Missing `isildur_access=1` cookie, or missing/invalid `localStorage.isildur_access_request` | Public marketing routes only. Visiting `/app/*` or `/demo/*` is redirected to `/request-access` by `middleware.ts` before the page renders. |
| Granted | Successful access-form submit, which sets both (or anyone who writes the cookie and localStorage key by hand) | All app and demo routes |

The cookie is the server-side gate (`middleware.ts`, matcher `/app`, `/app/:path*`, `/demo`, `/demo/:path*`); localStorage carries the company summary the UI displays. `hasAccess()` in `lib/access.ts` requires both.

There is **no password, session cookie, JWT, SSO, or API key**. The FastAPI server has **no authentication middleware**. CORS allows all origins (`allow_origins=["*"]`), documented as local-prototype-only.

Anyone who can open DevTools can grant themselves access without submitting the form. Anyone who can reach the API can read the full graph and append access-request files.

### 4.2 Public vs gated routes

**Confirmed.**

| Access | Routes |
|---|---|
| Public | `/`, `/how-it-works`, `/request-access`, `/about`, `/contact`, `/documentation` |
| Gated (`RequireAccess`) | `/app` (graph, graph-next, search, dashboard, control-room, findings), `/demo/enter`, `/demo/workspace` |

All gated users see the same sidebar. There is no admin-only area.

### 4.3 Simulated Control Room roles

**Confirmed (UI only).** On Revision and Exposure, a role selector changes which buttons are enabled. Disabled actions show a reason sentence.

**Revision** (`revisionPermissions.ts`):

| Action | Coordinator | Medic | Guide | Observer |
|---|---|---|---|---|
| approve, reject, correct, witness | yes | yes | no | no |
| annotate, defer | yes | yes | yes | no |
| revert, export | yes | no | no | no |

**Exposure** (per panel, `exposurePermissions.ts`):

| Action | Who can |
|---|---|
| Flag for review (health) | coordinator, medic, guide |
| Flag for review (matrix / fragility) | coordinator, medic |
| Request backup source | coordinator |
| Change confidence floor | coordinator |
| Run outage simulation | coordinator, medic |

**Uncertain / incomplete.** Trust-tab copy describes Bearer tokens, GraphQL, WebSocket subscriptions, and an access matrix (`rw`, `r-team`, etc.). Those are **authored documentation inside the Trust dataset**, not enforced APIs. Landing “Role based access control / every object is governed by who is allowed to see it” is **marketing**, not implemented.

### 4.4 Finding reviewer role (backend)

**Incomplete.** `findings.findings` has `reviewer_status`, `reviewed_by`, `reviewed_at`. The pipeline always writes `Open` / `null` / `null`. There is no PATCH/POST to change them.

---

## 5. User Flows

Convention: **User action → System processing → Result**

### 5.1 Browse marketing (no account)

1. User opens `/` → React renders landing sections → User reads ASE/Elendil, manifesto, security claims, showcase.
2. User clicks How it works → `/how-it-works` → Five-step narrative (Connect, Clean, Understand, Search, Automate).
3. User opens About / Contact / Documentation → Stub copy only.
4. User clicks Get Started or Request access → `/request-access`.

### 5.2 Registration / login

**There is no registration, login, logout, password reset, or email verification.**

The closest flow is request access:

```
User fills 4 steps
  → Client validateStep (required fields, work email, URL, phone, min lengths)
  → If invalid: inline errors, stay on step
  → If last step valid: POST /access-requests
       → Backend assigns UUID + UTC timestamp, appends JSONL
       → Returns { id, submitted_at }
  → Frontend grantAccess(summary) → localStorage + isildur_access cookie
  → Confirmation: “Your request is under review” + Enter demo workspace
```

**Mismatch (confirmed):** copy says review-then-contact; behavior grants the app immediately.

Returning to the site: if the cookie and localStorage summary both survive, `middleware.ts` and `hooks/use-access.tsx` let the user into `/app` without resubmitting.

### 5.3 Enter demo

```
User clicks “Enter demo workspace”
  → /demo/enter (welcome animation; skippable by click)
  → /demo/workspace
  → Lenses (must pick ≥1) → Legend → Climber graph
```

Or, after grant, user can go directly to `/app/graph`.

### 5.4 Main analyst workflow (backend graph)

```
Open /app/graph
  → fullGraph() N+1 fetch
  → Force layout of gaming objects
Click node / Search then Enter
  → GET /objects/{id}
  → Side panel: properties, connections, resolved_from
Navigate a connection
  → Focus that node
```

Search:

```
Type query
  → GET /search?q=
  → Up to 20 ranked hits
Enter / click
  → /app/graph?focus={id}
```

### 5.5 Control Room workflow (expedition, in-browser)

```
Open /app/control-room
  → Redirect to /overview
  → DatasetProvider builds seeded graph; ticks every 5s
1–9 / 0 / - or tab bar
  → Navigate tab
Cmd/Ctrl+K
  → Palette (tabs + climbers)
Click a traced metric
  → Inspector shows provenance / confidence
Revision / Exposure
  → Pick role → enabled actions change
Trust → start demo
  → Scripted navigation across real tabs
```

### 5.6 CRUD of important resources

| Resource | Create | Read | Update | Delete |
|---|---|---|---|---|
| Access request | POST (append-only JSONL) | Not exposed | No | No |
| Graph objects / links | Pipeline only | GET | No | No |
| Findings | Pipeline only | GET | Reviewer fields unused | No |
| Control Room rules, scoring, suppressions, conflict policy | Session UI | Yes | In-memory / session | No persistence |
| Identity / revision decisions | Session UI | Yes | Session audit chain | Lost on refresh (except some localStorage chrome) |

**There is no user-facing CRUD against DuckDB.** The API is read-only except access-request create.

### 5.7 Payments

**None.** Step 4 collects billing contact and optional tax ID for a **future proposal**. Copy: “Nothing is billed until an agreement is in place.” No Stripe or invoices.

### 5.8 Admin

**None.** No admin UI, no review queue for JSONL requests, no user management.

### 5.9 Pipeline operator (developer)

```
generate_data.py → ingest_clean.py → entity_resolution.py → findings.py
  → uvicorn api:app --port 8010
  → Frontend NEXT_PUBLIC_API_URL (default http://localhost:8010)
```

If DuckDB is missing, Graph/Search/health fail when those endpoints are called.

---

## 6. Key Pages and Modules

### 6.1 Public pages

| Page | Purpose | Who | Main actions | UI states | Connections |
|---|---|---|---|---|---|
| `/` Landing | Product story | Anyone | Nav, Get Started | Static; showcase image fallback if PNG missing | `#ase`, `#security`, `#transforming-lives` |
| `/how-it-works` | Five-step ASE narrative | Anyone | Request demo band | Static | `/request-access` |
| `/request-access` | Onboarding | Anyone | 4-step form | Errors, submitting, confirmation | POST API, then `/demo/enter` |
| `/about` | Company | Anyone | None | “More on our story is coming soon.” | — |
| `/contact` | Contact | Anyone | None | “A contact form is coming soon.” | — |
| `/documentation` | Docs | Anyone | None | “Docs are coming soon.” | — |

### 6.2 App shell

**Confirmed.** `AppShell`: sidebar + topbar + children, mounted as the layout of the `app/(app)/` route group so it wraps `/app/*` and `/demo/*` only. Sidebar items: Graph, Search, Dashboard, Control Room, Findings. Footer chip: “Local instance.”

Topbar title is omitted on Control Room (that surface has its own bar). Demo workspace reuses the Graph title.

### 6.3 Authenticated-looking modules

| Module | Purpose | Data source | Notes |
|---|---|---|---|
| Graph | Explore resolved gaming graph | Backend | Type/label mismatch |
| Graph Next | Network/Strata/Terrain | `features/graph-next/services/dataset.ts` | Hidden from nav |
| Search | Find entities | Backend | — |
| Dashboard | Expedition ops KPIs | Client simulation | — |
| Control Room | ASE console | `features/ase/services/dataset.ts` | 11 tabs |
| Findings | Flag list | `features/findings/mock/generate.ts` | Dead links |
| Demo workspace | Climber graph + lenses | Client simulation | — |

### 6.4 Control Room chrome

**Confirmed.** Top bar (tabs, live status nominal/watch/anomaly, identity/revision badges, as-of / simulation / demo controls), section header, inspector rail, activity lane, command palette.

### 6.5 Shared libraries

Paths below are relative to `frontend/next-app/`.

| Module | Role |
|---|---|
| `lib/axios.ts` | Axios client; `NEXT_PUBLIC_API_URL`; envelope unwrapping and `ApiError` |
| `lib/access.ts` | Access cookie + localStorage helpers |
| `hooks/use-access.tsx` | Access gate context |
| `middleware.ts` | Server-side gate on `/app/*` and `/demo/*` |
| `api/query-keys.ts` | TanStack Query key factory |
| `features/access/schemas/*` | Zod form rules |
| `features/access/types/countries.ts` | Country names + dial codes |
| `features/ase/*` | Traced values, folds, ontology, engines |
| `features/graph-next/*` | Graph-next store, layout, search |
| `features/findings/mock/*` | Leftover Argent dataset |

---

## 7. Business Logic and Rules

### 7.1 Access form validation (client)

**Confirmed.**

| Step | Rules |
|---|---|
| 1 Company | Name ≥ 2 chars; work email (rejects gmail/yahoo/outlook/icloud/proton/etc.); phone ≥ 7 digits, E.164 length ≤ 15; valid website URL; industry and size required |
| 2 Address | Country, line 1, city, state/region, postal code required; line 2 optional |
| 3 About | Business description ≥ 100 chars; use case ≥ 50 chars; hear-about-us optional |
| 4 Deployment | Environment, analyst band, ≥1 system, timeline, billing name + work email required; tax ID optional; “Other” systems can add free text |

Backend `AccessRequestPayload` only checks types (strings, optional strings, `systems: list[str]`). Invalid types → HTTP 422. Frontend maps 422 / 5xx / network failure to user-facing sentences.

### 7.2 Access grant

**Confirmed.** Any successful POST grants access. No uniqueness on email, no duplicate detection, no rate limit.

### 7.3 Connector status (backend)

**Confirmed** from parse failures vs records:

| Condition | Status |
|---|---|
| `failed == 0` | Connected |
| `failed < 5%` of (`records + failed`) | Degraded |
| otherwise | Failed |

Generate seeds **18 Quantis Pay rows with empty timestamps** so some parse failures are real, not invented.

### 7.4 Normalization

**Confirmed.**

- **FX to USD (fixed):** USD 1.0, GBP 1.27, EUR 1.09, SEK 0.095, CAD 0.74
- **Status map:** NorthPay `approved/declined/pending` already canonical; Quantis `SETTLED→approved`, `FAILED→declined`, `PENDING_REVIEW→pending`
- **Timezones:** explicit offsets converted to UTC; naive timestamps assumed (aggregator = UTC; Quantis = market offset UK 0, Ireland 0, Germany 1, Sweden 1, Canada −5, Malta 1). Assumed TZ is flagged `tz_assumed`
- **Provider aliases** map messy vendor strings to canonical game-provider names
- **Excel serial** datetimes for CRM

### 7.5 Entity resolution

**Confirmed.**

| Link | Method | Failure handling |
|---|---|---|
| Account → Player (`BELONGS_TO`) | Normalized username exact match (strip + lower). ~12% of players seeded with two accounts | Multi-account players counted in stats |
| Transaction → Account (`MADE_BY`) | Last 4 of masked ref vs account id | Unresolved and **ambiguous last-4 collisions counted, not hidden** |
| Affiliate → Account (`REFERRED`) | Numeric core of `REF-######` vs `ACC-######` | Unresolved counted |
| Campaign → Player (`TARGETED`) | Recipient email exact | Unresolved counted |
| Account → Game (`PLAYED`) | Session game title vs catalog | Unmatched games counted |
| Game → Provider, Txn → PSP, Account → Market | Direct from normalized fields | — |

Player names on the graph are the stripped username from the first account in the group, not “First Last”.

`rapidfuzz` is in `requirements.txt` but **not imported anywhere**. Comments state fuzzy matching is unnecessary for this demo.

### 7.6 Finding detection (backend)

**Confirmed. Language does not assert causation.**

| Type | Rule (simplified) | Example |
|---|---|---|
| `RATE_SHIFT` | 5-day deposit approval window vs rest of series; two-proportion z ≤ −4.0; min window n = 25; one most-extreme window per (PSP, market) | Quantis Pay / Germany seeded decline window |
| `SOURCE_DIVERGENCE` | Platform sessions ≥ 3 for a game/day but aggregator rounds = 0 | NetEnt dark day vs PAM sessions |
| `VOLUME_ANOMALY` | Daily sessions/rounds/deposits count ≥ 2.5 population stdevs from mean | Session spike day |
| `SILENT_SOURCE` | Max inter-round gap ≥ 15× median and ≥ 240 minutes | Red Tiger ~7h blackout |
| `CO_OCCURRENCE` | Session volume-anomaly day with a campaign send within ±180 minutes of the peak 15-minute bucket; text says this does **not** establish cause | CRM send then session spike |

All start as `reviewer_status = Open`.

### 7.7 Search ranking (backend)

**Confirmed.** Rank 0 name prefix → 1 name contains → 2 alias prefix → 3 alias contains → 4 other property contains. Sort by rank, then connection count descending. Cap 20. Empty `q` → `[]`.

### 7.8 Metrics

**Confirmed.** `deposits` / `withdrawals` by payment provider and original currency, totals in USD, optional `market` filter. `sessions` / `rounds` counts by source file. Anything else → 404.

### 7.9 Correlate window

**Confirmed.** `at` ISO datetime required; `window` minutes default 60; returns transactions, rounds, sessions, campaign sends in `[at−window, at+window)`. Affiliate referrals are not included.

### 7.10 Control Room (expedition) — selected rules

**Confirmed as client computations on a seeded dataset**, not live mountain telemetry.

- **Confidence** is folded on read from source reliability / match score / rule authority (`ase/folds.ts`), not stored as a stale number.
- **Identity scoring** weights and match/merge thresholds are adjustable in-session (`DEFAULT_WEIGHTS`, `DEFAULT_THRESHOLDS`).
- **Detection** rules include low SpO2, dangerous wind, high pulse, climbing too fast, not enough guides, visibility collapse, low battery, pressure mismatch. Tuning can suppress or change thresholds; suppressions log to Revision.
- **Prediction** framing (in UI): operational risk, not diagnosis; cognitive state inferred; figures are indexes vs that person’s baseline.
- **Revision queue** is derived from real in-graph signals (conflicts, unbound meaning fields, wrong predictions, single-source facts, etc.), plus session items from Trust.
- **Exposure simulation** can “kill” a source and show what stops being knowable (role-gated).
- **As-of scrubber** lets the user see the graph at a historical instant (bitemporal model in `ase/bitemporal.ts`).
- **Live tick** every 5s updates source sync-age and related folds.

**Processing Runtime/Deploy sentences** (5-minute replay, 30-minute recovery, worker pools, air-gapped deploy) are **static prose**, not measured from this stack.

### 7.11 Graph-next environment breaches

**Confirmed** seeded thresholds: wind > 85 kph, temperature < −36 °C, visibility < 0.6 km, freezing level > 5600 m.

### 7.12 Ontology (gaming, backend)

**Confirmed schema only** in `ontology.py`:

**Objects:** Player, Account, GameProvider, Game, PaymentProvider, Transaction, Campaign, AffiliateSource, Market.

**Relationships:** BELONGS_TO, PLAYED, SUPPLIED_BY, PROCESSED_BY, MADE_BY, TARGETED, REFERRED, OPERATES_IN.

---

## 8. Data Model and Core Entities

### 8.1 Dual models

There is no single product data model. Three independent graphs exist.

```mermaid
flowchart LR
  subgraph backend [DuckDB gaming world]
    raw[raw.* vendor files]
    clean[clean.* normalized]
    graph[graph.objects / links]
    findings[findings.findings]
    raw --> clean --> graph
    clean --> findings
  end
  subgraph ase [Browser ASE expedition world]
    ds[ase/dataset.ts]
    cr[Control Room tabs]
    ds --> cr
  end
  subgraph gnext [Browser graph-next]
    gd[graph/dataset.ts]
    nv[Network / Strata / Terrain]
    gd --> nv
  end
  subgraph mock [Browser mock leftover]
    argent[Argent Holdings mock]
    ff[Findings page]
    argent --> ff
  end
  graph -->|GET /objects /search| appGraph[App Graph + Search]
```

### 8.2 Backend — raw / clean / graph / findings

**Confirmed DuckDB schemas (created by pipeline scripts).**

**Provenance manifest** (`sources.py`): six files.

| File | Owner | Format | Describes |
|---|---|---|---|
| `pam_platform.json` | Platform provider | json | accounts, sessions, balances |
| `game_aggregator.xml` | Game aggregator | xml | rounds, game ids, providers, RTP, stakes |
| `psp_transactions.csv` | NorthPay | csv | deposits, withdrawals, approvals, declines |
| `psp_alt.csv` | Quantis Pay | csv | same, different vocabulary |
| `crm_campaigns.xlsx` | CRM | xlsx | campaign sends, segments, timestamps |
| `affiliate_tracking.csv` | Affiliate platform | csv | referrals, sources, registrations |

**Clean tables (among others):** `clean.accounts`, `clean.sessions`, `clean.rounds`, `clean.games`, `clean.transactions`, `clean.campaign_sends`, `clean.affiliate_referrals`. Transactions keep original amount/currency and `amount_usd`, raw and canonical status, `tz_assumed`.

**Graph:**

| Table | Fields | Purpose |
|---|---|---|
| `graph.objects` | `id`, `type`, `properties_json` | Canonical entities; properties clipped to ontology |
| `graph.links` | `source_id`, `target_id`, `rel_type` | Typed edges |
| `graph.resolution_map` | object_type, source_table, source_id, raw_name, canonical_id | Player ← account rows |

**Findings:** id, finding_type, title, description, sources/computed/window/entities/evidence JSON, reviewer_status, reviewed_by, reviewed_at.

**Stats:** `main.pipeline_stats`, `main.resolution_stats`, `main.connector_status`.

**Access requests:** not in DuckDB. JSONL records: uuid, `submitted_at`, plus all form fields.

### 8.3 Seeded gaming volumes (generate_data.py)

**Confirmed generation targets** (exact DB counts depend on parse failures and skips):

| Item | Approx. |
|---|---|
| Canonical players | 260 (seed 11) |
| Multi-account rate | 12% |
| PAM sessions | 5000 + 260 spike |
| Aggregator rounds | 45,000 (some skipped for blackout/divergence) |
| NorthPay txns | 10,000 |
| Quantis Pay txns | 8,000 + 18 malformed |
| CRM sends | 1,800 + 400 trigger |
| Affiliate rows | up to 400 players |
| Markets | UK, Ireland, Germany, Sweden, Canada, Malta |
| Window | 90 days |

Ground-truth players are **never written** to source files.

### 8.4 Frontend ASE expedition entities

**Confirmed.** 5 countries, 14 regions, 14 routes, 30 operators, 50 climbers (= 113 “entities tracked”), plus 14 route sensors tracked separately. Sources include wearable oximeter, GPS tracker, weather feed, radio check-in, permit registry, manual observation, operator rosters, medical logs.

Traced values carry provenance, confidence, recorded-at / valid-at style instants. Conflicts, identity records, detections, predictions, revision queue items, and trust documentation are all derived in `buildDataset()`.

### 8.5 Graph-next domain

**Confirmed.** Same country/region/route/operator names as Control Room; 50 climbers generated independently except disclosed shared individuals (e.g. James Marshall III, Nima Tamang). Sub-nodes: telemetry, events, maintenance, logs, documents, alerts, historical. Environment nodes per region. History links climber → prior region (~60% of climbers).

### 8.6 Mock Argent dataset

**Confirmed leftover.** Holding + subsidiaries, accounts, card/ACH/wire providers, transactions, flags (`silent_source`, `reconciliation_mismatch`, `statistical_outlier`, `duplicate_account`). Used by Findings page and unused search/stats helpers in `features/findings/mock/index.ts`.

---

## 9. APIs and System Interactions

Base URL: `http://localhost:8010` (override `NEXT_PUBLIC_API_URL`). FastAPI title: “Isildur Operational Intelligence API”. **No auth.**

All calls are made from the browser straight to FastAPI; there is no server-side proxy or BFF on the Next side today.

Frontend currently calls: `GET /objects`, `GET /objects/{id}`, `GET /search`, `POST /access-requests`. Other endpoints are implemented but unused by the UI.

### 9.1 Health and diagnostics

| Method | Path | Purpose | Auth | Errors |
|---|---|---|---|---|
| GET | `/check` | Liveness ping. **Working-tree addition.** Returns `{ "status": 200, "message": "OK" }`. Does **not** open DuckDB. | None | None |
| GET | `/health` | Entity/relationship/source/event counts, sync success rate from pipeline stats | None | Fails if DB missing |
| GET | `/stats` | Ingestion + resolution stats, open SOURCE_DIVERGENCE count, single-source account heuristic | None | DB missing |
| GET | `/connectors` | Per-vendor status, last sync, records, errors | None | DB missing |
| GET | `/sources` | Same vendors plus hardcoded field-mapping explanations | None | DB missing |

**Note:** the frontend defines no type for `/stats` and never calls it; `api/query-keys.ts` reserves a key for it, nothing more.

### 9.2 Access

| Method | Path | Body | Success | Errors |
|---|---|---|---|---|
| POST | `/access-requests` | `AccessRequestPayload` | `{ id, submitted_at }` | 422 validation |

### 9.3 Graph

| Method | Path | Purpose | Errors |
|---|---|---|---|
| GET | `/objects?type=` | List objects; optional type filter; properties flattened onto the JSON object | — |
| GET | `/objects/{id}` | Properties, in/out connections (with display name), `resolved_from`, naive per-field `provenance` | 404 `object not found` |
| GET | `/search?q=` | Ranked search, max 20 | Empty query → `[]` |
| GET | `/lineage/{id}` | Finding evidence/window/sources **or** object raw_records | 404 |

### 9.4 Findings, metrics, correlate

| Method | Path | Notes | Errors |
|---|---|---|---|
| GET | `/findings?type=&status=` | Filter by finding_type / reviewer_status | — |
| GET | `/findings/{id}` | Full finding plus `context` from the finding’s time window | 404 |
| GET | `/metrics/{name}?market=` | `deposits`, `withdrawals`, `sessions`, `rounds` | 404 unknown name |
| GET | `/correlate?at=&window=` | Cross-source events around `at` | 400 if `at` not ISO |

### 9.5 What the frontend does *not* call

Connectors, findings, metrics, correlate, lineage, health, stats, sources — all unused by current pages. Graph-next, dashboard, and Control Room do not use this API at all.

### 9.6 GraphQL / WebSocket / agent API

**Uncertain as product claims; confirmed as not implemented.** The Trust tab includes example GraphQL, `wss://api.isildur.example/v1/subscriptions`, and `/agent/*` contracts. **They do not exist in `api.py`.**

---

## 10. External Integrations

**Confirmed: none in production sense.** README: “Everything here runs locally. No cloud, no real accounts, no external services.”

| Category | Status |
|---|---|
| Auth providers (Google, SSO, etc.) | Not present |
| Payments | Not present |
| Email / SMS | Not present (no send after access request) |
| Object storage | Local files + DuckDB |
| Analytics | Not present |
| LLM / “plain English questions” | Not present |
| Maps / weather APIs | Simulated in-browser |
| Docker / k8s | No Docker files |

**Why they are absent (inference):** this is a prototype to show ontology, resolution, and UI, not a hosted service.

**Product impact:** “We will contact you at {email}” cannot happen from this codebase. “Deploy anywhere” is a claim, not a shipping artifact.

Libraries that look like integrations but are local: DuckDB, FastAPI, openpyxl, Next.js/React.

---

## 11. Notifications and Communication

**Confirmed: no email, SMS, push, or in-app notification service.**

What exists instead:

| Mechanism | Trigger | What the user sees |
|---|---|---|
| Access confirmation page | Successful POST | “Under review”; billing email named as future contact |
| Form submit errors | 422 / 5xx / network | Red error text |
| Control Room activity lane | Graph supersessions / live tick | Recent changes strip (can be empty) |
| Control Room “Needs you” | Seeded finding kinds | Links to Identity / Model / Detection |
| Demo welcome | `/demo/enter` | “Welcome Sentinet to ASE” |
| Command palette | Cmd/Ctrl+K | Jump to tab or climber |

Footer Terms / Privacy / Cookie links do not go to real policies.

---

## 12. Admin and Back-office Functionality

**Confirmed: no admin application.**

Closest artifacts:

| Artifact | Who uses it | Effect |
|---|---|---|
| `backend/access_requests.jsonl` | Developer with filesystem access | Raw submitted forms |
| Pipeline scripts + DuckDB | Developer | Rebuilds the gaming graph |
| Control Room role selector | Anyone in the demo | Changes which buttons are enabled **in that tab** |
| Trust demo runner | Anyone in Control Room | Walks tabs for a pitch |

There is no content management, billing console, user impersonation, or finding-review back office.

---

## 13. Error Handling and Edge Cases

### 13.1 Invalid input

- Access form: per-field messages; Continue blocked until the step is valid.
- `POST /access-requests`: FastAPI 422 if JSON types mismatch (e.g. `systems` not a list).
- `GET /correlate`: 400 if `at` is not ISO.
- Search empty string: empty list, not an error.

### 13.2 Missing data

- Graph with zero objects: “No graph loaded / Ingest data to build your knowledge graph.”
- Graph/Search if API down: fetch throws; Graph has no explicit error UI (stays empty). Search ignores non-abort errors by stopping the spinner.
- Side panel while loading: empty aside.
- Control Room Meaning/Identity person-scoped tabs: “select first” empty states.
- Showcase images missing: grey placeholder.
- DuckDB missing: `/health` and graph endpoints fail at connection time (no graceful JSON from FastAPI beyond a 500).

### 13.3 Unauthorized

- Gated routes: redirect to `/request-access` (not a 401 page).
- API: **no 401/403**. Everything is open.

### 13.4 Failed integrations

N/A — no third-party calls. Access submit network failure: “Could not reach the server…”

### 13.5 Duplicates

- Access requests: duplicates allowed.
- Resolution: duplicate accounts merge by username; last-4 collisions leave transactions unlinked and counted as ambiguous.
- Control Room identity: duplicate_identity findings feed “Needs you.”

### 13.6 Invalid state transitions

- Findings cannot move from Open (no write API).
- Control Room revision stages exist in the client model (`open` → `under-review` → resolved/overruled/closed) **within the session**.
- Graph-next Escape: if search input is focused and non-empty, first Escape clears query; second clears selection.
- `/app/control-room/:unknown` → TabStub or redirect to overview.
- `/app/control-room/reconciliation/...` is not a real module (see §3.8).

### 13.7 Domain / type mismatches (user-visible)

- Graph node labels use `node.name`; many backend types lack `name`.
- Frontend API types still say `Person | Organization | Location`.
- Findings “View in graph” does not open a graph.

### 13.8 N+1 graph load

`fullGraph()` may request thousands of object-detail calls (every transaction is an object). **Reasonable inference:** this can hang or stall the Graph page on a full pipeline run. There is no pagination.

---

## 14. Non-functional Considerations

Only what can be inferred from this prototype.

### 14.1 Security

- Local prototype: CORS `*`, no auth, API world-readable.
- Payment identifiers in synthetic data are masked to last four.
- Access JSONL may contain personal data from the form; file is gitignored.
- Landing security section (RBAC, audit trail, lineage, deploy anywhere): **lineage is real on the backend graph; the rest is not implemented here.**
- Trust tab lists **open security findings on purpose** (“zero findings is not credible”) including placeholder pen-test dates. Treat as demo content, not a production attestation.
- Ante-mortem identity records in Control Room have a session audit log when unsealed.

### 14.2 Authorization

See §4. Object-level ACL does not exist. Simulated roles are cosmetic/safety-UX in two tabs.

### 14.3 Performance

- Backend search loads **all** objects and links into Python, then filters (fine for this synthetic size; not a scalable design).
- Frontend Graph N+1 fetch is the main risk.
- Control Room confidence folds are memoised per (id, asOf) in-process.
- Graph-next uses canvas/rAF and error boundaries so a panel crash should not kill the canvas.
- Trust tab cites performance budgets (e.g. fold latency, WS p99 340ms) as **dataset copy**, not measurements of `api.py`.

### 14.4 Scalability

Single DuckDB file, single uvicorn process, no queue, no horizontal scale story in code. Pipeline is batch.

### 14.5 Reliability

- Pipeline stages are sequential scripts; failure is “fix and re-run.”
- Processing tab claims at-most-5-minute replay and independent worker pools — **not how this repo runs.**
- Live Control Room tick is in-memory; refresh rebuilds the seeded world (session revisions lost).

### 14.6 Background processing

- Control Room: 5s tick, 1s activity-lane clock, demo runner timers, graph simulation vitals.
- Backend: no workers, no cron. Findings exist only after `findings.py`.

### 14.7 Data consistency

- Gaming graph is consistent as of last pipeline run (read-only API).
- Expedition Control Room and graph-next **share region/route names but not one live graph instance**; climber generators are intentionally separate except two disclosed names.
- Dashboard simulation is a **third** live ticker, not the Control Room dataset.
- Bitemporal as-of is Control Room only.

---

## 15. Current Limitations and Known Gaps

### 15.1 Architectural split (most important)

The prototype tells **three** domain stories. A new user will think they are one product:

1. **Gaming operator intelligence** — real ETL + DuckDB + REST + Graph/Search pages.
2. **Expedition safety ASE** — the bulk of recent UI (Control Room, Graph Next, Dashboard, Demo).
3. **Argent Holdings payments mock** — Findings page and `features/findings/mock`.

Comments in `features/ase/services/dataset.ts` say the engines are domain-agnostic and the mountain world is swappable. **That swap has not been done against the gaming backend.** The closing demo line (“Swap it for mining or logistics…”) is an architecture claim, not a shipped second ontology in the API.

### 15.2 Incomplete or stubbed product surfaces

| Item | Status |
|---|---|
| Elendil | Marketing only |
| About, Contact, Documentation | Stub pages |
| Footer legal pages | `#` links |
| Contact form | None |
| Plain-English Q&A / Automate step | Marketing; no NLQ |
| `/app/graph-next` | Built, not in nav; intended to replace `/app/graph` |
| Reconciliation UI | Linked from Findings; **route missing** |
| Finding review (backend) | Fields exist; no write path; no UI on `GET /findings` |
| Access request review | Copy only; instant local grant |
| Logout / revoke access | None |
| User accounts | None |
| Server-side data fetching | None. Every route is prerendered static; all API calls happen in the browser. An `app/api/` Route Handler BFF is planned, not present. |

### 15.3 Stale documentation inside the repo

Resolved as of the Next.js migration and the docs refresh that accompanied it: the root and `frontend/next-app` READMEs now name the real tree, the real scripts, and `NEXT_PUBLIC_API_URL`, and they state per route which surfaces read the backend and which are browser fixtures.

Remaining:

- `backend/README.md` setup block says `python3 -m venv .venv`, but the checked-out virtualenv in use is `backend/venv`.
- `next build` warns: `The "middleware" file convention is deprecated. Please use "proxy" instead.` `middleware.ts` has not been renamed; the build reports it as `ƒ Proxy (Middleware)`.
- `frontend/next-app/AGENTS.md` correctly warns that this Next version differs from model training data — worth heeding, since Next 16 conventions differ from Next 13/14 material.

### 15.4 Honesty vs. marketing

Landing promises RBAC, full audit of every access, deploy in cloud/on-prem/air-gap, and “see ASE on your data.” The prototype is local, synthetic, and ungated at the API. Control Room Trust/Processing text sometimes describes a harder production system (GraphQL, bearer tokens, worker pools) than `api.py`.

### 15.5 Technical debt / risks

- Graph `fullGraph()` N+1.
- `rapidfuzz` unused.
- Object provenance map sets every property’s source to the object id (comment admits this is simplified).
- `/stats` “entities in only one source” is a heuristic (no affiliate numeric match and no CRM email), not a general uniqueness proof.
- DemoEnter hardcodes “Sentinet”.
- Access grant is forgeable: `middleware.ts` trusts a plain `isildur_access=1` cookie, and the client gate trusts `localStorage`. Both are settable from the browser console.
- JSONL access requests grow forever; no PII handling beyond gitignore.
- No tests for the FastAPI layer in-repo (frontend has substantial Vitest coverage for ASE/graph).
- No Docker or CI config anywhere in the repo, and no env example at the repo root (`frontend/next-app/.env.example` is the only one).

### 15.6 What *is* genuinely implemented and worth treating as the product core

- A real, replayable messy-source → clean → resolve → findings pipeline with stated FX, TZ assumptions, and counted match failures.
- A read-only operational API over that graph.
- A serious in-browser ASE console (traced values, identity, meaning, reasoning, detection, prediction, revision, exposure, trust) on a consistent expedition dataset.
- A gated marketing → request-access → demo path sufficient to walk a prospect through the UI locally.

---

## Appendix A — Local runbook (confirmed)

**Backend**

```bash
cd backend
python3 -m venv venv && venv/bin/pip install -r requirements.txt
venv/bin/python pipeline/generate_data.py
venv/bin/python pipeline/ingest_clean.py
venv/bin/python pipeline/entity_resolution.py
venv/bin/python pipeline/findings.py
venv/bin/uvicorn api:app --port 8010
```

The four pipeline stages must run in order; each reads the previous one's output from
`isildur.duckdb`. Verify with `curl -s localhost:8010/health`. `api.py` opens DuckDB
read-only, so several API processes can share one database file.

**Frontend**

```bash
cd frontend/next-app
npm install
npm run dev            # http://localhost:3000
```

Scripts: `dev`, `build`, `start`, `lint`, `format`, `typecheck`, `test`. Full gate:

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

Frontend expects the API at `http://localhost:8010` unless `NEXT_PUBLIC_API_URL` is set
(copy `.env.example` to `.env.local`). `VITE_API_URL` no longer exists. There is no
server-side `API_URL` today — all fetching is browser-side.

`/app/*` and `/demo/*` are gated by `middleware.ts` on the `isildur_access=1` cookie;
without it you are redirected to `/request-access`. Completing that form sets the cookie.

Artifacts `isildur.duckdb`, `data/raw/*`, and `access_requests.jsonl` are gitignored, as are
`frontend/next-app/{node_modules,.next}` and `.env*` (except `.env.example`).

## Appendix B — Repository map

```
isildur/
  README.md
  docs/isildur.md       this document
  backend/
    api.py              FastAPI (read-only graph + POST /access-requests)
    ontology.py         Gaming object/relationship types
    sources.py          Six vendor provenance manifest
    pipeline/           generate_data → ingest_clean → entity_resolution → findings
    requirements.txt
    venv/               gitignored
    isildur.duckdb, data/raw/*, access_requests.jsonl    gitignored artifacts
  frontend/next-app/
    AGENTS.md           "this is NOT the Next.js you know" warning
    README.md
    .env.example        NEXT_PUBLIC_API_URL only
    middleware.ts       access gate on /app/* and /demo/*
    next.config.ts, vitest.config.ts, eslint.config.mjs, postcss.config.mjs
    tsconfig.json       "@/*" → project root
    app/                App Router — routing, layouts, loading/error only
      layout.tsx, providers.tsx, globals.css, page.tsx
      about|contact|documentation|how-it-works|request-access/   ungated
      (app)/            route group; layout.tsx mounts AppShell
        app/page.tsx      redirect → /app/graph
        app/graph|search|dashboard|graph-next/
        app/control-room/ + 11 tab routes
        demo/enter|workspace/
    features/<name>/    components/ hooks/ services/ stores/ schemas/ types/
      marketing         Landing, How it works, About, Contact, Documentation, Nav, Footer
      access            4-step request form, Zod schemas, countries
      app-shell         Sidebar, Topbar, AppShell
      graph             Backend-backed graph (/app/graph)
      search            Backend-backed search (/app/search)
      dashboard         Expedition ops KPIs, client simulation
      graph-next        Network / Strata / Terrain views + store
      control-room      Control Room chrome and tab components
      ase               Domain-agnostic engines + expedition dataset
      demo              Climber graph simulation
      findings          Flag list + leftover Argent Holdings mock
    components/ui/      shadcn primitives
    components/theme-provider.tsx
    hooks/              use-access, use-client, use-session
    lib/                axios, access, query-client, cn, utils
    api/query-keys.ts   TanStack Query key factory
    node_modules/, .next/    gitignored
```

Only `features/{graph,search,access}/services/*` import `lib/axios`; every other feature is
generated in the browser. Unit tests (`vitest`) cover `features/{ase,graph-next,control-room}`
only — 47 files, 463 tests.

## Appendix C — Keyboard shortcuts (Control Room)

**Confirmed.** Fully operable without a mouse is an explicit goal.

| Key | Action |
|---|---|
| 1–9, 0, `-` | Jump to Overview … Trust |
| Cmd/Ctrl+K | Command palette |
| Cmd/Ctrl+\\ | Toggle inspector |
| Escape | Close palette, or clear selection |

---

*End of document. If code and this PRD diverge, trust the code and update this file.*
