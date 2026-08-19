"""Application settings. The only module in the codebase allowed to read the environment."""

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import AliasChoices, Field, computed_field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Two parents up is backend/. Three would be the repo root, and every relative
# DuckDB path would silently open a different file.
_BACKEND_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    """Every environment variable the backend reads. See .env.example."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        env_prefix="ISILDUR_",
        case_sensitive=False,
        extra="ignore",
    )

    project_name: str = "Isildur ASE API"
    version: str = "0.2.0"
    environment: Literal["local", "staging", "production"] = "local"
    api_prefix: str = "/api/v1"

    # NOT "app.duckdb": DuckDB names the catalog after the file stem, so a file called
    # app.duckdb and a schema called `app` are ambiguous and every qualified reference
    # fails to bind.
    app_db_path: Path = Path("data/isildur_app.duckdb")

    # Where the pipeline WRITES. Deliberately separate from what the API READS, so a
    # pipeline run can never overwrite the database currently being served. They are
    # pointed at the same file once the new warehouse is the one in use.
    pipeline_output_path: Path = Path("data/warehouse.duckdb")

    # ISILDUR_DB_PATH is the name the pre-refactor API used and the one the runbook and
    # test docstrings still document. Accepted as an alias so an existing shell or CI job
    # keeps working; ISILDUR_WAREHOUSE_DB_PATH is the name going forward.
    warehouse_db_path: Path = Field(
        default=Path("data/warehouse.duckdb"),
        validation_alias=AliasChoices(
            "ISILDUR_WAREHOUSE_DB_PATH", "ISILDUR_DB_PATH", "warehouse_db_path"
        ),
    )

    duckdb_memory_limit: str = "2GB"
    duckdb_threads: int = 4

    # Starlette's default of 40 threads produces write conflicts against a single-writer
    # database. See AGENTS.md 4.2 and 6.0.
    threadpool_size: int = 8

    cors_origins: list[str] = ["http://localhost:3000"]
    log_level: str = "INFO"

    # mypy does not support a decorator stacked on top of @property, so the three
    # @computed_field properties below carry a narrow, line-level ignore. This is the
    # exact pattern AGENTS.md 5 prescribes; the ignore is a mypy limitation, not a defect.

    @field_validator("cors_origins", mode="before")
    @classmethod
    def split_comma_separated(cls, value: object) -> object:
        """Accept `a,b` as well as a JSON list, matching how the legacy API read this var."""
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @computed_field  # type: ignore[prop-decorator]  # see note above
    @property
    def debug(self) -> bool:
        return self.environment == "local"

    @computed_field  # type: ignore[prop-decorator]  # see note above
    @property
    def app_database_url(self) -> str:
        """Read-write DuckDB file owned by the API. Alembic's only target."""
        return f"duckdb:///{self._absolute(self.app_db_path)}"

    @computed_field  # type: ignore[prop-decorator]  # see note above
    @property
    def pipeline_output_url(self) -> str:
        """The file the pipeline builds into.

        Separate from `warehouse_database_url` so a rebuild cannot overwrite the database
        currently being served. Point both at the same path to serve the new one.
        """
        return f"duckdb:///{self._absolute(self.pipeline_output_path)}"

    @computed_field  # type: ignore[prop-decorator]  # see note above
    @property
    def warehouse_database_url(self) -> str:
        """Pipeline-owned DuckDB file. The API opens it read-only and never writes it."""
        return f"duckdb:///{self._absolute(self.warehouse_db_path)}"

    def _absolute(self, path: Path) -> Path:
        return path if path.is_absolute() else _BACKEND_ROOT / path


@lru_cache
def get_settings() -> Settings:
    """One Settings instance per process, injected everywhere else."""
    return Settings()
