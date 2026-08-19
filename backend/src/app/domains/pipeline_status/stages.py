"""The stages that actually run.

Named here rather than inferred, because the names are a property of the code, not of the
data. What each one *did* comes from `app.pipeline_runs` and is never assumed.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class StageDef:
    order: int
    name: str
    # The key this stage reports under in a run's stats blob.
    stats_key: str
    description: str


STAGES: tuple[StageDef, ...] = (
    StageDef(
        order=1,
        name="Generate",
        stats_key="generate",
        description="Synthesizes the six vendor exports, each in its own format and with "
        "its own field names, timestamp conventions and units.",
    ),
    StageDef(
        order=2,
        name="Ingest and normalise",
        stats_key="ingest",
        description="Maps every feed's fields onto one shared vocabulary, converts units "
        "and timestamps to a single basis, and records which conversions required an "
        "assumption rather than a stated fact.",
    ),
    StageDef(
        order=3,
        name="Resolve",
        stats_key="resolve",
        description="Groups records that describe the same real machine, using derivable "
        "keys rather than a shared identifier, and builds the typed graph.",
    ),
    StageDef(
        order=4,
        name="Findings",
        stats_key="findings",
        description="Computes cross-source discrepancies directly from the normalised "
        "data. Reports co-occurrence; never asserts a cause.",
    ),
)
