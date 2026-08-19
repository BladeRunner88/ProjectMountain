"""Shared dependency type aliases. Never repeat `Depends(...)` inline across files."""

from typing import Annotated

from fastapi import Depends, Query
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.pagination import DEFAULT_LIMIT, MAX_LIMIT, LimitOffset
from app.db.session import get_app_session, get_warehouse_session

SessionDep = Annotated[Session, Depends(get_app_session)]
WarehouseSessionDep = Annotated[Session, Depends(get_warehouse_session)]
SettingsDep = Annotated[Settings, Depends(get_settings)]


def get_pagination(
    limit: Annotated[int, Query(ge=1, le=MAX_LIMIT)] = DEFAULT_LIMIT,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> LimitOffset:
    """Parse and cap pagination arguments (AGENTS.md 6.5)."""
    return LimitOffset(limit=limit, offset=offset)


PaginationDep = Annotated[LimitOffset, Depends(get_pagination)]
