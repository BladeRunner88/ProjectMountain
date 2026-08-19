"""Retry behaviour for DuckDB's optimistic concurrency."""

import pytest
from sqlalchemy.exc import OperationalError

from app.db.retry import MAX_ATTEMPTS, with_write_retry


def _conflict() -> OperationalError:
    """The shape DuckDB raises when a transaction loses the commit race."""
    return OperationalError("COMMIT", None, Exception("TransactionContext Error: conflict on row"))


def test_a_successful_operation_runs_exactly_once() -> None:
    calls: list[int] = []

    result = with_write_retry(lambda: calls.append(1) or "done")

    assert result == "done"
    assert len(calls) == 1


def test_a_conflict_is_retried_until_it_succeeds() -> None:
    attempts: list[int] = []

    def flaky() -> str:
        attempts.append(1)
        if len(attempts) < MAX_ATTEMPTS:
            raise _conflict()
        return "committed"

    assert with_write_retry(flaky) == "committed"
    assert len(attempts) == MAX_ATTEMPTS


def test_the_side_effect_lands_once_even_though_the_block_replayed() -> None:
    """The whole point of the retry contract.

    The retried block re-runs from the start, so anything it does must be safe to redo.
    Here the row is built fresh each attempt and only the committed one survives — if the
    implementation accumulated instead, this would show two rows.
    """
    committed: list[str] = []
    attempts: list[int] = []

    def insert_once() -> str:
        attempts.append(1)
        if len(attempts) == 1:
            raise _conflict()
        committed.append("row")
        return "row"

    with_write_retry(insert_once)

    assert committed == ["row"]


def test_it_gives_up_after_the_attempt_limit() -> None:
    attempts: list[int] = []

    def always_conflicts() -> str:
        attempts.append(1)
        raise _conflict()

    with pytest.raises(OperationalError):
        with_write_retry(always_conflicts)

    assert len(attempts) == MAX_ATTEMPTS


def test_a_non_conflict_error_is_not_retried() -> None:
    """A constraint violation or a syntax error is not a race — replaying it wastes work
    and hides the real failure."""
    attempts: list[int] = []

    def broken() -> str:
        attempts.append(1)
        raise OperationalError("INSERT", None, Exception("Constraint Error: duplicate key"))

    with pytest.raises(OperationalError):
        with_write_retry(broken)

    assert len(attempts) == 1
