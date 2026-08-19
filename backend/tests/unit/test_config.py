"""Settings behaviour that other layers depend on."""

from pathlib import Path

from app.core.config import Settings


def _settings(**overrides: object) -> Settings:
    defaults: dict[str, object] = {"environment": "local"}
    return Settings(**{**defaults, **overrides})  # type: ignore[arg-type]


def test_cors_origins_accepts_a_comma_separated_string() -> None:
    settings = _settings(cors_origins="http://a.test, http://b.test")

    assert settings.cors_origins == ["http://a.test", "http://b.test"]


def test_cors_origins_drops_empty_entries() -> None:
    settings = _settings(cors_origins="http://a.test,,  ,http://b.test")

    assert settings.cors_origins == ["http://a.test", "http://b.test"]


def test_debug_is_true_only_in_local() -> None:
    assert _settings(environment="local").debug is True
    assert _settings(environment="production").debug is False


def test_relative_database_paths_resolve_against_the_backend_root() -> None:
    settings = _settings(app_db_path=Path("data/app.duckdb"))

    assert settings.app_database_url.startswith("duckdb:////")
    assert settings.app_database_url.endswith("/backend/data/app.duckdb")


def test_absolute_database_paths_are_left_alone() -> None:
    settings = _settings(app_db_path=Path("/srv/isildur/elsewhere.duckdb"))

    assert settings.app_database_url == "duckdb:////srv/isildur/elsewhere.duckdb"
