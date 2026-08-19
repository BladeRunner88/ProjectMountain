"""Jaro, pinned against the frontend implementation it has to agree with.

Every expected value below was produced by calling
`features/ase/services/entityResolution.ts` directly, not computed by hand -- the point
of the test is agreement with that function, so a hand-derived number would only pin
this port against my own arithmetic. If one of these drifts, the two halves of the
resolution screen will disagree about the same pair.
"""

import pytest

from app.domains.resolution.similarity import jaro_similarity


@pytest.mark.parametrize(
    ("left", "right", "expected"),
    [
        ("", "", 1.0),
        ("PRESS-07", "PRESS-07", 1.0),
        ("PRESS-07", "press-07", 1.0),
        ("", "PRESS-07", 0.0),
        ("abcd", "wxyz", 0.0),
        # The textbook cases, which any correct Jaro reproduces exactly.
        ("martha", "marhta", 0.9444444444444445),
        ("dixon", "dicksonx", 0.7666666666666666),
        ("crate", "trace", 0.7333333333333334),
        # Shaped like the data it actually runs on.
        ("Bosch Rexroth", "Bosch Rexroth AG", 0.9375),
        ("SKF", "S.K.F.", 0.8333333333333334),
        ("PRESS-07", "PRES-07", 0.9583333333333334),
    ],
)
def test_matches_the_frontend(left: str, right: str, expected: float) -> None:
    assert jaro_similarity(left, right) == pytest.approx(expected, abs=1e-12)


def test_is_symmetric() -> None:
    """Asymmetry would make a pair's score depend on which record was read first."""
    assert jaro_similarity("PRESS-07", "PRES-07") == jaro_similarity("PRES-07", "PRESS-07")
