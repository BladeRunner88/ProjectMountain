# Isildur backend

Python + DuckDB + FastAPI. Generates a synthetic, deliberately messy multi-vendor data
landscape, cleans and normalizes it, resolves it into one ontology-backed graph, computes
cross-source operational findings, and serves all of it read-only over HTTP.

## Pipeline

```bash
venv/bin/python -m app.pipeline.run --stage all --scale full
venv/bin/python -m app.pipeline.run --stage all --scale small   # ~1s, for tests
```

Four stages, run in order, each reading what the previous one wrote. Every execution is
recorded in `app.pipeline_runs`, so the API can report when the warehouse was built and
whether the build succeeded rather than inferring it from row counts.

| Stage | Does |
|---|---|
| `generate` | Synthesizes six vendor exports (json, xml, csv, csv, xlsx, csv) with deliberate cross-source mess: different field names, disposition vocabularies, units, timezones, and no shared id scheme. |
| `ingest` | Maps each vendor's fields to a shared vocabulary, converts units and timestamps to one basis, and records which conversions required an assumption. Keeps provenance on every row. |
| `resolve` | Groups the register rows into the machines they describe and builds `graph.objects` / `graph.links` per `domains/ontology/catalog.py`, using derivable-but-not-identical keys — normalised names, masked-suffix, numeric-core, and one genuinely shared historian tag. |
| `findings` | Computes five cross-source finding types directly from the normalised data. Every number is a real computation. |

**The pipeline writes where the API is not reading.** `ISILDUR_PIPELINE_OUTPUT_PATH` is the
build target; `ISILDUR_WAREHOUSE_DB_PATH` is what the API serves. Keeping them separate
means a rebuild can never overwrite the database currently being served — point both at
the same file to serve the new one.

The window is anchored to a fixed date rather than `date.today()`, so the same seed
produces the same warehouse on any day and on any machine.

### The seeded incidents

Four things are deliberately wrong in the generated world, and the findings engine has to
find them from the data alone:

| Incident | What it looks like | Found as |
|---|---|---|
| One plant's metrology lab release rate collapses for five days | Nothing about the rows changes shape | `RATE_SHIFT` |
| One supplier's parts run all day with no historian cycles | Neither feed is broken on its own | `SOURCE_DIVERGENCE` |
| One supplier's telemetry stops for seven hours | A gap far longer than that supplier's own normal | `SILENT_SOURCE` |
| Work orders are raised shortly before a production spike | Two events near each other | `CO_OCCURRENCE` — reported as co-occurrence, never as cause |

These need production volume to be detectable: at `--scale small` the median gap between
cycles is eleven hours, so a seven-hour silence genuinely is not remarkable and the
detector is right not to fire. The findings tests therefore run at full scale and are
marked `slow`; the structural tests run at small scale in about a second.

### Deprecated names

The API was built against a previous demonstration domain — an online gaming operator —
and several field and metric names come from it. Renaming them outright would break any
client on the old contract, so the truthful names sit beside them, both are populated, and
the old ones are marked deprecated in the OpenAPI schema. They go away with the legacy
mount.

| Old | Now | Where |
|---|---|---|
| `deposits`, `withdrawals` | `released`, `scrapped` | `/metrics/{name}` |
| `sessions`, `rounds` | `runs`, `cycles` | `/metrics/{name}` |
| `market` | `plant` | `/metrics` query and response |
| `currency`, `usd_total` | `unit`, `quantity_kg` | `/metrics` composition |
| `transactions`, `rounds`, `sessions`, `campaign_sends` | `batches`, `cycles`, `runs`, `work_orders` | `/correlate`, finding context |

A request for a deprecated metric name gets that name back in `metric`, and the name that
actually answered in `canonical_metric`.

### The legacy gaming pipeline

`ontology.py`, `sources.py` and `pipeline/*.py` at the backend root are the previous
demonstration domain. They are no longer served — the API reads `data/warehouse.duckdb` —
and they still build `isildur.duckdb` if run:

| Stage | File | Does |
|---|---|---|
| Generate | `pipeline/generate_data.py` | Synthesizes six vendor source systems (JSON, XML, CSV, Excel) with deliberate cross-source mess: different field names, different status vocabularies, different currencies and timezones, no shared id scheme, and seeded operational events. |
| Ingest + clean | `pipeline/ingest_clean.py` | Loads the raw sources, maps field names to a shared vocabulary, normalizes status values and currency (fixed stated FX rates) and timestamps to UTC, tracking which required an assumed timezone. Keeps full provenance (source file, department) on every row. |
| Resolve | `pipeline/entity_resolution.py` | Resolves accounts to canonical players and builds `graph.objects` / `graph.links` per the schema in `ontology.py`, using derivable-but-not-identical keys across sources (masked-suffix matching, numeric-core matching, email matching) rather than a shared key. |
| Findings | `pipeline/findings.py` | Computes five cross-source finding types (rate shift, source divergence, volume anomaly, silent source, co-occurrence) directly from the normalized data. Every number is a real computation; nothing is invented. |

`ontology.py` (object types, relationship types) and `sources.py` (the vendor-source
provenance manifest) live at the package root because both the pipeline and the API depend
on them — they're the shared domain model, not a pipeline-only concern.

## Layout

The service is domain-driven (see `AGENTS.md` §4.1). `api.py` is now a compatibility shim
that re-exports the assembled app, so `uvicorn api:app` keeps working.

```
backend/
  pyproject.toml        deps, ruff, mypy, pytest, [tool.fastapi]
  requirements.txt      == pins; this repo has no uv, so this is the lockfile of record
  .env.example          every variable the backend reads
  src/app/
    main.py             FastAPI instance, lifespan, CORS, error translation, both mounts
    api/                router assembly (versioned + legacy), shared dependency aliases
    core/               settings, logging, domain exception base classes, pagination
    db/                 engines and sessions, write-retry helper
      warehouse/        SQLAlchemy Core tables for the pipeline-owned schemas
    domains/<name>/     router (HTTP) -> service (rules) -> repository (queries)
  tests/{unit,integration,contract}/
```

Layering runs one way only: a router never writes a query, a service never imports
fastapi or raises `HTTPException`, a repository never commits.

### Two database files

DuckDB locks a read-write file to one process, so the pipeline and the API cannot both
hold one open for writing:

| File | Owner | The API opens it |
|---|---|---|
| `isildur.duckdb` (`ISILDUR_WAREHOUSE_DB_PATH`) | the pipeline | read-only, always |
| `data/app.duckdb` (`ISILDUR_APP_DB_PATH`) | the API | read-write |

One consequence worth knowing before you debug it: anything opening the warehouse inside
the API process must pass the *same* DuckDB configuration the engine used, or DuckDB
refuses the second connection outright.

### Migrations

Alembic owns the `app` schema and nothing else. The pipeline-owned schemas are excluded by
`src/app/db/alembic_filter.py`; without that filter every autogenerate would propose
dropping the entire warehouse.

```bash
venv/bin/alembic upgrade head
venv/bin/alembic revision --autogenerate -m "what changed"   # then read and edit it
```

Two DuckDB facts that cost time if you learn them the hard way:

- **The catalog is named after the file stem.** `data/app.duckdb` gives a catalog called
  `app`, which is ambiguous with the `app` schema inside it and makes every qualified
  reference fail to bind. Hence `isildur_app.duckdb`.
- **duckdb-engine returns schema names catalog-qualified** (`isildur_app.app`), so
  Alembic's `compare_metadata` under `include_schemas` never looks inside `app` and
  reports every existing table as newly added. Drift is checked by reflecting column
  names instead — see `tests/integration/test_migrations.py`.

Back up the file before any production migration. It is one file, `cp` is a complete
backup while the app is stopped, and there is no `pg_dump` and no point-in-time recovery.

### Two mounts, one implementation

Every route is served twice — under `/api/v1` and at its original root path. Both mounts
include the same router objects, so there is no second implementation to drift. The
legacy paths are hidden from the OpenAPI schema and answer with a `Deprecation: true`
header; they exist so the frontend can move to the prefix in one change rather than a
flag day.

## API

`api.py` is a read-only FastAPI layer over the DuckDB tables the pipeline produces:

```
GET /check                     liveness ping: {"status": "ok"}, opens no database
GET /health                    entity/relationship/source/event counts, sync success rate
GET /connectors                each vendor system: status, last sync, records, errors
GET /findings                  computed operational findings
GET /findings/{id}             one finding with full evidence and surrounding context
GET /metrics/{name}            a metric with its per-source composition
GET /correlate?at=&window=     everything from every source in a time window
GET /sources                   vendor systems: owner, format, counts, field mappings
GET /objects?type=
GET /objects/{id}               properties, connections, raw records, provenance
GET /graph?type=                every object and link in one response, for the graph view
GET /search?q=
GET /stats                     pipeline and normalization metrics
GET /lineage/{id}

POST /access-requests           onboarding form submission, appended to access_requests.jsonl
```

`/check` and `/health` are deliberately different: `/check` is liveness — it opens no
DuckDB connection, so it answers even while the database is being rebuilt — and `/health`
is readiness, opening the database and returning real counts (it fails loudly if the
pipeline has not been run).

Everything except `POST /access-requests` is read-only; the API only ever opens the
database with `duckdb.connect(..., read_only=True)`, so concurrent readers are safe.

### Configuration

| Env var | Default | Does |
|---|---|---|
| `ISILDUR_CORS_ORIGINS` | `http://localhost:3000` | Comma-separated browser-origin allowlist. |
| `ISILDUR_DB_PATH` | `./isildur.duckdb` | Path to the DuckDB file to serve. |

CORS is an explicit allowlist with `allow_credentials=True` rather than `allow_origins=["*"]`:
the frontend axios client sends `withCredentials`, and browsers reject a wildcard origin on
credentialed requests. Point it at whatever port the frontend runs on:

```bash
ISILDUR_CORS_ORIGINS=http://localhost:3000,http://localhost:3001 .venv/bin/uvicorn api:app --port 8010
```

## Setup

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt

.venv/bin/python pipeline/generate_data.py
.venv/bin/python pipeline/ingest_clean.py
.venv/bin/python pipeline/entity_resolution.py
.venv/bin/python pipeline/findings.py

.venv/bin/uvicorn api:app --port 8010
```

## Tests

`tests/test_api.py` covers every route — happy path plus the 404 path for the `{id}`-style
routes — plus the CORS allowlist. It runs against the real `isildur.duckdb` read-only, so
it is safe to run while a dev server is up, and it skips itself if the database has not
been built yet.

```bash
venv/bin/pytest -q

# or against a database somewhere else
ISILDUR_DB_PATH=/path/to/isildur.duckdb venv/bin/pytest -q
```

The full gate, all of which must pass before a change is done:

```bash
venv/bin/ruff format --check src api.py tests
venv/bin/ruff check src api.py tests
venv/bin/mypy
venv/bin/pytest -q --cov=src --cov-report=term-missing
```

`tests/test_api.py` is the pre-refactor route-surface suite, kept byte-identical on
purpose: it is the evidence that splitting `api.py` into domains changed no behaviour.
It is excluded from `ruff` for the same reason.

`isildur.duckdb` and `data/raw/*` are generated artifacts and are gitignored — regenerate
them by running the pipeline above.
