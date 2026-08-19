"""The prefixed and unprefixed mounts must be the same surface.

Both mounts include the same router objects, so this is really a guard against someone
adding an endpoint to one and not the other — and against the prefix silently changing
a response.
"""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.main import app

_settings = get_settings()
_WAREHOUSE = Path(_settings.warehouse_database_url.removeprefix("duckdb:///"))

pytestmark = pytest.mark.skipif(
    not _WAREHOUSE.exists(),
    reason=f"no warehouse database at {_WAREHOUSE}; run the pipeline first",
)

client = TestClient(app)
PREFIX = _settings.api_prefix

# One representative path per domain. Parameterised paths use ids resolved at runtime.
STATIC_PATHS = [
    "/check",
    "/health",
    "/connectors",
    "/sources",
    "/stats",
    "/findings",
    "/metrics/deposits",
    "/metrics/sessions",
    "/objects",
    "/graph",
    "/search?q=a",
    "/correlate?at=2024-06-01T12:00:00",
]


@pytest.mark.parametrize("path", STATIC_PATHS)
def test_both_mounts_return_the_same_body(path: str) -> None:
    legacy = client.get(path)
    prefixed = client.get(PREFIX + path)

    assert legacy.status_code == prefixed.status_code
    assert legacy.json() == prefixed.json()


@pytest.mark.parametrize("path", STATIC_PATHS)
def test_the_legacy_mount_announces_its_own_deprecation(path: str) -> None:
    assert client.get(path).headers.get("Deprecation") == "true"


@pytest.mark.parametrize("path", STATIC_PATHS)
def test_the_prefixed_mount_is_not_marked_deprecated(path: str) -> None:
    assert "Deprecation" not in client.get(PREFIX + path).headers


def test_only_the_prefixed_surface_is_documented() -> None:
    schema = client.get(f"{PREFIX}/openapi.json").json()

    assert schema["paths"], "the documented surface is empty"
    assert all(path.startswith(PREFIX) for path in schema["paths"])
