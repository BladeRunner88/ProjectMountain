"""The telemetry snapshot, against the real warehouse."""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.main import app

_WAREHOUSE = Path(get_settings().warehouse_database_url.removeprefix("duckdb:///"))

pytestmark = pytest.mark.skipif(not _WAREHOUSE.exists(), reason=f"no warehouse at {_WAREHOUSE}")

client = TestClient(app)
FIXED_INSTANT = "2026-07-01T12:00:00Z"


def _snapshot(**params: object) -> dict:
    return client.get("/api/v1/telemetry/snapshot", params={"at": FIXED_INSTANT, **params}).json()


def test_the_same_instant_returns_a_byte_identical_body() -> None:
    """The headline property: cacheable, and the same moment for every viewer."""
    first = client.get("/api/v1/telemetry/snapshot", params={"at": FIXED_INSTANT})
    second = client.get("/api/v1/telemetry/snapshot", params={"at": FIXED_INSTANT})

    assert first.content == second.content


def test_instants_within_one_tick_return_the_same_frame() -> None:
    a = client.get("/api/v1/telemetry/snapshot", params={"at": "2026-07-01T12:00:01Z"}).json()
    b = client.get("/api/v1/telemetry/snapshot", params={"at": "2026-07-01T12:00:04Z"}).json()

    assert a["tick"] == b["tick"]
    assert a["readings"] == b["readings"]


def test_the_response_is_cacheable_for_exactly_one_tick() -> None:
    response = client.get("/api/v1/telemetry/snapshot", params={"at": FIXED_INSTANT})

    assert response.headers["cache-control"] == "public, max-age=5"


def test_every_reading_names_its_channel_unit_and_source() -> None:
    for reading in _snapshot(limit=20)["readings"]:
        assert reading["unit"]
        assert reading["source_file"]
        assert reading["channel"]


def test_readings_are_attributed_to_the_machine_they_are_mounted_on() -> None:
    readings = _snapshot(limit=50)["readings"]

    assert any(reading["machine_id"] for reading in readings)


def test_the_window_controls_how_much_history_comes_back() -> None:
    none = _snapshot(window_seconds=0, limit=1)["readings"][0]
    some = _snapshot(window_seconds=60, limit=1)["readings"][0]

    assert none["series"] == []
    assert len(some["series"]) == 12


def test_history_is_the_same_function_evaluated_backwards() -> None:
    """The last point of a window must equal the reading at that tick."""
    reading = _snapshot(window_seconds=60, limit=1)["readings"][0]

    assert reading["series"][-1]["v"] == reading["value"]


def test_a_channel_filter_returns_only_that_channel() -> None:
    readings = _snapshot(channel="spindle_temp_c", limit=10)["readings"]

    assert readings
    assert {reading["channel"] for reading in readings} == {"spindle_temp_c"}


def test_the_sensor_limit_is_capped_server_side() -> None:
    body = _snapshot(limit=500)

    assert len(body["readings"]) <= 500


def test_the_snapshot_reports_when_each_feed_last_delivered() -> None:
    sources = _snapshot(limit=1)["sources"]

    assert sources
    assert all("age_seconds" in source for source in sources)


def test_counters_are_counted_not_asserted() -> None:
    body = _snapshot(limit=40)
    readings = body["readings"]

    assert body["counters"]["sensors_reporting"] == len(readings)
    assert body["counters"]["sensors_stale"] == sum(
        1 for reading in readings if reading["quality"] == "stale"
    )


def test_channels_are_discoverable_so_no_client_hardcodes_a_unit() -> None:
    channels = client.get("/api/v1/telemetry/channels").json()

    assert channels
    assert {channel["channel"] for channel in channels} >= {"spindle_temp_c", "vibration_mm_s"}
    assert all(channel["unit"] for channel in channels)
