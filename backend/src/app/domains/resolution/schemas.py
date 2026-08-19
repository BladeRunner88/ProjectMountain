"""Wire contract for entity resolution."""

from typing import Literal

from pydantic import BaseModel, Field

_SHORT = 120
_LONG = 4000

Label = Literal["match", "not-match", "unsure"]


class PairSide(BaseModel):
    """One source record in a candidate pair."""

    source_id: str
    source_table: str
    raw_name: str


class CandidatePair(BaseModel):
    """Two source records the resolver decided describe the same thing.

    `id` is derived from the two source ids rather than stored, so it survives the
    pipeline re-minting its candidate list on the next run — which a row id would not.
    """

    id: str
    object_type: str
    canonical_id: str
    left: PairSide
    right: PairSide
    score: float = Field(description="Jaro similarity of the two raw names")
    # None until a human has judged it. That is the honest state, and it is what
    # separates a measured accuracy number from the resolver grading its own homework.
    label: Label | None
    labelled_by: str | None
    labelled_at: str | None


class LabelPayload(BaseModel):
    """A human verdict on one candidate pair."""

    label: Label
    labelled_by: str = Field(min_length=1, max_length=_SHORT)
    note: str | None = Field(default=None, max_length=_LONG)


class WeightPayload(BaseModel):
    """A scoring weight an analyst set for one matching field."""

    field: str = Field(min_length=1, max_length=_SHORT)
    weight: float = Field(ge=0.0, le=1.0)
    set_by: str = Field(min_length=1, max_length=_SHORT)
    note: str | None = Field(default=None, max_length=_LONG)


class WeightRecord(BaseModel):
    """A stored weight, as read back."""

    id: str
    field: str
    weight: float
    active: bool
    set_by: str
    set_at: str
    note: str | None


class ResolutionMetrics(BaseModel):
    """How the resolver scores against the pairs a human has actually judged.

    Every count here is over LABELLED pairs only. An unlabelled pair is not evidence in
    either direction, and folding it in as a silent success is exactly how a resolution
    surface ends up reporting 99% accuracy it never measured.
    """

    auto_merge_threshold: float
    reject_threshold: float
    labelled_pairs: int
    total_pairs: int
    true_positives: int
    false_positives: int
    true_negatives: int
    false_negatives: int
    # None rather than 0.0 when the denominator is empty: "no data" and "nothing correct"
    # are different answers, and only one of them means the resolver is broken.
    precision: float | None
    recall: float | None
    # Pairs that fall between the two thresholds — neither merged nor rejected, waiting
    # on a person. The queue this surface exists to shrink.
    needs_review: int
