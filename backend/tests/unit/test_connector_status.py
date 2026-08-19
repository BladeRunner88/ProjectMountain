"""Connector health classification, tested without a database."""

import pytest

from app.domains.sources.service import classify_connector_health


@pytest.mark.parametrize(
    ("records", "failed", "expected"),
    [
        (100, 0, "Connected"),
        (1000, 4, "Degraded"),
        (1000, 60, "Failed"),
        (0, 1, "Failed"),
    ],
)
def test_status_ladder(records: int, failed: int, expected: str) -> None:
    status, _ = classify_connector_health(records, failed, "NorthPay")

    assert status == expected


def test_a_healthy_connector_has_nothing_to_explain() -> None:
    _, explanation = classify_connector_health(100, 0, "NorthPay")

    assert explanation is None


def test_the_explanation_counts_records_offered_not_records_kept() -> None:
    """`records` is what survived parsing, so the denominator has to add the failures."""
    _, explanation = classify_connector_health(1000, 4, "NorthPay")

    assert explanation == "4 of 1004 records failed to parse from NorthPay."


def test_a_failed_connector_says_the_feed_did_not_load() -> None:
    _, explanation = classify_connector_health(100, 900, "Quantis Pay")

    assert explanation is not None
    assert "most of this feed did not load" in explanation
