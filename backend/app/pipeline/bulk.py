"""Bulk insert for the pipeline.

Two things here are load-bearing, and the second is worth more than it looks.

**Rows go to DuckDB's driver, not through SQLAlchemy.** SQLAlchemy binds `executemany`
parameters one row at a time; handing DuckDB positional tuples lets it bind them in one
pass. This is the one place in the codebase that reaches past SQLAlchemy to the driver,
and it is confined to the offline pipeline — the API never uses it, and every table name
below comes from a module constant rather than from input.

**A missing pandas is made to fail fast.** DuckDB's Python binding tries `import pandas`
four times per row to decide whether a value is a DataFrame. When pandas is not installed
each attempt is a full, failing `sys.path` scan: ingesting 71,000 rows fired 2.67 million
failed imports and spent 158 of its 175 seconds inside Python's import machinery. Putting
`None` in `sys.modules` makes the same import raise `ImportError` immediately, without
touching the filesystem — the outcome DuckDB already handles, reached instantly instead of
after a directory walk. Installing pandas would also fix it, and would be a heavyweight
dependency added for a negative lookup.
"""

import importlib.util
import sys
from typing import Any

from sqlalchemy import Connection

_OPTIONAL_DEPENDENCIES = ("pandas",)


def short_circuit_absent_optional_imports() -> None:
    """Make DuckDB's per-value probe for an absent optional package fail immediately.

    Only ever installs the sentinel for a package that is genuinely not importable, so a
    real installation is never shadowed.
    """
    for name in _OPTIONAL_DEPENDENCIES:
        if name in sys.modules:
            continue
        if importlib.util.find_spec(name) is None:
            sys.modules[name] = None  # type: ignore[assignment]


def insert_rows(connection: Connection, table: str, rows: list[tuple[Any, ...]]) -> int:
    """Insert every row into `table`. Returns how many were written."""
    if not rows:
        return 0

    short_circuit_absent_optional_imports()

    placeholders = ", ".join("?" for _ in rows[0])
    statement = f"INSERT INTO {table} VALUES ({placeholders})"

    driver_connection = connection.connection.driver_connection
    if driver_connection is None:  # pragma: no cover - defensive
        raise RuntimeError("no DuckDB driver connection available for bulk insert")
    driver_connection.executemany(statement, rows)
    return len(rows)
