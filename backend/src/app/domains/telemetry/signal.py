"""Reconstructing a sensor reading from a timestamp.

No row is stored per sensor per tick. A reading is a pure function of the sensor's seeded
profile and the instant asked for:

    value = baseline + amplitude * sin(2π (tick - phase) / period) + noise

where the noise is drawn from a hash of the sensor id and the tick rather than from a
random source. Three consequences, and all three are the reason it is built this way:

  * **It is exact.** Asking twice for the same instant returns the same number, in any
    process, on any machine, forever. That makes the endpoint cacheable and the tests
    exact rather than approximate.
  * **It does not grow.** Five hundred sensors ticking every five seconds would be nine
    million rows a day. Here it is five hundred rows, once.
  * **It is honest about what it is.** This is a reconstruction of a modelled signal, not
    a recording of a real one — and the profile it reconstructs from came from the
    historian's own tag configuration, not from thin air.

Real events are not noise: `app.domains.telemetry.states` overlays the seeded incidents on
top, so a machine that went down at a known instant reads as down.
"""

import hashlib
import math
from dataclasses import dataclass

# Two 32-bit halves of the digest, turned into two uniforms for Box-Muller.
_HASH_BYTES = 8
_HALF_BITS = 32
_UNIFORM_SCALE = float(1 << _HALF_BITS)
# Keeps the log in Box-Muller away from zero.
_EPSILON = 1e-12


@dataclass(frozen=True)
class SensorProfile:
    """The seeded shape of one sensor's signal."""

    channel_id: str
    baseline: float
    amplitude: float
    period_seconds: float
    phase_seconds: float
    noise_sigma: float


def value_at(profile: SensorProfile, tick: int) -> float:
    """The reading this sensor reports at `tick`, in its own unit."""
    if profile.period_seconds <= 0:
        cyclic = 0.0
    else:
        angle = 2 * math.pi * (tick - profile.phase_seconds) / profile.period_seconds
        cyclic = profile.amplitude * math.sin(angle)
    return profile.baseline + cyclic + profile.noise_sigma * _unit_normal(profile.channel_id, tick)


def _unit_normal(channel_id: str, tick: int) -> float:
    """A standard normal derived from the sensor and the instant, not from a RNG.

    Box-Muller over two uniforms pulled from one blake2b digest. Deterministic by
    construction: the same sensor and the same tick always give the same draw.
    """
    digest = hashlib.blake2b(f"{channel_id}:{tick}".encode(), digest_size=_HASH_BYTES).digest()
    raw = int.from_bytes(digest, "big")

    first = ((raw >> _HALF_BITS) & 0xFFFFFFFF) / _UNIFORM_SCALE
    second = (raw & 0xFFFFFFFF) / _UNIFORM_SCALE
    return math.sqrt(-2.0 * math.log(max(first, _EPSILON))) * math.cos(2 * math.pi * second)


def align_to_grid(epoch_seconds: float, tick_seconds: int) -> int:
    """Snap an instant to the tick grid.

    Two clients polling 200ms apart get the same frame, which is what makes the response
    cacheable and stops the same moment reading differently for two people looking at it.
    """
    return int(epoch_seconds // tick_seconds) * tick_seconds
