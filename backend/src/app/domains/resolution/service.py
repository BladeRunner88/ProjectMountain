"""Resolution rules: building candidate pairs, scoring them, and measuring the result."""

from datetime import UTC, datetime
from itertools import combinations

from sqlalchemy.orm import Session

from app.core.pagination import LimitOffset
from app.db.retry import with_write_retry
from app.domains.resolution.exceptions import CandidatePairNotFoundError
from app.domains.resolution.models import GroundTruthLabel, ResolutionWeightOverride
from app.domains.resolution.repository import (
    CandidatePairRepository,
    GroundTruthRepository,
    WeightRepository,
)
from app.domains.resolution.schemas import (
    CandidatePair,
    LabelPayload,
    PairSide,
    ResolutionMetrics,
    WeightPayload,
    WeightRecord,
)
from app.domains.resolution.similarity import jaro_similarity

DEFAULT_AUTO_MERGE = 0.92
DEFAULT_REJECT = 0.70


def pair_id(left_id: str, right_id: str) -> str:
    """A stable id for a pair, derived from its two source ids.

    Sorted, so the same two records produce the same id whichever order they are read
    in — otherwise a label filed once would fail to match the pair on the next request.
    """
    first, second = sorted((left_id, right_id))
    return f"{first}::{second}"


class ResolutionService:
    def __init__(
        self,
        session: Session,
        pairs: CandidatePairRepository,
        labels: GroundTruthRepository,
        weights: WeightRepository,
    ) -> None:
        self._session = session
        self._pairs = pairs
        self._labels = labels
        self._weights = weights

    def list_pairs(
        self, *, object_type: str | None, unlabelled_only: bool, page: LimitOffset
    ) -> tuple[list[CandidatePair], int]:
        pairs = self._all_pairs(object_type)
        if unlabelled_only:
            pairs = [pair for pair in pairs if pair.label is None]
        # Lowest score first: the least similar pair the resolver merged anyway is the
        # one most likely to be wrong, and therefore the one worth a person's time.
        pairs.sort(key=lambda pair: pair.score)
        window = pairs[page.offset : page.offset + page.limit]
        return window, len(pairs)

    def get_pair(self, identifier: str) -> CandidatePair:
        for pair in self._all_pairs(None):
            if pair.id == identifier:
                return pair
        raise CandidatePairNotFoundError(identifier)

    def label_pair(self, identifier: str, payload: LabelPayload) -> CandidatePair:
        """Record a human verdict on one pair.

        The pair is resolved first, outside the retried block, so a label can never be
        filed against a pair the warehouse does not have.
        """
        pair = self.get_pair(identifier)
        labelled_at = datetime.now(UTC)

        def _persist() -> None:
            self._labels.add(
                GroundTruthLabel(
                    left_id=pair.left.source_id,
                    right_id=pair.right.source_id,
                    label=payload.label,
                    labelled_by=payload.labelled_by,
                    labelled_at=labelled_at,
                    score_at_labelling=pair.score,
                    note=payload.note,
                )
            )
            self._session.commit()

        # Safe to replay: a fresh row from arguments fixed outside the block.
        with_write_retry(_persist)
        return self.get_pair(identifier)

    def metrics(self, *, auto_merge: float, reject: float) -> ResolutionMetrics:
        """Precision and recall over the pairs a human has judged, at given thresholds.

        The thresholds are arguments rather than stored state so the UI slider can
        recompute without persisting a decision nobody has made yet.
        """
        pairs = self._all_pairs(None)
        labelled = [pair for pair in pairs if pair.label is not None and pair.label != "unsure"]

        true_positives = sum(1 for p in labelled if p.score >= auto_merge and p.label == "match")
        false_positives = sum(
            1 for p in labelled if p.score >= auto_merge and p.label == "not-match"
        )
        true_negatives = sum(1 for p in labelled if p.score < reject and p.label == "not-match")
        false_negatives = sum(1 for p in labelled if p.score < reject and p.label == "match")

        merged = true_positives + false_positives
        actual_matches = sum(1 for p in labelled if p.label == "match")
        return ResolutionMetrics(
            auto_merge_threshold=auto_merge,
            reject_threshold=reject,
            labelled_pairs=len(labelled),
            total_pairs=len(pairs),
            true_positives=true_positives,
            false_positives=false_positives,
            true_negatives=true_negatives,
            false_negatives=false_negatives,
            precision=true_positives / merged if merged else None,
            recall=true_positives / actual_matches if actual_matches else None,
            needs_review=sum(1 for p in pairs if reject <= p.score < auto_merge),
        )

    def weights(self) -> list[WeightRecord]:
        return [_to_weight_record(weight) for weight in self._weights.active()]

    def set_weight(self, payload: WeightPayload) -> WeightRecord:
        set_at = datetime.now(UTC)

        def _persist() -> ResolutionWeightOverride:
            self._weights.deactivate(payload.field)
            weight = ResolutionWeightOverride(
                field=payload.field,
                weight=payload.weight,
                set_by=payload.set_by,
                set_at=set_at,
                note=payload.note,
            )
            self._weights.add(weight)
            self._session.commit()
            return weight

        # Safe to replay: the deactivate is idempotent, the insert is rebuilt from
        # arguments fixed outside the block.
        return _to_weight_record(with_write_retry(_persist))

    def _all_pairs(self, object_type: str | None) -> list[CandidatePair]:
        """Every reviewable merge, scored, with any human verdict attached."""
        labels = self._labels.latest_by_pair()
        pairs: list[CandidatePair] = []
        for group in self._pairs.resolved_groups(object_type):
            # Every combination within the group, not just consecutive ones: three
            # records merged into one entity is three decisions, and skipping the
            # first-to-third would hide the least similar of them.
            for left, right in combinations(group.records, 2):
                pairs.append(
                    self._to_pair(group.canonical_id, group.object_type, left, right, labels)
                )
        return pairs

    def _to_pair(
        self,
        canonical_id: str,
        object_type: str,
        left: tuple[str, str, str],
        right: tuple[str, str, str],
        labels: dict[tuple[str, str], GroundTruthLabel],
    ) -> CandidatePair:
        label = labels.get((left[0], right[0])) or labels.get((right[0], left[0]))
        return CandidatePair(
            id=pair_id(left[0], right[0]),
            object_type=object_type,
            canonical_id=canonical_id,
            left=PairSide(source_id=left[0], source_table=left[1], raw_name=left[2]),
            right=PairSide(source_id=right[0], source_table=right[1], raw_name=right[2]),
            score=round(jaro_similarity(left[2], right[2]), 6),
            label=label.label if label else None,
            labelled_by=label.labelled_by if label else None,
            labelled_at=_stamp(label.labelled_at) if label else None,
        )


def _to_weight_record(weight: ResolutionWeightOverride) -> WeightRecord:
    return WeightRecord(
        id=str(weight.id),
        field=weight.field,
        weight=weight.weight,
        active=weight.active,
        set_by=weight.set_by,
        set_at=_stamp(weight.set_at),
        note=weight.note,
    )


def _stamp(moment: datetime) -> str:
    """Naive-UTC ISO with a trailing Z, matching every other timestamp on the wire."""
    return moment.astimezone(UTC).replace(tzinfo=None).isoformat() + "Z"
