"""Vendor sources, exposed two ways.

One domain, two HTTP surfaces: /sources is the manifest (who owns what, how fields were
mapped) and /connectors is the same feeds seen operationally (are they healthy right now).
They read the same table, so they share a repository rather than duplicating the query.
"""

from fastapi import APIRouter, status

from app.domains.sources.deps import SourceServiceDep
from app.domains.sources.schemas import ConnectorStatus, SourceSummary

sources_router = APIRouter(prefix="/sources", tags=["sources"])
connectors_router = APIRouter(prefix="/connectors", tags=["connectors"])


@sources_router.get("", status_code=status.HTTP_200_OK)
def list_sources(service: SourceServiceDep) -> list[SourceSummary]:
    """Every configured vendor feed, with its owner, format and field mapping."""
    return service.list_sources()


@connectors_router.get("", status_code=status.HTTP_200_OK)
def list_connectors(service: SourceServiceDep) -> list[ConnectorStatus]:
    """Every vendor feed's current connection health, with a reason when it is not green."""
    return service.list_connectors()
