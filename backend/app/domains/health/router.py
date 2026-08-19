"""Liveness and readiness.

No APIRouter prefix here: /check and /health are two distinct top-level paths that the
frontend and any load balancer address directly, so a shared prefix would rename both.
"""

from fastapi import APIRouter, status

from app.domains.health.deps import HealthServiceDep
from app.domains.health.schemas import CheckResponse, HealthResponse

router = APIRouter(tags=["health"])


@router.get("/check", status_code=status.HTTP_200_OK)
def check() -> CheckResponse:
    """Liveness ping.

    Takes no session dependency on purpose — it opens no DuckDB connection and runs no
    query, so it still answers while the database is missing or mid-rebuild. /health is
    the readiness counterpart.
    """
    return CheckResponse(status="ok")


@router.get("/health", status_code=status.HTTP_200_OK)
def health(service: HealthServiceDep) -> HealthResponse:
    """Readiness: entity, relationship, source and event counts plus the sync rate."""
    return service.readiness()
