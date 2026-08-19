"""Builds the canonical world from the definitions in `world.py`.

Separate from `world.py` so the data and the construction stay apart: the definitions are
read constantly while working on the generators, the construction almost never.
"""

import random
from datetime import datetime, time, timedelta

from app.pipeline.world import (
    ASSET_STATUSES,
    LINE_NAMES,
    OPERATOR_FIRST_NAMES,
    OPERATOR_LAST_NAMES,
    PART_NAMES,
    PLANTS,
    SUPPLIERS,
    WINDOW_START,
    Asset,
    Component,
    Machine,
    World,
)

# How many machines are registered twice under different tags. This is the whole reason
# entity resolution exists, so it is a named rate rather than a magic number.
DOUBLE_REGISTRATION_RATE = 0.12

FULL_MACHINE_COUNT = 260
SMALL_MACHINE_COUNT = 50

_OPERATOR_COUNT = 60
# Machines were installed before the observation window, not during it.
_COMMISSIONING_SPAN_DAYS = 3650


def build_world(*, machine_count: int, rng: random.Random) -> World:
    """The truth every vendor feed is a partial, differently-spelled view of."""
    world = World(
        plants=list(PLANTS),
        lines=list(LINE_NAMES),
        suppliers=list(SUPPLIERS),
        components=_build_components(),
        operators=_build_operators(rng),
    )
    world.machines = _build_machines(machine_count, rng)
    world.assets = _build_assets(world.machines, world.operators, rng)
    return world


def _build_components() -> list[Component]:
    components = []
    for supplier_index, supplier in enumerate(SUPPLIERS):
        for part_index, part_name in enumerate(PART_NAMES[supplier_index]):
            components.append(
                Component(
                    part_number=f"PN-{supplier_index + 1:02d}{part_index + 1:02d}",
                    part_name=part_name,
                    supplier=supplier.name,
                    # Deterministic, and different enough per part to be visible in a chart.
                    nominal_cycle_seconds=round(8.0 + supplier_index * 1.5 + part_index * 0.75, 2),
                )
            )
    return components


def _build_operators(rng: random.Random) -> list[str]:
    names = {
        f"{rng.choice(OPERATOR_FIRST_NAMES)} {rng.choice(OPERATOR_LAST_NAMES)}"
        for _ in range(_OPERATOR_COUNT * 2)
    }
    return sorted(names)[:_OPERATOR_COUNT]


def _build_machines(machine_count: int, rng: random.Random) -> list[Machine]:
    machines = []
    for index in range(machine_count):
        plant = PLANTS[index % len(PLANTS)]
        line = LINE_NAMES[index % len(LINE_NAMES)]
        commissioned = datetime.combine(WINDOW_START, time(6, 0)) - timedelta(
            days=rng.randint(30, _COMMISSIONING_SPAN_DAYS)
        )
        machines.append(
            Machine(
                machine_id=f"machine_{index + 1:05d}",
                # The name a human would use, and the only thing two register rows for the
                # same machine reliably share — modulo casing and padding.
                name=f"{line.split()[0][:3].upper()}-{index + 1:04d}",
                plant=plant.name,
                line=line,
                commissioned_at=commissioned,
                double_registered=rng.random() < DOUBLE_REGISTRATION_RATE,
            )
        )
    return machines


def _build_assets(machines: list[Machine], operators: list[str], rng: random.Random) -> list[Asset]:
    """One register row per registration. A double-registered machine gets two."""
    assets: list[Asset] = []
    for machine in machines:
        registrations = 2 if machine.double_registered else 1
        for registration in range(registrations):
            tag_number = len(assets) + 1
            assets.append(
                Asset(
                    asset_tag=f"AST-{tag_number:06d}",
                    machine_id=machine.machine_id,
                    # The second registration is the same name typed by a different person
                    # into a different system. Casing and padding differ; the name does not.
                    asset_name=_spell(machine.name, registration, rng),
                    historian_tag=_historian_tag(machine, registration),
                    serial=f"SN{tag_number:07d}",
                    plant=machine.plant,
                    unit_system=_unit_system(machine.plant),
                    status=rng.choice(ASSET_STATUSES),
                    commissioned_at=machine.commissioned_at,
                    operator=rng.choice(operators),
                )
            )
    return assets


def _spell(name: str, registration: int, rng: random.Random) -> str:
    """How one register row happens to write a machine name down.

    Casing and surrounding whitespace only. A variant that changed the name's internal
    punctuation would be a genuinely different string, and the resolver is deliberately
    exact rather than fuzzy — it would miss it, and the pipeline would have no way to know
    it had missed. Harder variants belong with a scored matcher, not a normaliser.
    """
    if registration == 0:
        return name
    variants = (name.lower(), name.upper(), f" {name} ", f"  {name}")
    return rng.choice(variants)


def _historian_tag(machine: Machine, registration: int) -> str:
    """The OT tag path. The CMMS holds this exact string — it is the one shared key."""
    plant_code = machine.plant[:3].upper()
    line_code = machine.line.split()[0][:4].upper()
    return f"{plant_code}.{line_code}.{machine.name}.{registration}"


def _unit_system(plant_name: str) -> str:
    return next(plant.unit_system for plant in PLANTS if plant.name == plant_name)
