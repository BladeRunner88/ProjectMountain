"""Declarative base and mixins for the API-owned `app` schema.

Only tables the API itself writes live here. Pipeline-owned tables are Core `Table`
objects in `app.db.warehouse` with their own MetaData, so Alembic never claims them.
"""

from datetime import UTC, datetime
from typing import Any, ClassVar
from uuid import UUID, uuid4

from sqlalchemy import MetaData
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.types import TypeEngine

from app.db.utc_datetime import UtcDateTime

NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}

APP_SCHEMA = "app"


class Base(DeclarativeBase):
    """Deterministic constraint names keep Alembic autogenerate stable."""

    metadata = MetaData(naming_convention=NAMING_CONVENTION, schema=APP_SCHEMA)
    # Every `Mapped[datetime]` becomes a UTC-normalising column without asking. The
    # driver otherwise rewrites an aware stamp into the machine's local zone and drops
    # the offset — see app.db.utc_datetime.
    type_annotation_map: ClassVar[dict[type[Any], type[TypeEngine[Any]]]] = {datetime: UtcDateTime}


def utc_now() -> datetime:
    """Timestamp default.

    Python-side rather than `server_default=func.now()`: that rendering is unverified on
    duckdb-engine 0.17, and `with_write_retry` replays the whole block, so a Python
    default stays deterministic across a replay.
    """
    return datetime.now(UTC)


class UUIDMixin:
    """UUID primary key, per AGENTS.md 6.2 — for rows minted per request under concurrency."""

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)


class TimestampMixin:
    """Created/updated stamps, both generated in Python."""

    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now, onupdate=utc_now)
