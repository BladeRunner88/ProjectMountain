"""The statistics the findings engine uses, isolated so they can be tested alone."""

import math
import statistics
from itertools import pairwise


def z_score(value: float, population: list[float]) -> float | None:
    """How many standard deviations `value` sits from the population mean.

    None when the population cannot support the question — fewer than two points, or no
    spread at all. Returning 0.0 there would claim "perfectly normal" about data that
    says nothing.
    """
    if len(population) < 2:
        return None
    spread = statistics.pstdev(population)
    if spread == 0:
        return None
    return (value - statistics.mean(population)) / spread


def two_proportion_z(
    successes_a: int, total_a: int, successes_b: int, total_b: int
) -> float | None:
    """Test whether two observed rates differ by more than sampling noise.

    Used to compare one window's release rate against the rest of the period. None when
    either sample is empty or the pooled rate is degenerate.
    """
    if total_a == 0 or total_b == 0:
        return None

    rate_a = successes_a / total_a
    rate_b = successes_b / total_b
    pooled = (successes_a + successes_b) / (total_a + total_b)
    if pooled in (0.0, 1.0):
        return None

    standard_error = math.sqrt(pooled * (1 - pooled) * (1 / total_a + 1 / total_b))
    if standard_error == 0:
        return None
    return (rate_a - rate_b) / standard_error


def median_gap_minutes(sorted_minutes: list[float]) -> float | None:
    """Typical spacing between consecutive observations."""
    if len(sorted_minutes) < 2:
        return None
    return statistics.median(later - earlier for earlier, later in pairwise(sorted_minutes))
