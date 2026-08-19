"""Column types that would otherwise silently change a value.

Timestamps mean the same instant on every machine.

The driver's own behaviour is the hazard: given an aware datetime it converts to the
process's local zone and drops the offset, so the same code writing "now" produces a
different stored value in Kathmandu than in Berlin. That is the same class of bug that
made the pipeline non-reproducible across machines, and it is invisible in a test suite
that only ever runs in one zone — so the driver behaviour is asserted directly here,
alongside the behaviour of the column type that corrects it.
"""

import os
import time
from datetime import UTC, datetime, timedelta
from pathlib import Path

import duckdb
import pytest
from sqlalchemy import Engine, create_engine, select, text
from sqlalchemy.orm import Session, sessionmaker

from app.db.base import APP_SCHEMA, Base
from app.domains.findings.models import FindingReview
from app.domains.resolution.models import ResolutionWeightOverride

# Deliberately not a whole number of hours, and not the zone any CI box runs in.
AWKWARD_ZONE = "Asia/Kathmandu"
NOON_UTC = datetime(2026, 1, 1, 12, 0, tzinfo=UTC)


@pytest.fixture
def engine(tmp_path: Path) -> Engine:
    engine = create_engine(f"duckdb:///{tmp_path / 'isildur_app.duckdb'}")
    with engine.begin() as connection:
        connection.execute(text(f"CREATE SCHEMA IF NOT EXISTS {APP_SCHEMA}"))
    Base.metadata.create_all(engine)
    return engine


@pytest.fixture
def local_zone(monkeypatch: pytest.MonkeyPatch) -> None:
    """Run the test as if the machine were on a +05:45 clock."""
    monkeypatch.setenv("TZ", AWKWARD_ZONE)
    # setenv alone is not enough: libc caches the zone, and `_restore_zone` calls tzset
    # again on the way out.
    time.tzset()


@pytest.fixture(autouse=True)
def _restore_zone() -> object:
    original = os.environ.get("TZ")
    yield None
    if original is None:
        os.environ.pop("TZ", None)
    else:
        os.environ["TZ"] = original
    time.tzset()


def test_the_raw_driver_really_does_shift_an_aware_datetime(
    tmp_path: Path, local_zone: None
) -> None:
    """The bug this column type exists for. If this ever stops failing, the fix can go."""
    connection = duckdb.connect(str(tmp_path / "raw.duckdb"))
    try:
        connection.execute("CREATE TABLE t (a TIMESTAMP)")
        connection.execute("INSERT INTO t VALUES (?)", [NOON_UTC])
        (stored,) = connection.execute("SELECT a FROM t").fetchone() or (None,)
    finally:
        connection.close()

    assert stored == datetime(2026, 1, 1, 17, 45), "driver converted to local and dropped the zone"


def test_the_column_type_round_trips_the_same_instant(engine: Engine, local_zone: None) -> None:
    factory = sessionmaker(engine, expire_on_commit=False, class_=Session)
    with factory() as session:
        session.add(
            FindingReview(
                finding_id="find_0001",
                verdict="confirmed",
                reviewer="j.okafor",
                decided_at=NOON_UTC,
                rationale=None,
            )
        )
        session.commit()

    with factory() as session:
        review = session.scalar(select(FindingReview))

    assert review is not None
    assert review.decided_at == NOON_UTC
    assert review.decided_at.tzinfo is not None, "read back aware, so no caller has to guess"


def test_what_is_stored_is_utc_not_local(engine: Engine, local_zone: None) -> None:
    """Asserted against the raw column, not through the ORM.

    Reading it back through the same decorator that wrote it would pass even if the
    conversion were symmetric and wrong — which is exactly what the driver does.
    """
    factory = sessionmaker(engine, expire_on_commit=False, class_=Session)
    with factory() as session:
        session.add(
            FindingReview(
                finding_id="find_0002",
                verdict="dismissed",
                reviewer="a.mensah",
                decided_at=NOON_UTC,
                rationale=None,
            )
        )
        session.commit()

    with engine.connect() as connection:
        stored = connection.execute(
            text(f"SELECT CAST(decided_at AS VARCHAR) FROM {APP_SCHEMA}.finding_reviews")  # noqa: S608
        ).scalar_one()

    assert stored.startswith("2026-01-01 12:00:00")


def test_the_default_stamps_are_normalised_too(engine: Engine, local_zone: None) -> None:
    """`created_at` comes from the mixin, never from a caller — so it needs its own proof."""
    before = datetime.now(UTC)
    factory = sessionmaker(engine, expire_on_commit=False, class_=Session)
    with factory() as session:
        session.add(
            FindingReview(
                finding_id="find_0003",
                verdict="needs-more-evidence",
                reviewer="s.lindqvist",
                decided_at=NOON_UTC,
                rationale=None,
            )
        )
        session.commit()

    with factory() as session:
        review = session.scalar(select(FindingReview))

    assert review is not None
    # A local-time stamp on a +05:45 box would land nearly six hours in the future.
    assert before - timedelta(seconds=5) <= review.created_at <= datetime.now(UTC)


def test_a_float_survives_the_round_trip_unchanged(engine: Engine) -> None:
    """SQLAlchemy's default `Mapped[float]` is a 4-byte FLOAT.

    Every float in the app schema is a threshold, a weight or a similarity score that a
    person set, and at single precision 0.8 reads back as 0.800000011920929 — a number
    nobody typed, shown beside the one they did. `Base.type_annotation_map` maps float to
    Double so no new column can inherit the narrow default.
    """
    factory = sessionmaker(engine, expire_on_commit=False, class_=Session)
    with factory() as session:
        session.add(
            ResolutionWeightOverride(
                field="asset_tag",
                weight=0.8,
                set_by="j.okafor",
                set_at=NOON_UTC,
                note=None,
            )
        )
        session.commit()

    with factory() as session:
        stored = session.scalar(select(ResolutionWeightOverride))

    assert stored is not None
    assert stored.weight == 0.8
