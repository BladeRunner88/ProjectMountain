"""Storage contract for the context engine's field-binding rules.

A source field the pipeline could not map to an ontology property is left unbound rather
than guessed at. Binding it is a human judgement, and this is where that judgement is
kept.
"""

from datetime import datetime

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDMixin

_ID = 120
_SHORT = 120
_LONG = 4000


class ContextRuleOverride(UUIDMixin, TimestampMixin, Base):
    """One human-authored binding from a source field to an ontology property."""

    __tablename__ = "context_rule_overrides"

    # Which feed the field arrived in — the same field name means different things in
    # `qc_inline.csv` and `qc_lab.csv`, which is the entire reason the pair exists.
    source_file: Mapped[str] = mapped_column(String(_SHORT))
    source_field: Mapped[str] = mapped_column(String(_SHORT))
    # Ontology target, e.g. "Machine.commissioned_at".
    target_property: Mapped[str] = mapped_column(String(_ID))
    # Optional value transform the binding applies: "celsius_to_fahrenheit", "trim", ...
    transform: Mapped[str | None] = mapped_column(String(_SHORT))
    active: Mapped[bool] = mapped_column(default=True)
    bound_by: Mapped[str] = mapped_column(String(_SHORT))
    bound_at: Mapped[datetime]
    note: Mapped[str | None] = mapped_column(String(_LONG))
