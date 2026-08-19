"""Which database objects Alembic is allowed to manage.

Alembic owns exactly one schema: `app`. The raw/clean/graph/findings tables belong to the
pipeline, which recreates them with `CREATE OR REPLACE TABLE` on every run. If Alembic
saw them it would propose dropping every one on the first autogenerate, and any migration
it did apply would be discarded by the next pipeline run.

Lives here rather than in alembic/env.py so it can be tested — env.py runs migrations as
a side effect of import and cannot be imported by a test.
"""

from typing import Any

from app.db.base import APP_SCHEMA


def include_object(
    obj: Any,
    name: str | None,
    type_: str,
    reflected: bool,
    compare_to: Any,
) -> bool:
    """True when Alembic may manage this object."""
    if type_ == "table":
        return bool(getattr(obj, "schema", None) == APP_SCHEMA)
    # Columns, indexes and constraints are filtered by the table that owns them.
    return True
