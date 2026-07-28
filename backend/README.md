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

`isildur.duckdb` and `data/raw/*` are generated artifacts and are gitignored — regenerate
them by running the pipeline above.
