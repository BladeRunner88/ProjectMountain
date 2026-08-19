"""Router assembly.

Every domain router is registered exactly once, here. `api_router` mounts them under the
configured prefix; `app.api.legacy` mounts the same objects unprefixed. One
implementation, two paths, no drift.
"""

from fastapi import APIRouter

from app.core.config import get_settings
from app.domains.access.router import router as access_router
from app.domains.correlate.router import router as correlate_router
from app.domains.detection.override_router import router as detection_tuning_router
from app.domains.detection.router import router as detection_router
from app.domains.findings.review_router import router as finding_review_router
from app.domains.findings.router import router as findings_router
from app.domains.graph.router import graph_router, objects_router
from app.domains.health.router import router as health_router
from app.domains.hierarchy.router import router as hierarchy_router
from app.domains.lineage.router import router as lineage_router
from app.domains.meaning.router import router as meaning_router
from app.domains.metrics.router import router as metrics_router
from app.domains.ontology.router import router as ontology_router
from app.domains.pipeline_status.router import pipeline_router, stats_router
from app.domains.resolution.router import router as resolution_router
from app.domains.revision.router import router as revision_router
from app.domains.search.router import router as search_router
from app.domains.sources.router import connectors_router, sources_router
from app.domains.telemetry.router import router as telemetry_router

DOMAIN_ROUTERS: tuple[APIRouter, ...] = (
    health_router,
    access_router,
    connectors_router,
    sources_router,
    stats_router,
    pipeline_router,
    findings_router,
    metrics_router,
    correlate_router,
    objects_router,
    graph_router,
    search_router,
    lineage_router,
    ontology_router,
    telemetry_router,
    hierarchy_router,
    detection_router,
)


# Write endpoints added in Phase 6. Kept out of DOMAIN_ROUTERS deliberately: that tuple
# is also mounted unprefixed by `app.api.legacy`, and the legacy surface exists only to
# keep the pre-migration frontend working. Nothing new should ever appear on it.
VERSIONED_ONLY_ROUTERS: tuple[APIRouter, ...] = (
    finding_review_router,
    detection_tuning_router,
    revision_router,
    resolution_router,
    meaning_router,
)


def build_api_router() -> APIRouter:
    """The documented, versioned surface."""
    router = APIRouter(prefix=get_settings().api_prefix)
    for domain_router in (*DOMAIN_ROUTERS, *VERSIONED_ONLY_ROUTERS):
        router.include_router(domain_router)
    return router
