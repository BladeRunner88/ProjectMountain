"""Every ORM model, imported so `Base.metadata` is complete.

Alembic autogenerate only sees tables that have been imported. Without one module that
pulls them all in, a new model silently produces an empty migration.
"""

from app.db.base import Base
from app.domains.access.models import AccessRequest
from app.domains.detection.models import DetectionRuleOverride
from app.domains.findings.models import FindingReview
from app.domains.meaning.models import ContextRuleOverride
from app.domains.pipeline_status.models import PipelineRun
from app.domains.resolution.models import GroundTruthLabel, ResolutionWeightOverride
from app.domains.revision.models import RevisionAuditEntry, RevisionQueueItem

__all__ = [
    "AccessRequest",
    "Base",
    "ContextRuleOverride",
    "DetectionRuleOverride",
    "FindingReview",
    "GroundTruthLabel",
    "PipelineRun",
    "ResolutionWeightOverride",
    "RevisionAuditEntry",
    "RevisionQueueItem",
]
