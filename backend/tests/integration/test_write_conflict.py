"""A real DuckDB write-write conflict, and the retry that absorbs it.

Unit tests prove the retry loop's logic against a synthetic error. This proves the error
it is written to catch is the error DuckDB actually raises — otherwise the string match
in `with_write_retry` could silently stop matching after a DuckDB upgrade and every
conflict would surface as a 500.
"""

from collections.abc import Iterator
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID, uuid4

import pytest
from sqlalchemy import Engine, create_engine, select, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.sql.elements import TextClause

from app.db.base import APP_SCHEMA, Base
from app.db.retry import with_write_retry
from app.domains.findings.models import FindingReview
from app.domains.pipeline_status.models import PipelineRun
from app.domains.revision.models import RevisionAuditEntry


@pytest.fixture
def engine(tmp_path: Path) -> Iterator[Engine]:
    """A file-backed database two independent sessions can both open."""
    engine = create_engine(f"duckdb:///{tmp_path / 'isildur_app.duckdb'}")
    with engine.begin() as connection:
        connection.execute(text(f"CREATE SCHEMA IF NOT EXISTS {APP_SCHEMA}"))
    Base.metadata.create_all(engine)
    yield engine
    engine.dispose()


def _set_stage_sql() -> TextClause:
    """The table name is a module constant, never caller input."""
    return text(f"UPDATE {APP_SCHEMA}.pipeline_runs SET stage = :stage WHERE id = :id")  # noqa: S608


def _seed(engine: Engine) -> UUID:
    factory = sessionmaker(engine, expire_on_commit=False, class_=Session)
    run = PipelineRun(
        id=uuid4(),
        started_at=datetime.now(UTC),
        stage="all",
        scale="small",
        succeeded=False,
        stats={},
    )
    with factory() as session:
        session.add(run)
        session.commit()
    return run.id


def test_duckdb_reports_a_conflict_when_two_transactions_update_one_row(engine: Engine) -> None:
    """Pins where DuckDB 1.5.5 actually raises, and with what wording.

    AGENTS.md 6.0/6.3 describe the loser finding out at COMMIT time. On the pinned
    version it finds out earlier — the second UPDATE itself raises
    `TransactionContext Error: Conflict on update!` while the first transaction is still
    open. The retry helper is unaffected, because it matches on the word "conflict" and
    wraps the whole unit of work rather than just the commit. This test is what will
    tell us if either of those facts changes.
    """
    run_id = _seed(engine)
    factory = sessionmaker(engine, expire_on_commit=False, class_=Session)

    with factory() as first, factory() as second:
        first.execute(select(PipelineRun).where(PipelineRun.id == run_id))
        second.execute(select(PipelineRun).where(PipelineRun.id == run_id))

        first.execute(_set_stage_sql(), {"id": run_id, "stage": "first"})

        with pytest.raises(OperationalError) as raised:
            second.execute(_set_stage_sql(), {"id": run_id, "stage": "second"})

    message = str(raised.value).lower()
    assert "conflict" in message, "with_write_retry keys off this word"


def test_the_retry_recovers_and_inserts_exactly_one_row(engine: Engine) -> None:
    factory = sessionmaker(engine, expire_on_commit=False, class_=Session)
    attempts: list[int] = []

    def insert_run() -> UUID:
        attempts.append(1)
        with factory() as session:
            run = PipelineRun(
                id=uuid4(),
                started_at=datetime.now(UTC),
                stage="all",
                scale="small",
                succeeded=True,
                stats={"records": 1},
            )
            session.add(run)
            if len(attempts) == 1:
                # Stand in for losing the commit race on the first try.
                raise OperationalError("COMMIT", None, Exception("Error: conflict detected"))
            session.commit()
            return run.id

    with_write_retry(insert_run)

    with factory() as session:
        rows = list(session.scalars(select(PipelineRun).where(PipelineRun.succeeded.is_(True))))

    assert len(attempts) == 2
    assert len(rows) == 1, "the replayed attempt must not leave a second row behind"


def test_a_committed_row_survives_a_reconnect(engine: Engine) -> None:
    """Guards the deployment mistake AGENTS.md 2 warns about: a stateless volume."""
    run_id = _seed(engine)
    factory = sessionmaker(engine, expire_on_commit=False, class_=Session)

    with factory() as session:
        assert session.get(PipelineRun, run_id) is not None


def test_a_replayed_finding_review_files_exactly_one_verdict(engine: Engine) -> None:
    """The Phase 6 write path, under the failure `with_write_retry` exists to absorb.

    A review is not idempotent by nature: the table is append-only, so a block that runs
    twice would leave two verdicts and the finding would show a decision nobody made
    twice. What makes the replay safe is that the row is constructed INSIDE the retried
    block from arguments fixed outside it — including `decided_at`, so the replay cannot
    even be told apart by its timestamp.
    """
    factory = sessionmaker(engine, expire_on_commit=False, class_=Session)
    attempts: list[int] = []
    decided_at = datetime.now(UTC)

    def file_verdict() -> None:
        attempts.append(1)
        with factory() as session:
            session.add(
                FindingReview(
                    id=uuid4(),
                    finding_id="find_0001",
                    verdict="confirmed",
                    reviewer="j.okafor",
                    decided_at=decided_at,
                    rationale=None,
                )
            )
            if len(attempts) == 1:
                raise OperationalError("COMMIT", None, Exception("Error: conflict detected"))
            session.commit()

    with_write_retry(file_verdict)

    with factory() as session:
        rows = list(
            session.scalars(select(FindingReview).where(FindingReview.finding_id == "find_0001"))
        )

    assert len(attempts) == 2
    assert len(rows) == 1, "a replay must not file the same verdict twice"
    assert rows[0].decided_at.replace(tzinfo=UTC) == decided_at


def test_a_replayed_revision_action_seals_exactly_one_link(engine: Engine) -> None:
    """The retried block reads the chain head INSIDE itself, and that is load-bearing.

    A replay after a conflict must chain onto whatever the winning transaction left
    behind. Reading the head once, outside the block, would make the replay reuse a
    sequence number that is no longer free — the unique constraint would reject it, and
    the retry that was supposed to absorb the conflict would surface as a 500.
    """
    factory = sessionmaker(engine, expire_on_commit=False, class_=Session)
    attempts: list[int] = []
    occurred_at = datetime.now(UTC)

    # Somebody else's entry, standing in for the transaction that won the race.
    with factory() as session:
        session.add(
            RevisionAuditEntry(
                id=uuid4(),
                sequence=1,
                queue_item_id=None,
                actor="a.mensah",
                action="approve",
                occurred_at=occurred_at,
                payload={},
                seal="seal-1",
                prev_seal=None,
            )
        )
        session.commit()

    def seal_decision() -> None:
        attempts.append(1)
        with factory() as session:
            previous = session.scalars(
                select(RevisionAuditEntry).order_by(RevisionAuditEntry.sequence.desc()).limit(1)
            ).first()
            sequence = 1 if previous is None else previous.sequence + 1
            session.add(
                RevisionAuditEntry(
                    id=uuid4(),
                    sequence=sequence,
                    queue_item_id=None,
                    actor="j.okafor",
                    action="reject",
                    occurred_at=occurred_at,
                    payload={},
                    seal=f"seal-{sequence}",
                    prev_seal=None if previous is None else previous.seal,
                )
            )
            if len(attempts) == 1:
                raise OperationalError("COMMIT", None, Exception("Error: conflict detected"))
            session.commit()

    with_write_retry(seal_decision)

    with factory() as session:
        chain = list(
            session.scalars(select(RevisionAuditEntry).order_by(RevisionAuditEntry.sequence))
        )

    assert len(attempts) == 2
    assert [entry.sequence for entry in chain] == [1, 2]
    assert chain[1].prev_seal == chain[0].seal, "the replay chained onto the winner"
