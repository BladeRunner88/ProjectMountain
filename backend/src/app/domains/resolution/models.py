"""Storage contract for tuning entity resolution and scoring it.

Two tables that answer two different questions: what weights is the resolver currently
using, and how well did those weights do against pairs a human has judged.
"""

from datetime import datetime

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDMixin

_ID = 120
_SHORT = 120
_LONG = 4000


class ResolutionWeightOverride(UUIDMixin, TimestampMixin, Base):
    """A per-field scoring weight a human set, overriding the pipeline default.

    Append-only with `active`, rather than UPDATE-in-place: the whole point of the
    tuning surface is being able to say which weights produced a given metric, and an
    overwritten row cannot answer that.
    """

    __tablename__ = "resolution_weight_overrides"

    # The matching field the weight applies to: name | asset_tag | historian_tag | ...
    field: Mapped[str] = mapped_column(String(_SHORT))
    weight: Mapped[float]
    # Only one row per field is active; the rest are the history of that field.
    active: Mapped[bool] = mapped_column(default=True)
    set_by: Mapped[str] = mapped_column(String(_SHORT))
    set_at: Mapped[datetime]
    note: Mapped[str | None] = mapped_column(String(_LONG))


class GroundTruthLabel(UUIDMixin, TimestampMixin, Base):
    """A human verdict on one candidate pair — the only real precision/recall input.

    Without these, every accuracy number the resolution surface shows is the resolver
    grading its own homework.
    """

    __tablename__ = "ground_truth_labels"

    # The candidate pair, stored as the two entity ids rather than a pair id, so a label
    # survives the pipeline re-minting its candidate list on the next run.
    left_id: Mapped[str] = mapped_column(String(_ID))
    right_id: Mapped[str] = mapped_column(String(_ID))
    # "match" | "not-match" | "unsure"
    label: Mapped[str] = mapped_column(String(_SHORT))
    labelled_by: Mapped[str] = mapped_column(String(_SHORT))
    labelled_at: Mapped[datetime]
    # What the resolver scored this pair when the label was given. Kept so calibration
    # can be recomputed for the weights in force at the time.
    score_at_labelling: Mapped[float | None]
    note: Mapped[str | None] = mapped_column(String(_LONG))
