"""Unprefixed mount of the same domain routers.

The frontend's route handlers still call the original root paths (`/findings`, `/graph`,
...). Serving both here means the prefix migration is a one-file change on the frontend
rather than a flag day, and there is no second implementation to drift.

Hidden from the schema so `/docs` documents one surface, and every response carries a
`Deprecation` header so a client can see it is on the old path.
"""

from fastapi import APIRouter, Depends, Response

from app.api.router import DOMAIN_ROUTERS


def _mark_deprecated(response: Response) -> None:
    """RFC 8594 signal that this path will be removed."""
    response.headers["Deprecation"] = "true"


def build_legacy_router() -> APIRouter:
    router = APIRouter(dependencies=[Depends(_mark_deprecated)])
    for domain_router in DOMAIN_ROUTERS:
        router.include_router(domain_router, include_in_schema=False)
    return router
