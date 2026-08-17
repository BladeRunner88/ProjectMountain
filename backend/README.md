# Isildur backend

Python + DuckDB + FastAPI. Generates a synthetic, deliberately messy multi-vendor data
landscape, cleans and normalizes it, resolves it into one ontology-backed graph, computes
cross-source operational findings, and serves all of it read-only over HTTP.

## Pipeline

Run in order — each stage reads the previous stage's output from `isildur.duckdb`:

| Stage | File | Does |
|---|---|---|
| Generate | `pipeline/generate_data.py` | Synthesizes six vendor source systems (JSON, XML, CSV, Excel) with deliberate cross-source mess: different field names, different status vocabularies, different currencies and timezones, no shared id scheme, and seeded operational events. |
| Ingest + clean | `pipeline/ingest_clean.py` | Loads the raw sources, maps field names to a shared vocabulary, normalizes status values and currency (fixed stated FX rates) and timestamps to UTC, tracking which required an assumed timezone. Keeps full provenance (source file, department) on every row. |
| Resolve | `pipeline/entity_resolution.py` | Resolves accounts to canonical players and builds `graph.objects` / `graph.links` per the schema in `ontology.py`, using derivable-but-not-identical keys across sources (masked-suffix matching, numeric-core matching, email matching) rather than a shared key. |
| Findings | `pipeline/findings.py` | Computes five cross-source finding types (rate shift, source divergence, volume anomaly, silent source, co-occurrence) directly from the normalized data. Every number is a real computation; nothing is invented. |

`ontology.py` (object types, relationship types) and `sources.py` (the vendor-source
provenance manifest) live at the package root because both the pipeline and the API depend
on them — they're the shared domain model, not a pipeline-only concern.

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
.venv/bin/pytest tests/ -v

# or against a database somewhere else
ISILDUR_DB_PATH=/path/to/isildur.duckdb .venv/bin/pytest tests/ -v
```

`isildur.duckdb` and `data/raw/*` are generated artifacts and are gitignored — regenerate
them by running the pipeline above.
