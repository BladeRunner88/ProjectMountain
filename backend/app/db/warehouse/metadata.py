"""MetaData for pipeline-owned tables.

Deliberately NOT `Base.metadata`. These tables are created by the pipeline with
`CREATE OR REPLACE TABLE`, so Alembic must never claim them — if it did, every
autogenerate would propose dropping them and every migration would be silently discarded
by the next pipeline run. Core `Table` objects still buy typed columns, bound parameters,
named columns for `select()`, and mypy coverage.
"""

from sqlalchemy import MetaData

warehouse_metadata = MetaData()
