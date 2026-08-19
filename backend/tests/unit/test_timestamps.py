"""Timestamp normalisation — the part of ingestion a reader has to be able to audit."""

from datetime import datetime

import pytest

from app.pipeline.ingest.timestamps import (
    from_excel_serial,
    from_historian,
    from_iso_with_offset,
    from_lab_local,
)


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("2026-06-01T12:00:00+02:00", datetime(2026, 6, 1, 10, 0)),
        ("2026-06-01T12:00:00+00:00", datetime(2026, 6, 1, 12, 0)),
        ("2026-06-01T12:00:00-06:00", datetime(2026, 6, 1, 18, 0)),
    ],
)
def test_a_stated_offset_is_converted_not_assumed(raw: str, expected: datetime) -> None:
    instant = from_iso_with_offset(raw)

    assert instant.at == expected
    assert instant.tz_assumed is False


def test_conversion_does_not_depend_on_the_machine_timezone() -> None:
    """Going through the local zone would make the pipeline produce different data on
    different machines from the same seed."""
    assert from_iso_with_offset("2026-06-01T12:00:00+05:45").at == datetime(2026, 6, 1, 6, 15)


def test_an_iso_string_with_no_offset_is_flagged_as_assumed() -> None:
    instant = from_iso_with_offset("2026-06-01T12:00:00")

    assert instant.at == datetime(2026, 6, 1, 12, 0)
    assert instant.tz_assumed is True


def test_the_historian_has_no_zone_so_utc_is_recorded_as_an_assumption() -> None:
    instant = from_historian("2026-06-01 12:00:00")

    assert instant.at == datetime(2026, 6, 1, 12, 0)
    assert instant.tz_assumed is True


def test_lab_local_time_is_shifted_by_the_plant_offset() -> None:
    instant = from_lab_local("06/01/2026 12:00", "Monterrey")

    assert instant.at == datetime(2026, 6, 1, 18, 0)
    assert instant.tz_assumed is True


def test_an_unknown_plant_falls_back_to_utc_rather_than_failing() -> None:
    """Losing the row would be worse than recording it with a stated assumption."""
    instant = from_lab_local("06/01/2026 12:00", "Atlantis")

    assert instant.at == datetime(2026, 6, 1, 12, 0)
    assert instant.tz_assumed is True


def test_an_excel_serial_becomes_a_real_instant() -> None:
    instant = from_excel_serial(46174.5)

    assert instant.at == datetime(2026, 6, 1, 12, 0)
    assert instant.tz_assumed is True
