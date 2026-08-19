# AGENTS.md — Engineering Rules for Coding Agents

**Stack:** Next.js 16 (App Router, TypeScript) · FastAPI · Uvicorn · Pydantic v2 · SQLAlchemy 2.0 (sync) · Alembic · DuckDB

> **Read §6.0 before writing any database or endpoint code.** DuckDB has no async driver and a single-writer process model. That is not a detail — it changes how routes, services, and deployment are written throughout this document. Backend I/O here is **synchronous by design**.

This file is the contract. Read it fully before writing code. Where this file and your training data disagree, **this file wins**. Where this file and the installed library's own docs disagree, **the installed library's docs win** — and you must flag the conflict in your summary.

---

## 0. Prime Directive — Do No Harm

You are working on a codebase that is running in production. Your default posture is **additive and reversible**.

**You MUST NOT, without an explicit written instruction from the user:**

1. Change a public HTTP contract — no renaming/removing endpoints, no changing status codes, no removing or renaming response fields, no making an optional request field required, no narrowing an accepted type.
2. Change a database column/table/constraint in a destructive way — no `DROP COLUMN`, no `DROP TABLE`, no type narrowing, no adding `NOT NULL` without a backfill + default.
3. Change the shape of an exported TypeScript type, React component prop, or Python function signature that other modules import.
4. Upgrade, downgrade, add, or remove a dependency.
5. Modify auth, session, permission, CORS, or secret-handling logic.
6. Delete or rewrite an existing test to make it pass.
7. Run a formatter or codemod across files unrelated to your task.
8. Reformat, reorder imports in, or "clean up" a file you were not asked to change.

**When a task appears to require one of the above:** stop, implement everything that does *not* require it, and report exactly which of the eight rules blocks you and what you propose. Do not guess.

**Additive changes are always preferred:**

| Instead of | Do |
|---|---|
| Renaming a field | Add the new field, populate both, deprecate the old one in the docstring/OpenAPI |
| Changing a function signature | Add a new keyword arg with a default that preserves current behaviour |
| Replacing an endpoint | Add `/v2/...`, leave `/v1/...` intact |
| Dropping a column | Stop writing to it; schedule removal as a separate, explicitly approved task |
| Changing a default value | Make it configurable; keep the current value as the default |

**Definition of Done for every change:** lint passes, types pass, tests pass, no unrelated files in the diff, and the change is described in one paragraph naming every consumer that could be affected.

---

## 1. Verify Before You Write

Your training data is stale. Before the first line of code:

```bash
# Frontend — read the actual installed version, not what you remember
cat package.json | grep -E '"(next|react|typescript)"'
cat node_modules/next/package.json | grep '"version"'

# Backend — read the actual installed versions
uv pip list | grep -Ei '^(fastapi|pydantic|sqlalchemy|alembic|uvicorn|starlette)'
python -c "import fastapi, pydantic, sqlalchemy; print(fastapi.__version__, pydantic.VERSION, sqlalchemy.__version__)"
```

Next.js 16.2+ ships version-matched documentation inside the repo. **Read it before writing Next.js code:**

```
node_modules/next/dist/docs/
```

Resolve that path from the location of this file; in a monorepo the `next` package may not be visible from the repo root. `next dev` writes and re-adds a managed `<!-- BEGIN:nextjs-agent-rules -->` block to `AGENTS.md`. **Do not delete that block** — it regenerates and only dirties your diff. Commit it with your work.

For FastAPI, Pydantic, SQLAlchemy, and DuckDB, consult the docs for the exact installed minor version. Do not pin, bump, or "helpfully update" any version. Lockfiles (`pnpm-lock.yaml` / `uv.lock`) are the source of truth.

DuckDB moves fast and its SQL surface, extensions, and on-disk storage format vary by release. Check what you actually have before using any DuckDB feature:

```bash
python -c "import duckdb; print(duckdb.__version__)"
uv pip list | grep -Ei '^(duckdb|duckdb-engine|duckdb-sqlalchemy)'
```

**Rule:** if you cannot verify an API exists in the installed version, do not use it. Say so instead.

---

## 2. Repository Layout

```
repo/
├── AGENTS.md                     # this file
├── README.md
├── docker-compose.yml            # frontend + backend only — DuckDB is embedded,
│                                 # there is no database service to run
├── frontend/                     # Next.js 16 app
└── backend/                      # FastAPI service
    └── data/                     # the .duckdb file lives here — GITIGNORED,
                                  # mounted as a persistent volume in deployment
```

The database is a file inside the backend container, not a separate service. That means the container needs a **persistent volume** at `data/` — a stateless deployment will silently discard every write on restart. Confirm the volume exists before shipping any deployment change.

Frontend and backend are independently lintable, type-checkable, testable, and deployable. Neither imports from the other's source tree. The only contract between them is the OpenAPI schema.

---

## 3. Universal Code Rules

### 3.1 SOLID, applied concretely

| Principle | What it means here |
|---|---|
| **S**ingle Responsibility | A module has one reason to change. A route handler handles HTTP. A service handles business rules. A repository handles persistence. A component renders. None of them do two of these. |
| **O**pen/Closed | Extend behaviour by adding a new implementation or a new injected dependency — not by adding another `if` branch to a growing conditional. |
| **L**iskov Substitution | Any implementation of an interface/protocol must be usable wherever the interface is expected, without the caller special-casing it. |
| **I**nterface Segregation | Depend on the narrowest type you need. A function that reads a user takes `UserReader`, not `Database`. A component takes `{ title, href }`, not the whole `Article`. |
| **D**ependency Inversion | High-level code depends on abstractions. Services receive a repository via constructor/DI; they never import `engine` or `sessionmaker` directly. |

### 3.2 File size and shape — hard limits

These are enforced, not aspirational. If you cross a limit, **split the file as part of the same change**.

| Unit | Soft limit | Hard limit |
|---|---|---|
| Any source file | 200 lines | **300 lines** |
| Function / method | 30 lines | **50 lines** |
| React component | 120 lines | **180 lines** |
| Function parameters | 3 | **5** (past that, take an object/model) |
| Cyclomatic complexity | 8 | **10** |
| Nesting depth | 2 | **3** |

How to split when you hit a limit:

- **A route file is too big** → move business logic into a service; the route keeps only parsing, dependency wiring, and the response.
- **A service is too big** → split by use case (`user/service/registration.py`, `user/service/profile.py`), not by "helpers".
- **A component is too big** → extract the leaf presentational pieces first, then extract state into a hook. Do not extract a "misc" component.
- **A `utils.py` / `utils.ts` is growing** → it is a bucket, not a module. Split by domain: `text.py`, `dates.py`, `pagination.py`.

Files named `helpers`, `misc`, `common`, `shared`, `stuff`, or `index` containing logic are forbidden. Barrel `index.ts` files that only re-export are permitted but discouraged — they defeat tree-shaking and create import cycles.

### 3.3 Naming

- Names state intent, not implementation: `activeSubscribers`, not `filteredList2`.
- Booleans read as predicates: `isActive`, `hasAccess`, `canPublish`, `shouldRetry`.
- Functions are verb phrases: `calculateInvoiceTotal`, not `invoiceTotal`.
- No abbreviations except the universally understood (`id`, `url`, `db`, `api`, `http`).
- Python: `snake_case` for everything except classes (`PascalCase`) and constants (`UPPER_SNAKE`).
- TypeScript: `camelCase` for values, `PascalCase` for types/components, `UPPER_SNAKE` for module constants.
- Files: `kebab-case.ts` in the frontend, `snake_case.py` in the backend. Be consistent with whatever the repo already does.

### 3.4 Absolute prohibitions

- ❌ `any` in TypeScript. Use `unknown` + a narrowing guard, or write the type.
- ❌ `# type: ignore` / `@ts-ignore` without an adjacent comment explaining why and a linked issue.
- ❌ Bare `except:` or `except Exception:` that swallows. Catch the narrowest exception; re-raise or log with context.
- ❌ `console.log` / `print` in committed code. Use the logger.
- ❌ Magic numbers and magic strings. Name them, or use an `Enum` / `as const`.
- ❌ Commented-out code. Git remembers.
- ❌ Mutating a function argument.
- ❌ Secrets, tokens, connection strings, or real customer data in source, tests, or fixtures.
- ❌ Business logic in a route handler, a React component, or a database migration.
- ❌ Circular imports. If you need one, your layering is wrong.

### 3.5 Comments

Comment **why**, never **what**. If a line needs a comment to explain what it does, rename things until it doesn't.

```python
# ❌
# increment the counter
counter += 1

# ✅
# Stripe rate-limits at 100 req/s per account; we back off at 80 to leave
# headroom for the webhook retries that share this key. See INFRA-412.
if counter >= 80:
    await asyncio.sleep(backoff)
```

Every public function, class, and module gets a docstring/TSDoc: one-line summary, then args/returns/raises when non-obvious.

---

## 4. Backend — FastAPI

### 4.1 Folder structure (domain-driven)

Start flat. Move to domain packages the moment a second business domain appears. Do **not** organise by technical type at the top level (`all_models/`, `all_routers/`) — that forces every feature change to touch every folder.

```
backend/
├── pyproject.toml                # deps, ruff, mypy, pytest config, [tool.fastapi]
├── uv.lock
├── alembic.ini
├── .env.example                  # every var, no real values — COMMIT THIS
├── alembic/
│   └── versions/
├── src/
│   └── app/
│       ├── main.py               # FastAPI() instance, lifespan, middleware, routers. <100 lines
│       ├── api/
│       │   ├── router.py         # aggregates domain routers under /api/v1
│       │   └── deps.py           # shared dependency type aliases
│       ├── core/
│       │   ├── config.py         # pydantic-settings Settings
│       │   ├── security.py       # hashing, JWT encode/decode — no HTTP, no DB
│       │   ├── logging.py        # structured logging setup
│       │   └── exceptions.py     # domain exception base classes
│       ├── db/
│       │   ├── base.py           # DeclarativeBase + naming convention
│       │   ├── session.py        # DuckDB engine + sessionmaker (sync)
│       │   └── mixins.py         # TimestampMixin, UUIDMixin
│       ├── domains/
│       │   ├── users/
│       │   │   ├── router.py     # HTTP only
│       │   │   ├── schemas.py    # Pydantic v2 — the wire contract
│       │   │   ├── models.py     # SQLAlchemy ORM — the storage contract
│       │   │   ├── repository.py # all queries for this domain
│       │   │   ├── service.py    # business rules, transactions
│       │   │   ├── deps.py       # domain-specific dependencies
│       │   │   └── exceptions.py # UserNotFoundError, EmailAlreadyUsedError
│       │   └── orders/
│       │       └── ...same shape...
│       └── worker/               # background jobs, if any
└── tests/
    ├── conftest.py               # engine, session, client, factory fixtures
    ├── unit/                     # services with mocked repositories
    └── integration/              # real DuckDB (temp file), real ASGI transport
```

**Layering — strictly one direction:**

```
router → service → repository → model
   ↓        ↓
schemas  domain exceptions
```

- A **router** never touches `Session` directly and never writes a query.
- A **service** never imports `fastapi` and never raises `HTTPException`. It raises domain exceptions.
- A **repository** never contains business rules and never commits — the service owns the transaction boundary.
- An **ORM model** never leaves the repository/service layer. Routers return Pydantic schemas.

### 4.2 Non-negotiable FastAPI patterns

**Use `Annotated` for every parameter and dependency.** No exceptions.

```python
from typing import Annotated
from fastapi import APIRouter, Depends, Path, Query, status

router = APIRouter(prefix="/users", tags=["users"])  # prefix and tags HERE, not in include_router


@router.get("/{user_id}", response_model=UserPublic, status_code=status.HTTP_200_OK)
def get_user(                                   # def, not async def — DuckDB I/O blocks (§6.0)
    user_id: Annotated[UUID, Path(description="User identifier")],
    service: UserServiceDep,
) -> UserPublic:
    user = service.get_by_id(user_id)
    return UserPublic.model_validate(user)
```

**Declare dependencies as reusable type aliases** in `deps.py` — never repeat `Depends(...)` inline across files:

```python
# app/api/deps.py
from typing import Annotated
from fastapi import Depends
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.db.session import get_session

SessionDep = Annotated[Session, Depends(get_session)]
SettingsDep = Annotated[Settings, Depends(get_settings)]

# app/domains/users/deps.py
def get_user_service(session: SessionDep) -> UserService:
    return UserService(UserRepository(session))

UserServiceDep = Annotated[UserService, Depends(get_user_service)]
CurrentUserDep = Annotated[User, Depends(get_current_user)]
```

**Always annotate the return type.** FastAPI uses it for validation, serialisation, response filtering, and OpenAPI. It is also what stops a password hash leaking into a response. Use `response_model=` only when the returned object's type genuinely differs from the declared contract.

**`async def` vs `def` — this stack leans on `def`.**

- **Every endpoint that touches the database is `def`, not `async def`.** DuckDB's driver is synchronous; FastAPI runs `def` handlers in a threadpool, so a blocking query costs one worker thread instead of stalling the entire event loop.
- `async def` **only** when the body genuinely `await`s something — an outbound HTTP call with `httpx.AsyncClient`, a message queue, `asyncio.sleep`.
- **Never** call DuckDB (or any blocking code) from inside `async def`. It freezes the loop and destroys throughput for every concurrent request. If you are already inside an async handler and cannot avoid it: `await anyio.to_thread.run_sync(blocking_fn, arg)`.
- Do not mix: a `def` route calling a `def` service calling a `def` repository is the correct, boring shape here. Resist the urge to sprinkle `async` because it looks modern.
- Tune the threadpool to match DuckDB's write model (§6.0) — the default 40 threads will produce write conflicts on a write-heavy table.

**One function per HTTP operation.** No `if request.method == ...` branching.

**Explicitly forbidden:**

- ❌ `...` (Ellipsis) as the default for a required parameter — just omit the default.
- ❌ `ORJSONResponse` / `UJSONResponse` — deprecated; declare the return type and let Pydantic serialise.
- ❌ Pydantic `RootModel` — use `Annotated` with validation utilities.
- ❌ `@app.on_event("startup")` / `("shutdown")` — use `lifespan`.
- ❌ Raising `HTTPException` from a service or repository.
- ❌ A global module-level `Session`, engine, or client used implicitly instead of injected.

**App assembly:**

```python
# app/main.py
from contextlib import asynccontextmanager
from collections.abc import AsyncIterator

from fastapi import FastAPI

from app.api.router import api_router
from app.core.config import get_settings


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    # acquire pools, warm caches
    yield
    # dispose engines, close clients


settings = get_settings()

app = FastAPI(
    title=settings.project_name,
    version=settings.version,
    openapi_url=f"{settings.api_prefix}/openapi.json" if settings.debug else None,
    docs_url="/docs" if settings.debug else None,
    lifespan=lifespan,
)

app.include_router(api_router)
```

**Run it with the FastAPI CLI**, configured in `pyproject.toml`:

```toml
[tool.fastapi]
app = "app.main:app"
```

```bash
fastapi dev          # local, auto-reload
fastapi run          # production (Uvicorn under the hood)
```

**⚠️ Worker count is constrained by DuckDB, not by CPU.** A DuckDB file opened read-write is locked to **one process**. Running `--workers 4` against the same database file will fail to start or corrupt your assumptions about who holds the write lock.

```bash
# ✅ Single writer process. Scale with threads, not processes.
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1 --proxy-headers
```

To scale beyond one process you must change the storage topology, not the worker flag — see §6.0. **Never** `--reload` in production. Never put a DuckDB file on NFS or a shared network mount; its file locking is unreliable across hosts and operating systems.

### 4.3 Errors — domain exceptions, translated at the edge

Business layers raise domain exceptions. Only `main.py` knows about HTTP status codes.

```python
# app/core/exceptions.py
class AppError(Exception):
    """Base for all domain errors."""


class NotFoundError(AppError): ...
class ConflictError(AppError): ...
class PermissionDeniedError(AppError): ...


# app/domains/users/exceptions.py
from app.core.exceptions import ConflictError, NotFoundError


class UserNotFoundError(NotFoundError):
    def __init__(self, user_id: UUID) -> None:
        super().__init__(f"User {user_id} not found")
        self.user_id = user_id


class EmailAlreadyUsedError(ConflictError): ...


# app/main.py
from fastapi import Request
from fastapi.responses import JSONResponse

_STATUS_MAP = {
    NotFoundError: 404,
    ConflictError: 409,
    PermissionDeniedError: 403,
}


@app.exception_handler(AppError)
async def handle_app_error(request: Request, exc: AppError) -> JSONResponse:
    status_code = next(
        (code for type_, code in _STATUS_MAP.items() if isinstance(exc, type_)),
        500,
    )
    return JSONResponse(
        status_code=status_code,
        content={"detail": str(exc), "type": exc.__class__.__name__},
    )
```

Error responses have one stable shape across the whole API. Never leak a stack trace, SQL string, or internal path to a client.

---

## 5. Backend — Pydantic v2

**v2 API only.** These v1 names are gone; using them is a bug:

| ❌ v1 | ✅ v2 |
|---|---|
| `class Config:` | `model_config = ConfigDict(...)` |
| `orm_mode = True` | `from_attributes=True` |
| `@validator` | `@field_validator` |
| `@root_validator` | `@model_validator` |
| `.dict()` | `.model_dump()` |
| `.json()` | `.model_dump_json()` |
| `parse_obj()` | `model_validate()` |
| `schema()` | `model_json_schema()` |
| `BaseSettings` from `pydantic` | `BaseSettings` from `pydantic_settings` |

**Schema-per-purpose.** Never reuse one model for input and output — that is how write-only fields leak.

```python
# app/domains/users/schemas.py
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class UserBase(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=1, max_length=120)


class UserCreate(UserBase):
    """Request body for POST /users."""
    password: str = Field(min_length=12, max_length=128, examples=["S3cure-Passphrase!"])

    @field_validator("password")
    @classmethod
    def password_must_be_mixed(cls, v: str) -> str:
        if v.isalpha() or v.isdigit():
            raise ValueError("password must mix letters, digits and symbols")
        return v


class UserUpdate(BaseModel):
    """PATCH — every field optional; use exclude_unset to distinguish null from absent."""
    full_name: str | None = Field(default=None, min_length=1, max_length=120)


class UserPublic(UserBase):
    """Response body. Contains no secrets, by construction."""
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    created_at: datetime
```

Rules:

- Every field is typed and constrained (`min_length`, `ge`, `max_length`, `pattern`). Validation at the boundary is free correctness.
- Use `Field(examples=[...])` and `description=` — they become your OpenAPI docs.
- Response models are separate classes with `from_attributes=True`. `UserPublic` cannot leak `hashed_password` because it does not have the field.
- For partial updates: `payload.model_dump(exclude_unset=True)`.
- Prefer `TypeAdapter` for validating bare lists/dicts over `RootModel`.
- `model_config = ConfigDict(extra="forbid")` on request models when unknown fields should be rejected.

**Settings — one `Settings` object, loaded once, injected.**

```python
# app/core/config.py
from functools import lru_cache
from typing import Literal

from pathlib import Path

from pydantic import SecretStr, computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    project_name: str = "API"
    version: str = "0.1.0"
    environment: Literal["local", "staging", "production"] = "local"
    api_prefix: str = "/api/v1"

    database_path: Path = Path("data/app.duckdb")
    duckdb_memory_limit: str = "2GB"
    duckdb_threads: int = 4
    secret_key: SecretStr
    access_token_ttl_minutes: int = 15
    refresh_token_ttl_days: int = 30
    cors_origins: list[str] = []

    @computed_field
    @property
    def debug(self) -> bool:
        return self.environment == "local"

    @computed_field
    @property
    def database_url(self) -> str:
        """duckdb:///relative.db — note the four slashes for an absolute path."""
        return f"duckdb:///{self.database_path}"


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]  # values come from env
```

`os.getenv` anywhere outside `config.py` is forbidden. Secrets are `SecretStr` and are read with `.get_secret_value()` only at the point of use. Every variable appears in `.env.example` with a placeholder; `.env` is gitignored.

---

## 6. Backend — DuckDB + SQLAlchemy 2.0

### 6.0 Know what you are running — read this first

DuckDB is an **embedded, columnar, analytical (OLAP) database**. It is not a drop-in Postgres. Five properties dictate the design of everything below, and violating any of them produces failures that only appear under load:

| Property | Consequence for this codebase |
|---|---|
| **No async driver** | All DB code is synchronous. Routes/services/repositories that touch the DB are `def`, not `async def` (§4.2). There is no `create_async_engine`, no `AsyncSession`, no `await session.commit()`. |
| **One read-write process** | `--workers 1`. You scale with threads inside one process, not with more processes. Two processes opening the same file read-write will conflict on the file lock. |
| **Optimistic concurrency, not row locks** | Appends never conflict. Two threads updating the *same row* → the loser raises a transaction-conflict error. You must **retry**, not assume success. |
| **Columnar and analytical** | Excellent at scans, aggregates, joins over large tables. Comparatively poor at high-rate single-row `UPDATE`/`DELETE`. Batch writes; never write one row per request in a hot loop. |
| **Limited `ALTER TABLE`** | Schema changes are more constrained than Postgres. Expand → backfill → contract is mandatory, not merely good practice (§6.6). |

**Honest assessment, stated once so nobody is surprised later:** the auth/session/user tables in this app are an OLTP workload, which is the workload DuckDB is least suited to. It works, and for a single-node app with modest write volume it works well. But if write concurrency grows, the constraint you will hit is the single-writer process — not CPU, not memory. Plan for that rather than discovering it. **Do not silently swap in another database to "fix" it** — that is a §0 change requiring explicit approval.

**Scaling paths, when one process is no longer enough** (all require explicit approval before adoption):

- **MotherDuck** — managed, cloud-hosted DuckDB; the dialect supports it via a `md:` URL.
- **DuckLake** — DuckDB storage with an external catalog, allowing coordinated multi-instance read-write.
- **Quack protocol** — DuckDB-as-a-server over the network. Beta as of 1.5.x; stabilising in the 2.0 line. Do not build on it without a deliberate decision.
- **Split the workload** — an OLTP store for users/sessions, DuckDB for analytics. This is the conventional answer and usually the right one.

**Version discipline:** DuckDB's on-disk storage format has changed across releases. Pin the `duckdb` version in `uv.lock` and **never bump it as a side effect of another task** (§0, rule 4). A storage-format change requires an explicit, tested migration of the database file.

### 6.1 Dialect and dependencies

Install the SQLAlchemy dialect explicitly — SQLAlchemy has no built-in DuckDB support:

```toml
# pyproject.toml
dependencies = [
  "duckdb",
  "duckdb-engine",   # registers the `duckdb://` dialect
  "sqlalchemy>=2.0",
  "alembic",
]
```

> `duckdb-engine` (module `duckdb_engine`) is the established dialect. `duckdb-sqlalchemy` is a newer fork with production-oriented pool defaults and MotherDuck helpers. **Use whichever is already in the lockfile.** Switching between them is a dependency change and needs approval.

### 6.2 Declarative base and models

Use the SQLAlchemy 2.0 declarative typed API. The 1.x `Query` API and untyped `Column` declarations are legacy — do not write new code with them.

```python
# app/db/base.py
from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import MetaData, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    """Deterministic constraint names keep Alembic autogenerate stable."""
    metadata = MetaData(naming_convention=NAMING_CONVENTION)


class UUIDMixin:
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), onupdate=func.now()
    )
```

```python
# app/domains/users/models.py
from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDMixin


class User(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(320), unique=True)
    full_name: Mapped[str] = mapped_column(String(120))
    hashed_password: Mapped[str] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(default=True)

    orders: Mapped[list["Order"]] = relationship(
        back_populates="user",
        lazy="raise",  # forces explicit eager loading; kills N+1
        cascade="all, delete-orphan",
    )
```

**DuckDB-specific model rules:**

- **UUID primary keys, always.** DuckDB does not support the `SERIAL` type. Auto-increment requires an explicit `Sequence()`, which serialises writes and becomes a contention point. `uuid4()` generated in Python sidesteps both problems — which is why `UUIDMixin` above is written that way.
- **Do not add `index=True` reflexively.** DuckDB is columnar: it uses zonemaps (min/max per row group) to skip data on range and equality filters, so a secondary index buys little and costs write throughput. DuckDB's real indexes (ART) exist mainly to enforce `PRIMARY KEY` and `UNIQUE` — which `unique=True` already creates. Add an explicit index only when you have measured a query that needs it.
- **Sort order beats indexing.** Physical clustering is the lever that matters here. If a table is nearly always filtered by `created_at`, insert in that order so zonemaps prune effectively.
- **`lazy="raise"` on every relationship.** An implicit lazy load inside a threadpool request is an N+1 that will not show up until production data volume. This turns it into a test failure instead. Load deliberately with `selectinload()` / `joinedload()`.
- Keep `cascade="all, delete-orphan"` ORM-side. DuckDB's foreign-key enforcement is more limited than Postgres — do not rely on the database to cascade for you.

### 6.3 Engine, session, and write conflicts

```python
# app/db/session.py
from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings

settings = get_settings()

engine = create_engine(
    settings.database_url,                      # duckdb:///data/app.duckdb
    connect_args={
        "config": {
            "memory_limit": settings.duckdb_memory_limit,
            "threads": settings.duckdb_threads,
        },
    },
    # DuckDB connections are cheap and share one embedded database. Keep the pool
    # small and deterministic; a large pool buys nothing and multiplies write conflicts.
    pool_size=5,
    max_overflow=0,
    pool_pre_ping=False,        # no network to lose — this is a no-op cost
    echo=False,
)

SessionFactory = sessionmaker(engine, expire_on_commit=False, class_=Session)


def get_session() -> Iterator[Session]:
    """One session per request. Rolls back on any exception."""
    with SessionFactory() as session:
        try:
            yield session
        except Exception:
            session.rollback()
            raise
```

Notes that are easy to get wrong:

- `expire_on_commit=False` — without it, attribute access after commit fires a fresh `SELECT` per attribute. On a columnar engine that is a full re-read.
- **`:memory:` is not one database.** Each new connection to `duckdb:///:memory:` gets its own empty database. For in-memory use (tests, §10) you must force a single shared connection with `poolclass=StaticPool` — otherwise your tables vanish between statements and you will waste an hour on it.
- Pass DuckDB settings through `connect_args={"config": {...}}`, not as URL query parameters.
- Cap `memory_limit`. DuckDB will happily consume the box on a large aggregate and get the container OOM-killed.

**Write conflicts are a normal, expected outcome — handle them.** Under a threadpool, two requests updating the same row will collide:

```python
# app/db/retry.py
import logging
from collections.abc import Callable
from typing import TypeVar

from sqlalchemy.exc import OperationalError

logger = logging.getLogger(__name__)
T = TypeVar("T")
_MAX_ATTEMPTS = 3


def with_write_retry(operation: Callable[[], T]) -> T:
    """Retry a unit of work that lost DuckDB's optimistic-concurrency race.

    DuckDB detects write-write conflicts at commit time rather than blocking on a
    row lock, so the loser must redo the work. Only conflict errors are retried;
    everything else propagates untouched.
    """
    for attempt in range(1, _MAX_ATTEMPTS + 1):
        try:
            return operation()
        except OperationalError as exc:
            if "conflict" not in str(exc).lower() or attempt == _MAX_ATTEMPTS:
                raise
            logger.warning("write conflict, retrying (%d/%d)", attempt, _MAX_ATTEMPTS)
    raise AssertionError("unreachable")
```

Wrap **every** write path that can be concurrently reached for the same row. Retries must be idempotent — the operation re-runs from the start, so never place a side effect (email, webhook, payment) inside the retried block.

### 6.4 Repository and service

**Repository — queries only, no commits:**

```python
# app/domains/users/repository.py
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session, load_only, selectinload

from app.domains.users.models import User


class UserRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def get_by_id(self, user_id: UUID, *, with_orders: bool = False) -> User | None:
        stmt = select(User).where(User.id == user_id)
        if with_orders:
            stmt = stmt.options(selectinload(User.orders))
        return self._session.scalar(stmt)

    def get_by_email(self, email: str) -> User | None:
        return self._session.scalar(select(User).where(User.email == email))

    def list_active(self, *, limit: int, offset: int) -> list[User]:
        stmt = (
            select(User)
            # Columnar storage: naming the columns means the other columns are
            # never read off disk. On a wide table this is the difference.
            .options(load_only(User.id, User.email, User.full_name, User.created_at))
            .where(User.is_active.is_(True))
            .order_by(User.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        return list(self._session.scalars(stmt))

    def add(self, user: User) -> None:
        """Stage only. The service owns the transaction."""
        self._session.add(user)

    def add_many(self, users: list[User]) -> None:
        """Prefer one bulk write over N single-row writes — see §6.4."""
        self._session.add_all(users)
```

**Service — business rules and the transaction boundary:**

```python
# app/domains/users/service.py
class UserService:
    """Owns business rules and the transaction boundary.

    The session is injected alongside the repository so the service can commit
    across several repositories without any of them knowing about each other.
    """

    def __init__(self, session: Session, repository: UserRepository) -> None:
        self._session = session
        self._repository = repository

    def register(self, payload: UserCreate) -> User:
        def _work() -> User:
            if self._repository.get_by_email(payload.email) is not None:
                raise EmailAlreadyUsedError(payload.email)

            user = User(
                email=payload.email,
                full_name=payload.full_name,
                hashed_password=hash_password(payload.password),
            )
            self._repository.add(user)
            self._session.commit()
            self._session.refresh(user)
            return user

        # Retried on write conflict; contains no side effects, so replay is safe.
        return with_write_retry(_work)


# app/domains/users/deps.py
def get_user_service(session: SessionDep) -> UserService:
    return UserService(session, UserRepository(session))
```

### 6.5 Query and write rules

- Always paginate list endpoints. `limit` is capped server-side (default 20, max 100). Never `select(Model)` unbounded.
- Never build SQL by string interpolation. Use SQLAlchemy constructs or bound parameters; `text()` with `:params` only when unavoidable.
- **Name your columns.** `.options(load_only(...))` on a columnar engine means unneeded columns are never read from disk. `SELECT *` on a wide table is far more expensive here than on a row store.
- **Do not add indexes by reflex** (§6.2). Zonemaps handle range and equality pruning; measure before adding.
- **Batch writes.** One `add_all()` + one commit beats a loop of N commits by orders of magnitude. Never commit inside a loop.
- **Every write path that can be reached concurrently for the same row is wrapped in `with_write_retry`** (§6.3), and the retried block is free of external side effects.
- One transaction per request, owned by the service. Never commit from a repository or a route.
- Long analytical reads and writes fight each other in one process. Push heavy reporting queries to a read-only connection (`connect_args={"read_only": True}`) against a snapshot, or run them off-peak.
- DuckDB's SQL is Postgres-flavoured but not Postgres. Before using a window function, a `ON CONFLICT` clause, an extension, or an exotic type, confirm it exists in the pinned DuckDB version. Do not assume from Postgres knowledge.

### 6.6 Alembic on DuckDB

Alembic works, but it needs the dialect registered and it is more constrained than on Postgres. Register the impl once, in `alembic/env.py`:

```python
# alembic/env.py
from alembic.ddl.impl import DefaultImpl


class AlembicDuckDBImpl(DefaultImpl):
    """Teach Alembic about the duckdb dialect so autogenerate/upgrade work."""

    __dialect__ = "duckdb"
```

Rules:

- Every model change ships with a migration in the same commit. `alembic revision --autogenerate -m "add users.is_active"`, then **read and edit the generated file** — autogenerate misses type changes, server defaults, and index renames, and it is less reliable on DuckDB than on Postgres.
- **Always run the migration against a copy of a realistic database before committing it.** DuckDB's `ALTER TABLE` support is narrower than Postgres: some column-type changes, constraint changes, and drops are unsupported and need a create-new-table → copy → swap rewrite. Autogenerate will not warn you; the deploy will.
- Expand → backfill → contract, as three separate deploys, is **mandatory** here, not merely preferred — a single-writer database has no room for a long blocking rewrite.
- Migrations are forward-only in production. Write `downgrade()` anyway.
- Never edit an already-applied migration; add a new one.
- Destructive migrations require the explicit approval described in §0.
- Migrations contain no business logic and no imports from `app.domains.*` (models change; migrations must not).
- **Back up the database file before every production migration.** It is a single file — `cp` is a complete, atomic-enough backup while the app is stopped. There is no `pg_dump` safety net and no point-in-time recovery.

---

## 7. Frontend — Next.js 16 (App Router)

### 7.1 Folder structure

```
frontend/
├── next.config.ts
├── tsconfig.json
├── eslint.config.mjs             # flat config — .eslintrc is dead
├── package.json
├── proxy.ts                      # NOT middleware.ts (see §7.3)
├── public/
└── src/
    ├── app/                      # routing ONLY — no business logic lives here
    │   ├── layout.tsx
    │   ├── page.tsx
    │   ├── error.tsx
    │   ├── not-found.tsx
    │   ├── loading.tsx
    │   ├── (marketing)/          # route groups for layout, not for URL segments
    │   ├── (dashboard)/
    │   │   └── users/
    │   │       ├── page.tsx      # composition only — target under 80 lines
    │   │       ├── loading.tsx
    │   │       ├── error.tsx
    │   │       └── [id]/
    │   │           ├── page.tsx
    │   │           └── default.tsx  # REQUIRED for every parallel-route slot
    │   └── api/
    │       └── health/route.ts
    ├── components/
    │   ├── ui/                   # primitives: Button, Input, Dialog. Zero domain knowledge.
    │   └── layout/               # Header, Sidebar, Footer
    ├── features/                 # ← the important one: vertical slices by domain
    │   └── users/
    │       ├── components/       # UserTable.tsx, UserForm.tsx
    │       ├── hooks/            # use-user-filters.ts
    │       ├── actions.ts        # 'use server' Server Actions
    │       ├── api.ts            # typed fetch wrappers to the FastAPI backend
    │       ├── schemas.ts        # zod schemas, mirroring the backend contract
    │       └── types.ts
    ├── lib/
    │   ├── api-client.ts         # base fetch: baseURL, auth header, error mapping
    │   ├── env.ts                # validated env — see §7.6
    │   └── utils/                # cn.ts, format-date.ts — one concern per file
    ├── hooks/                    # genuinely app-wide hooks only
    ├── types/
    └── styles/
```

`src/app/` is a routing manifest. A `page.tsx` imports from `features/` and composes; it does not contain data-shaping logic, form state, or business rules. A component used by exactly one feature lives in that feature — promote to `components/` only on the **third** consumer.

### 7.2 Server vs Client Components

**Server Components are the default. `'use client'` is an opt-in you must justify.**

Add `'use client'` only when the component needs: `useState`/`useReducer`, `useEffect`, an event handler, a browser-only API, or a class component.

Push `'use client'` to the **leaves**. A client boundary on a layout makes the whole subtree client-rendered.

```tsx
// ❌ Whole page becomes a Client Component for one button
'use client';
export default function Page() {
  const [open, setOpen] = useState(false);
  return <><Heavy data={...} /><button onClick={() => setOpen(true)}>Open</button></>;
}

// ✅ Server page, one small client leaf
export default async function Page() {
  const data = await getData();
  return <><Heavy data={data} /><OpenDialogButton /></>;
}
```

Pass **serialisable plain data** across the boundary — never a class instance, a Date-heavy object graph, or a function (other than a Server Action).

### 7.3 Next.js 16 — what changed. Get these right.

| Area | Rule |
|---|---|
| **Async request APIs** | `params`, `searchParams`, `cookies()`, `headers()`, `draftMode()` are **Promises**. Synchronous access was removed in 16. Always `await`. |
| **Typed route props** | Run `next typegen`; use the generated `PageProps<'/users/[id]'>`, `LayoutProps<...>`, `RouteContext<...>` helpers instead of hand-written prop types. |
| **`middleware` → `proxy`** | The file is `proxy.ts` and the export is `proxy`. Runtime is Node.js and is not configurable. Config flags renamed too (`skipMiddlewareUrlNormalize` → `skipProxyUrlNormalize`). |
| **Turbopack** | Default for `next dev` and `next build`. Remove `--turbopack` flags. `experimental.turbopack` moved to top-level `turbopack`. A custom `webpack` config now fails the build unless you pass `--webpack`. |
| **`next lint` removed** | Run ESLint (flat config) or Biome directly. `next build` no longer lints — CI must. |
| **Caching** | `revalidateTag(tag, profile)` now requires a `cacheLife` profile. Use `updateTag(tag)` in Server Actions for read-your-writes. `refresh()` refreshes the client router. `cacheLife`/`cacheTag` are stable — drop the `unstable_` prefix. |
| **PPR** | `experimental.ppr` and `experimental_ppr` are gone. `experimental.dynamicIO` and `experimental.useCache` are gone. The successor is top-level `cacheComponents: true` — **do not enable it on an existing app without an explicit instruction**; it surfaces build errors for uncached data outside `<Suspense>`. |
| **Runtime config** | `serverRuntimeConfig` / `publicRuntimeConfig` removed. Use env vars; `await connection()` before reading `process.env` when the value must be read at runtime, not baked in at build. |
| **Parallel routes** | Every slot requires an explicit `default.tsx` or the build fails. |
| **`next/image`** | `images.domains` is deprecated → `remotePatterns`. Defaults changed: `qualities` is now `[75]`, `minimumCacheTTL` is 4h, `16` was dropped from `imageSizes`, redirects cap at 3, local IPs are blocked. Local images with query strings need `images.localPatterns.search`. `next/legacy/image` is deprecated. |
| **Removed** | AMP (`next/amp`, `amp` config), `unstable_rootParams` (→ `next/root-params`), some `devIndicators` options. |
| **Requirements** | Node.js ≥ 20.9, TypeScript ≥ 5.1, React 19.2. |

**16.3 additions you may use** (verify they exist in the installed version first): `next/root-params` for accessing root-level params like `[lang]` from any Server Component without prop drilling; `catchError` from `next/error` for error boundaries with a `retry()` that re-runs failed Server Components; `import.meta.glob` in Turbopack; `partialPrefetching` and `prefetchInlining` config; TypeScript 7 for `next build` type checking.

```tsx
// ✅ Next.js 16 page
export default async function UserPage(props: PageProps<'/users/[id]'>) {
  const { id } = await props.params;
  const { tab } = await props.searchParams;
  const user = await getUser(id);
  return <UserDetail user={user} activeTab={tab} />;
}
```

```ts
// ✅ proxy.ts (was middleware.ts)
import { NextResponse, type NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const token = request.cookies.get('session')?.value;
  if (!token && request.nextUrl.pathname.startsWith('/dashboard')) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ['/dashboard/:path*'] };
```

### 7.4 Data fetching and mutations

- Fetch in Server Components with `async`/`await`. Do not add a client-side data library for data the server can render.
- Fetch in **parallel**: `const [a, b] = await Promise.all([getA(), getB()])`. Sequential `await`s are waterfalls.
- Stream slow sections with `<Suspense fallback={...}>` rather than blocking the whole page.
- Mutations go through **Server Actions** (`'use server'`), validated with zod on the server. Never trust client input.
- Route Handlers (`app/api/*/route.ts`) exist for webhooks, health checks, and third-party callbacks — not as a proxy layer in front of your own FastAPI backend.

```ts
// src/features/users/actions.ts
'use server';

import { revalidateTag, updateTag } from 'next/cache';
import { z } from 'zod';

const UpdateUserSchema = z.object({
  id: z.string().uuid(),
  fullName: z.string().min(1).max(120),
});

export async function updateUser(formData: FormData) {
  const parsed = UpdateUserSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false as const, errors: parsed.error.flatten().fieldErrors };
  }

  await apiClient.patch(`/users/${parsed.data.id}`, { full_name: parsed.data.fullName });

  updateTag(`user-${parsed.data.id}`);   // read-your-writes: user sees the change now
  revalidateTag('users', 'max');          // list can be stale-while-revalidate
  return { ok: true as const };
}
```

Every Server Action re-checks authentication and authorisation. A Server Action is a public HTTP endpoint — treat it exactly like one.

### 7.5 TypeScript

`tsconfig.json` must have:

```jsonc
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "verbatimModuleSyntax": true,
    "paths": { "@/*": ["./src/*"] }
  }
}
```

- `any` is banned (§3.4). `unknown` + narrowing, or write the type.
- Use `import type { ... }` for type-only imports.
- Prefer discriminated unions over optional-field soup:
  `type Result<T> = { status: 'ok'; data: T } | { status: 'error'; message: string }`
- Derive, don't duplicate: `type User = z.infer<typeof UserSchema>`.
- Use `satisfies` to keep literal inference while checking a shape.
- Backend response types come from the OpenAPI schema (`openapi-typescript`) or from zod schemas that mirror it — hand-written duplicates drift.
- Use `@/...` path aliases. Deep relative imports (`../../../`) are a layering smell.

### 7.6 Environment variables

```ts
// src/lib/env.ts
import { z } from 'zod';

const serverSchema = z.object({
  API_BASE_URL: z.string().url(),
  SESSION_SECRET: z.string().min(32),
});

const clientSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url(),
});

export const serverEnv = serverSchema.parse(process.env); // throws at boot, not at 3am
export const clientEnv = clientSchema.parse({
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
});
```

- **Only** `NEXT_PUBLIC_*` reaches the browser. Anything else is server-only — a secret without that prefix that gets imported into a Client Component is a leak.
- Put `import 'server-only'` at the top of any module that must never be bundled for the client.
- Reference `process.env.X` statically, never `process.env[dynamicKey]` — it breaks inlining.
- Every variable appears in `.env.example`. `.env*` is gitignored except `.env.example`.

### 7.7 Rendering and performance

- `next/image` for every image — with explicit `width`/`height` or `fill` + a sized container, to avoid layout shift. Configure `remotePatterns` (not `domains`).
- `next/font` for fonts. No `<link>` to Google Fonts.
- `next/dynamic` for heavy client-only widgets (charts, editors, maps).
- Add `loading.tsx` and `error.tsx` per route segment. Next.js 16.3's Instant Insights devtool will tell you which navigations are not instant — treat those as bugs.
- No `useEffect` for data fetching in a component the server could render.
- Keys in lists are stable IDs, never array indices.

### 7.8 Accessibility (non-negotiable)

Semantic elements (`<button>`, `<nav>`, `<main>`), every input has a `<label>`, every image has meaningful `alt` (or `alt=""` when decorative), focus is visible and never trapped, all interactive elements are keyboard-reachable, colour contrast meets WCAG AA. `eslint-plugin-jsx-a11y` runs in CI.

---

## 8. Auth & Security

### 8.1 Passwords and tokens

```python
# app/core/security.py
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
from pwdlib import PasswordHash

from app.core.config import get_settings

_hasher = PasswordHash.recommended()   # Argon2 — requires pwdlib[argon2]
_settings = get_settings()
ALGORITHM = "HS256"


def hash_password(plain: str) -> str:
    return _hasher.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return _hasher.verify(plain, hashed)


def create_access_token(subject: str, *, scopes: list[str] | None = None) -> str:
    now = datetime.now(UTC)
    payload: dict[str, Any] = {
        "sub": subject,
        "iat": now,
        "exp": now + timedelta(minutes=_settings.access_token_ttl_minutes),
        "typ": "access",
        "scopes": scopes or [],
    }
    return jwt.encode(payload, _settings.secret_key.get_secret_value(), algorithm=ALGORITHM)
```

- Hash with **Argon2id** (`pwdlib`) or bcrypt. Never MD5/SHA-family, never unsalted, never home-rolled.
- Access tokens are short-lived (≤15 min). Refresh tokens are long-lived, **stored server-side (hashed), rotated on every use, and revocable**. Reuse of a rotated refresh token invalidates the whole family.
- Always verify `exp`, `iat`, and the algorithm on decode. Never accept `alg: none`. Never decode without verification.
- Refresh tokens live in `HttpOnly; Secure; SameSite=Lax` cookies, not `localStorage`.
- Compare secrets with `secrets.compare_digest`, never `==`.

### 8.2 Authorisation

- Authenticate **and** authorise on every protected endpoint. A valid token proves *who*, not *what they may do*.
- Ownership checks live in the service layer, not the router — so they cannot be bypassed by a new caller.
- Deny by default. New endpoints are protected unless explicitly marked public.
- Return `404` rather than `403` when revealing existence is itself a leak.
- Never trust a client-supplied `user_id`, `role`, `is_admin`, or `tenant_id`. Derive identity from the verified token only.

```python
def get_current_user(                      # def — it queries DuckDB (§6.0)
    token: Annotated[str, Depends(oauth2_scheme)],
    session: SessionDep,
) -> User:
    try:
        payload = jwt.decode(
            token, settings.secret_key.get_secret_value(), algorithms=[ALGORITHM]
        )
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail="Not authenticated") from exc

    user = UserRepository(session).get_by_id(UUID(payload["sub"]))
    if user is None or not user.is_active:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user
```

> A `def` dependency runs in the threadpool, same as a `def` route. Mixing an `async def` dependency with a `def` route is legal but means the auth query would run on the event loop — don't.

### 8.3 Transport, CORS, and headers

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,   # explicit list, from config
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)
```

- `allow_origins=["*"]` together with `allow_credentials=True` is invalid and insecure. Never write it.
- Add `TrustedHostMiddleware` in production. HTTPS only; HSTS at the edge.
- Set `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, and a CSP. In Next.js, set these in `next.config.ts` `headers()`.
- Disable `/docs`, `/redoc`, and `/openapi.json` in production unless deliberately public.

### 8.4 Input, output, and rate limiting

- **Validate every input** with Pydantic (backend) and zod (Server Actions / route handlers). Client-side validation is UX, never a security control.
- Cap request body size, upload size, page size, and array lengths.
- Rate-limit auth endpoints (login, register, password reset, token refresh) with a shared store (Redis), not in-process memory.
- Return generic auth failures — "Invalid credentials", never "user not found" vs "wrong password". Keep response timing uniform.
- SQL injection: only SQLAlchemy constructs or bound parameters (§6). **This matters more on DuckDB than on a server database.** DuckDB runs in-process and can read and write the local filesystem and remote URLs: an injected `COPY ... TO '/path'`, `read_csv('...')`, or `INSTALL`/`LOAD` is not just a data breach, it is arbitrary file access as the API process. Never interpolate user input into SQL, ever, under any deadline.
- Never expose a raw-SQL endpoint, a "run this query" admin feature, or a user-supplied `ORDER BY`/table name — validate against an allowlist of known columns instead.
- Do not `INSTALL`/`LOAD` DuckDB extensions at runtime based on any input. Load the fixed set you need at startup, in `lifespan`.
- **The database is one file.** Its filesystem permissions are the last line of defence: owned by the app user, mode `600`, stored outside the web root and outside any mounted static directory. Back it up encrypted — that single file contains every password hash you have.
- SSRF: never fetch a user-supplied URL without an allowlist. `images.remotePatterns` is an allowlist — keep it tight, and leave `dangerouslyAllowLocalIP` off.
- XSS: never `dangerouslySetInnerHTML` with untrusted content; sanitise if you must render HTML.
- Log auth events (login, logout, failure, permission denied, role change) with actor, action, and timestamp. **Never log tokens, passwords, full card numbers, or PII.**

---

## 9. Quality Gates

Every change must pass all of these locally before you report completion. Non-negotiable.

```bash
# ---- Frontend ----
cd frontend
pnpm lint                 # eslint . --max-warnings=0   (flat config)
pnpm typecheck            # tsc --noEmit
pnpm test                 # vitest run
pnpm build                # next build  — must succeed

# ---- Backend ----
cd backend
uv run ruff format --check .
uv run ruff check .       # must be clean, zero warnings
uv run mypy src           # strict
uv run pytest -q --cov=src --cov-report=term-missing
```

Recommended config:

```toml
# backend/pyproject.toml
[tool.ruff]
line-length = 100
target-version = "py312"

[tool.ruff.lint]
select = ["E", "W", "F", "I", "N", "UP", "B", "A", "C4", "SIM", "TCH", "RUF", "S", "ASYNC"]
ignore = ["S101"]  # assert is fine in tests

[tool.mypy]
python_version = "3.12"
strict = true
warn_unreachable = true
disallow_untyped_defs = true
plugins = ["pydantic.mypy"]

[tool.pytest.ini_options]
asyncio_mode = "auto"
addopts = "-ra --strict-markers"
```

**Rules about the gates themselves:**

- Never weaken a rule to make the gate pass. Fix the code.
- Never add a blanket `# noqa`, `# type: ignore`, or `eslint-disable` file header. Narrow, line-level, with a reason.
- Never commit with a failing test. If an existing test fails and your change is correct, explain why the test's expectation was wrong and ask before editing it.
- Run pre-commit hooks; do not `--no-verify`.

---

## 10. Testing

```
Unit          — services with mocked repositories. Fast, no DB, no network.
Integration   — real DuckDB (temp file or shared in-memory), real ASGI transport via httpx.
E2E           — Playwright against the running stack, happy paths + auth flows.
```

**DuckDB makes integration tests cheap** — no container, no daemon, no fixture port juggling. Take advantage of it: prefer a real database over a mock whenever the code under test writes SQL.

```python
# tests/conftest.py
from collections.abc import Iterator

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base


@pytest.fixture
def engine(tmp_path) -> Iterator:
    """A real, disposable DuckDB per test.

    Use a temp FILE rather than ':memory:' when the test exercises anything
    connection-scoped. If you do want in-memory, StaticPool is mandatory:
    every fresh connection to ':memory:' is a DIFFERENT empty database, so
    without it your tables disappear between statements.
    """
    engine = create_engine(
        f"duckdb:///{tmp_path / 'test.duckdb'}",
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    yield engine
    engine.dispose()


@pytest.fixture
def session(engine) -> Iterator[Session]:
    factory = sessionmaker(engine, expire_on_commit=False, class_=Session)
    with factory() as session:
        yield session
        session.rollback()
```

```python
# tests/integration/test_users_api.py
import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.mark.anyio
async def test_register_rejects_duplicate_email(session, existing_user):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/users",
            json={"email": existing_user.email, "full_name": "X", "password": "S3cure-Pass!"},
        )
    assert response.status_code == 409
    assert response.json()["type"] == "EmailAlreadyUsedError"
```

Rules:

- One behaviour per test. The name states the behaviour: `test_register_rejects_duplicate_email`.
- Arrange–Act–Assert, visually separated.
- Override dependencies with `app.dependency_overrides` — never monkey-patch module globals.
- Tests are independent and order-agnostic. Each gets a clean transaction, rolled back after.
- Test behaviour through the public interface, not private methods.
- Every bug fix ships with a regression test that fails before the fix.
- Cover the error paths, not just the happy path. Coverage floor: 80% on `src/`, 100% on `core/security.py`.
- **Cover the write-conflict path.** Any code wrapped in `with_write_retry` needs a test that forces a conflict and asserts the retry succeeded and did not duplicate a side effect. Untested retry logic is worse than none.

Frontend: Vitest + React Testing Library. Query by role and accessible name (`getByRole('button', { name: /save/i })`), never by class or test-id-as-crutch. Test what the user sees, not implementation details.

---

## 11. Git & Delivery

- Conventional Commits: `feat(users): add email verification`, `fix(auth): reject expired refresh tokens`, `refactor(orders): extract pricing service`.
- One logical change per commit. A refactor and a feature never share a commit.
- `BREAKING CHANGE:` in the footer — and per §0, you do not create one without approval.
- PR description states: what changed, why, what could break, how it was verified.
- Never commit `.env`, credentials, `node_modules/`, `__pycache__/`, `.next/`, or `dist/`.
- **Never commit `*.duckdb`, `*.duckdb.wal`, or anything under `data/`.** The database file is not source. Gitignore it; it will otherwise land in a PR full of real user data.
- Never force-push a shared branch.
- Migrations, model changes, and the code that uses them ship together.

---

## 12. Agent Working Protocol

Follow this loop for every task.

1. **Read before writing.** Locate the existing pattern for what you are about to build (a sibling domain, a sibling feature folder). Match it. Consistency with the codebase outranks your preference.
2. **Verify versions** (§1) and read the version-matched docs for any API you are unsure about.
3. **State the plan** in 3–6 bullets before editing: files you will touch, files you will create, what you will not touch. If the plan requires anything from §0, stop and ask.
4. **Implement the smallest correct change.** No opportunistic refactors. No renaming things you happen to dislike. No adding dependencies.
5. **Respect the limits** in §3.2 as you go — split the file in the same change, not "later".
6. **Run every gate** in §9. All green.
7. **Read your own diff** (`git diff`) line by line before reporting. Any file in the diff you cannot justify is a bug — revert it.
8. **Report**: what changed, why, which consumers could be affected, what you verified, what you could not verify, and anything you deliberately left alone.

**Stop and ask the user when:**

- The task requires a §0 change.
- Two files disagree about the existing pattern and there is no clear winner.
- A test fails for a reason unrelated to your change.
- The correct behaviour is genuinely ambiguous from the code and the request.
- You would need a new dependency, a new env var, a credential, or an infra change.
- You have attempted the same fix twice and it still fails. Do not loop — report.

**Never:**

- Claim something is done that you did not verify.
- Silently skip part of the request. If you skipped it, say so and say why.
- Fabricate an API, a config option, or a version. If you are not certain it exists in the installed version, look it up or say you don't know.
- Delete failing tests, loosen a type, or disable a lint rule to turn a gate green.

---

## 13. Quick Reference

**Backend layering**

```
router (HTTP)  →  service (rules, transactions)  →  repository (queries)  →  model (storage)
   ↑ schemas                ↑ domain exceptions
```

**Frontend layering**

```
app/ (routes, composition)  →  features/ (domain slices)  →  components/ui + lib/
```

**Never leaves its layer:** SQLAlchemy models out of the service layer · `HTTPException` out of the router · `'use client'` above a leaf · `os.getenv` out of `config.py` · secrets out of the server.

**DuckDB, in one box:**

```
def, not async def       — no async driver; FastAPI threadpools def handlers
--workers 1              — one read-write process, period
with_write_retry(...)    — optimistic concurrency; the loser must retry
load_only(...)           — columnar: name your columns, skip the rest
no reflexive index=True  — zonemaps already prune; measure first
add_all() + one commit   — never commit in a loop
back up the file         — one file, no pg_dump, no PITR
```

**Before you say "done":** lint ✓ types ✓ tests ✓ build ✓ diff reviewed ✓ nothing from §0 touched ✓