"""Retry helper for DuckDB's optimistic concurrency."""

import logging
from collections.abc import Callable
from typing import TypeVar

from sqlalchemy.exc import OperationalError

logger = logging.getLogger(__name__)

T = TypeVar("T")

MAX_ATTEMPTS = 3


def with_write_retry(operation: Callable[[], T]) -> T:
    """Retry a unit of work that lost DuckDB's optimistic-concurrency race.

    DuckDB does not block on a row lock; it fails the loser and expects the work to be
    redone. On duckdb 1.5.5 the failure surfaces at the conflicting *statement*
    ("TransactionContext Error: Conflict on update!"), not at the commit — which is why
    the whole unit of work is wrapped rather than just the commit call. Pinned by
    tests/integration/test_write_conflict.py.

    Only conflict errors are retried; everything else propagates untouched.

    The operation re-runs from the start, so it must be idempotent — never place a side
    effect (email, webhook, payment) inside the retried block.
    """
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            return operation()
        except OperationalError as exc:
            if "conflict" not in str(exc).lower() or attempt == MAX_ATTEMPTS:
                raise
            logger.warning("write conflict, retrying (%d/%d)", attempt, MAX_ATTEMPTS)
    raise AssertionError("unreachable")
