"""How much data a pipeline run produces.

Two profiles. `full` is the demonstration world. `small` exists so integration tests can
build a real warehouse end to end in under a second — which is the difference between
testing the pipeline and mocking it.
"""

from dataclasses import dataclass
from typing import Literal

ScaleName = Literal["full", "small"]


@dataclass(frozen=True)
class Scale:
    name: ScaleName
    machines: int
    production_runs: int
    machine_cycles: int
    inline_batches: int
    lab_batches: int
    # Rows the lab exports with an empty timestamp. Real feeds contain broken rows, and a
    # pipeline that has never met one has not been tested.
    lab_malformed: int
    work_orders: int
    # Work orders raised just before a run spike — the co-occurrence the findings engine
    # is meant to notice without claiming causation.
    work_order_trigger: int
    run_spike: int
    contractor_callouts: int


FULL = Scale(
    name="full",
    machines=260,
    production_runs=5_000,
    machine_cycles=45_000,
    inline_batches=10_000,
    lab_batches=8_000,
    lab_malformed=18,
    work_orders=1_800,
    work_order_trigger=400,
    run_spike=260,
    contractor_callouts=260,
)

SMALL = Scale(
    name="small",
    machines=50,
    production_runs=300,
    machine_cycles=1_200,
    inline_batches=400,
    lab_batches=320,
    lab_malformed=4,
    work_orders=120,
    work_order_trigger=40,
    run_spike=40,
    contractor_callouts=50,
)

SCALES: dict[str, Scale] = {FULL.name: FULL, SMALL.name: SMALL}
