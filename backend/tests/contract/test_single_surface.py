"""There is exactly one surface, and it is prefixed.

Replaces the dual-mount contract test, whose subject no longer exists. Through the
migration the same routers were mounted twice -- prefixed, and unprefixed with a
Deprecation header -- so the frontend could keep calling root paths until it flipped.
Phase 7 removed the unprefixed mount, and this is what stops it coming back: a router
registered without the prefix, or a hand-written path that skips it, fails here.
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

STATIC_PATHS = [
    "/check",
    "/health",
    "/connectors",
    "/sources",
    "/stats",
    "/findings",
    "/metrics/released",
    "/metrics/runs",
    "/objects",
    "/graph",
    "/search?q=a",
    "/correlate?at=2024-06-01T12:00:00",
]


@pytest.mark.parametrize("path", STATIC_PATHS)
def test_the_prefixed_path_answers(path: str) -> None:
    assert client.get(f"{PREFIX}{path}").status_code == 200


@pytest.mark.parametrize("path", STATIC_PATHS)
def test_the_unprefixed_path_is_gone(path: str) -> None:
    """404, not a redirect. A path that silently forwards is a path nobody migrates off."""
    assert client.get(path).status_code == 404


def test_every_route_the_app_serves_is_under_the_prefix() -> None:
    """Catches a router mounted outside `build_api_router`, which is how a second
    surface would reappear without any test naming it."""
    served = {
        route.path
        for route in app.routes
        if getattr(route, "path", "").startswith("/") and hasattr(route, "methods")
    }
    # FastAPI's own docs endpoints are framework routes, not part of the API surface.
    framework = {"/openapi.json", "/docs", "/docs/oauth2-redirect", "/redoc"}

    assert {path for path in served - framework if not path.startswith(PREFIX)} == set()
