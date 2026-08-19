"""Meaning rules: what each source field was understood to mean, and what was left alone."""

from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.db.retry import with_write_retry
from app.domains.meaning.exceptions import UnknownSourceFieldError
from app.domains.meaning.models import ContextRuleOverride
from app.domains.meaning.repository import BindingRepository, RawFieldRepository
from app.domains.meaning.schemas import (
    BindingPayload,
    BindingRecord,
    CoverageSummary,
    FieldBinding,
    SourceCoverage,
)
from app.domains.sources.catalog import FIELD_MAPPINGS

PIPELINE = "pipeline"
HUMAN = "human"


class MeaningService:
    def __init__(
        self,
        session: Session,
        fields: RawFieldRepository,
        bindings: BindingRepository,
    ) -> None:
        self._session = session
        self._fields = fields
        self._bindings = bindings

    def list_bindings(self, *, source_file: str | None, unbound_only: bool) -> list[FieldBinding]:
        """Every source field, bound or not.

        Unbound fields are listed rather than omitted — they are the whole point of the
        surface. A list of only what was understood cannot show what was missed.
        """
        overrides = self._bindings.active()
        listed: list[FieldBinding] = []
        for source, columns in self._fields.fields_by_source().items():
            if source_file and source != source_file:
                continue
            for column in columns:
                listed.append(_binding_for(source, column, overrides))
        if unbound_only:
            return [field for field in listed if field.target_property is None]
        return listed

    def coverage(self) -> CoverageSummary:
        overrides = self._bindings.active()
        sources: list[SourceCoverage] = []
        total = 0
        bound_total = 0
        for source, columns in self._fields.fields_by_source().items():
            unbound = [
                column
                for column in columns
                if _binding_for(source, column, overrides).target_property is None
            ]
            bound = len(columns) - len(unbound)
            total += len(columns)
            bound_total += bound
            sources.append(
                SourceCoverage(
                    source_file=source,
                    total_fields=len(columns),
                    bound_fields=bound,
                    unbound_fields=len(unbound),
                    coverage_pct=round(100 * bound / len(columns), 1) if columns else 0.0,
                    unbound=unbound,
                )
            )
        return CoverageSummary(sources=sources, total_fields=total, bound_fields=bound_total)

    def bind(self, payload: BindingPayload) -> BindingRecord:
        """Bind a source field to an ontology property.

        The field is checked against what actually arrived, outside the retried block: a
        binding for a column no feed ever delivered would sit in the table forever,
        claiming coverage of something that does not exist.
        """
        known = self._fields.fields_by_source().get(payload.source_file, [])
        if payload.source_field not in known:
            raise UnknownSourceFieldError(payload.source_file, payload.source_field)

        bound_at = datetime.now(UTC)

        def _persist() -> ContextRuleOverride:
            self._bindings.deactivate(payload.source_file, payload.source_field)
            binding = ContextRuleOverride(
                source_file=payload.source_file,
                source_field=payload.source_field,
                target_property=payload.target_property,
                transform=payload.transform,
                bound_by=payload.bound_by,
                bound_at=bound_at,
                note=payload.note,
            )
            self._bindings.add(binding)
            self._session.commit()
            return binding

        # Safe to replay: the deactivate is idempotent, the insert is rebuilt from
        # arguments fixed outside the block.
        return _to_record(with_write_retry(_persist))


def _binding_for(
    source_file: str,
    source_field: str,
    overrides: dict[tuple[str, str], ContextRuleOverride],
) -> FieldBinding:
    """What one field means, preferring a human binding over the built-in manifest."""
    override = overrides.get((source_file, source_field))
    if override is not None:
        return FieldBinding(
            source_file=source_file,
            source_field=source_field,
            target_property=override.target_property,
            transform=override.transform,
            bound_by_kind=HUMAN,
            bound_by=override.bound_by,
            bound_at=_stamp(override.bound_at),
        )
    return FieldBinding(
        source_file=source_file,
        source_field=source_field,
        target_property=FIELD_MAPPINGS.get(source_file, {}).get(source_field),
        transform=None,
        bound_by_kind=PIPELINE,
        bound_by=None,
        bound_at=None,
    )


def _to_record(binding: ContextRuleOverride) -> BindingRecord:
    return BindingRecord(
        id=str(binding.id),
        source_file=binding.source_file,
        source_field=binding.source_field,
        target_property=binding.target_property,
        transform=binding.transform,
        active=binding.active,
        bound_by=binding.bound_by,
        bound_at=_stamp(binding.bound_at),
        note=binding.note,
    )


def _stamp(moment: datetime) -> str:
    """Naive-UTC ISO with a trailing Z, matching every other timestamp on the wire."""
    return moment.astimezone(UTC).replace(tzinfo=None).isoformat() + "Z"
