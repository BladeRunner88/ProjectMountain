"""The statistics behind the findings, tested without a database."""

from app.pipeline.findings.statistics import median_gap_minutes, two_proportion_z, z_score


def test_a_value_at_the_mean_scores_zero() -> None:
    assert z_score(5.0, [3.0, 5.0, 7.0]) == 0.0


def test_an_outlier_scores_far_from_zero() -> None:
    score = z_score(100.0, [10.0, 11.0, 9.0, 10.0, 10.0])

    assert score is not None
    assert score > 10


def test_a_population_with_no_spread_answers_none_rather_than_zero() -> None:
    """Zero would claim 'perfectly normal' about data that says nothing at all."""
    assert z_score(5.0, [5.0, 5.0, 5.0]) is None


def test_a_single_observation_cannot_support_the_question() -> None:
    assert z_score(5.0, [5.0]) is None


def test_two_identical_rates_do_not_differ() -> None:
    assert two_proportion_z(50, 100, 500, 1000) == 0.0


def test_a_collapsed_rate_scores_strongly_negative() -> None:
    score = two_proportion_z(10, 100, 800, 1000)

    assert score is not None
    assert score < -4


def test_an_empty_sample_answers_none() -> None:
    assert two_proportion_z(0, 0, 800, 1000) is None


def test_a_degenerate_pooled_rate_answers_none() -> None:
    """Every observation a success on both sides: there is no variance to test against."""
    assert two_proportion_z(100, 100, 1000, 1000) is None


def test_the_typical_gap_is_the_median_not_the_mean() -> None:
    """One huge gap is exactly what the silence detector is looking for; letting it drag
    the baseline up would hide the thing being measured."""
    assert median_gap_minutes([0.0, 10.0, 20.0, 30.0, 1000.0]) == 10.0


def test_fewer_than_two_observations_have_no_gap() -> None:
    assert median_gap_minutes([5.0]) is None
