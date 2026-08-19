"""The signal reconstruction, tested without a database."""

import math

from app.domains.telemetry.signal import SensorProfile, align_to_grid, value_at

PROFILE = SensorProfile(
    channel_id="STU.BODY.BOD-0001.0:spindle_temp_c",
    baseline=62.0,
    amplitude=8.0,
    period_seconds=3600.0,
    phase_seconds=0.0,
    noise_sigma=1.2,
)
QUIET = SensorProfile(
    "quiet", baseline=10.0, amplitude=0.0, period_seconds=60.0, phase_seconds=0.0, noise_sigma=0.0
)


def test_the_same_instant_always_gives_the_same_reading() -> None:
    """The property the whole design rests on. Without it the endpoint cannot be cached,
    two viewers disagree about one moment, and no test can assert a value."""
    assert value_at(PROFILE, 1_782_907_200) == value_at(PROFILE, 1_782_907_200)


def test_different_instants_give_different_readings() -> None:
    assert value_at(PROFILE, 1_782_907_200) != value_at(PROFILE, 1_782_907_205)


def test_two_sensors_at_one_instant_do_not_move_together() -> None:
    """Noise keyed only on the tick would make every sensor in the plant twitch in unison."""
    other = SensorProfile("another-sensor", 62.0, 8.0, 3600.0, 0.0, 1.2)

    assert value_at(PROFILE, 1_782_907_200) != value_at(other, 1_782_907_200)


def test_a_noiseless_sensor_sits_exactly_on_its_baseline() -> None:
    assert value_at(QUIET, 12345) == 10.0


def test_the_cycle_reaches_its_amplitude() -> None:
    """A quarter period past the phase is the peak of the sine."""
    noiseless = SensorProfile(
        "peak",
        baseline=0.0,
        amplitude=5.0,
        period_seconds=400.0,
        phase_seconds=0.0,
        noise_sigma=0.0,
    )

    assert math.isclose(value_at(noiseless, 100), 5.0, abs_tol=1e-9)


def test_a_zero_period_does_not_divide_by_zero() -> None:
    broken = SensorProfile(
        "broken",
        baseline=3.0,
        amplitude=9.0,
        period_seconds=0.0,
        phase_seconds=0.0,
        noise_sigma=0.0,
    )

    assert value_at(broken, 7) == 3.0


def test_the_noise_term_has_no_drift() -> None:
    """A hash-derived normal that drifted would make every sensor look like it was failing.

    Measured on a flat profile so the sine is not being measured instead: over a
    non-whole number of periods a cycle has a non-zero mean, which says nothing about
    the noise.
    """
    flat = SensorProfile(
        "drift-probe",
        baseline=0.0,
        amplitude=0.0,
        period_seconds=3600.0,
        phase_seconds=0.0,
        noise_sigma=1.0,
    )
    draws = [value_at(flat, tick) for tick in range(1_782_907_200, 1_782_907_200 + 50_000, 5)]
    mean = sum(draws) / len(draws)
    spread = (sum((d - mean) ** 2 for d in draws) / len(draws)) ** 0.5

    assert abs(mean) < 0.05, mean
    assert 0.9 < spread < 1.1, spread


def test_instants_inside_one_tick_snap_to_the_same_frame() -> None:
    assert align_to_grid(1_782_907_201.9, 5) == align_to_grid(1_782_907_204.1, 5)


def test_the_next_tick_is_a_different_frame() -> None:
    assert align_to_grid(1_782_907_204.9, 5) != align_to_grid(1_782_907_205.1, 5)
