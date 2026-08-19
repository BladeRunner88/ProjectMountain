"""Timezone-safe TIMESTAMP column.

DuckDB's TIMESTAMP is naive, and the Python driver does not store an aware datetime
as-is: it converts it to the machine's local zone first and drops the offset. Verified
on the pinned duckdb 1.5.5 — inserting 12:00Z on a UTC+05:45 machine reads back as
17:45 with no offset, so the row silently records a different instant, and a colleague
in another zone gets a different answer from the same code.

Everything in the application mints timestamps with `datetime.now(UTC)`, so without this
every stamp in the `app` schema would carry the writer's local clock. The decorator
normalises to naive UTC going in and re-attaches UTC coming out, which makes the value a
round trip rather than a one-way conversion.

Applied through `Base.type_annotation_map`, so a plain `Mapped[datetime]` gets it
automatically — a per-column opt-in would be forgotten exactly once.

The stored type is unchanged (TIMESTAMP), so this needs no migration.
"""

from datetime import UTC, datetime

from sqlalchemy import DateTime, Dialect, TypeDecorator


class UtcDateTime(TypeDecorator[datetime]):
    """Store naive UTC; return aware UTC."""

    impl = DateTime
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect: Dialect) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            # Already naive. Taken as UTC rather than guessed at — the application never
            # mints a naive stamp, so this is a value that came from the database.
            return value
        return value.astimezone(UTC).replace(tzinfo=None)

    def process_result_value(self, value: datetime | None, dialect: Dialect) -> datetime | None:
        if value is None:
            return None
        return value.replace(tzinfo=UTC)
