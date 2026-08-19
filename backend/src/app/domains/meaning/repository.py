"""Meaning persistence.

The field inventory comes from the warehouse's own raw tables — the columns that actually
arrived, not a list somebody maintains by hand. The bindings come from the API-owned
database.
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.warehouse.clean_tables import source_fields
from app.domains.meaning.models import ContextRuleOverride

# Written by the pipeline onto every row, so they are provenance rather than fields the
# vendor sent. Counting them would inflate coverage with columns we produced ourselves.
PIPELINE_COLUMNS = frozenset({"source_file", "department"})


class RawFieldRepository:
    """Reads the field inventory the pipeline recorded from the vendor files.

    Not from `raw.*` columns: those are the loader's names rather than the vendor's (the
    SCADA loader reads `<tag>` and stores `tag_masked`), and only two of the six feeds
    have a raw table at all, so four would report no fields at all.
    """

    def __init__(self, session: Session) -> None:
        self._session = session

    def fields_by_source(self) -> dict[str, list[str]]:
        """Source file -> the field names that arrived in it."""
        rows = self._session.execute(
            select(source_fields.c.source_file, source_fields.c.source_field).order_by(
                source_fields.c.source_file, source_fields.c.source_field
            )
        )
        fields: dict[str, list[str]] = {}
        for source_file, source_field in rows:
            if source_field in PIPELINE_COLUMNS:
                continue
            fields.setdefault(source_file, []).append(source_field)
        return fields


class BindingRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def add(self, binding: ContextRuleOverride) -> None:
        """Stage only. The service commits."""
        self._session.add(binding)

    def active(self) -> dict[tuple[str, str], ContextRuleOverride]:
        """Every binding in force, keyed by (source file, source field)."""
        statement = (
            select(ContextRuleOverride)
            .where(ContextRuleOverride.active.is_(True))
            .order_by(ContextRuleOverride.bound_at)
        )
        return {
            (binding.source_file, binding.source_field): binding
            for binding in self._session.scalars(statement)
        }

    def deactivate(self, source_file: str, source_field: str) -> None:
        """Retire whatever binding is in force for one field. Stages only."""
        statement = select(ContextRuleOverride).where(
            ContextRuleOverride.source_file == source_file,
            ContextRuleOverride.source_field == source_field,
            ContextRuleOverride.active.is_(True),
        )
        for binding in self._session.scalars(statement):
            binding.active = False
