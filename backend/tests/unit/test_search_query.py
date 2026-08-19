"""Search query bounds at the HTTP boundary."""

from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.main import app

API = get_settings().api_prefix


def test_search_rejects_an_oversized_query() -> None:
    client = TestClient(app)
    response = client.get(f"{API}/search", params={"q": "a" * 201})
    assert response.status_code == 422
