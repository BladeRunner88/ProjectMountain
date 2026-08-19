"""The canonical world the vendor feeds are imperfect views of.

Nothing in this module is ever written to a source file. That is the point: the ground
truth exists so the generated feeds can disagree about it in specific, seeded ways, and so
a test can assert that resolution recovered it. If the truth were exported, entity
resolution would have nothing to do.

The window is anchored to a fixed date, not `date.today()`. The pre-refactor generator
seeded its RNG and then keyed its window off the current date, so two runs on different
days produced different data from the same seed — which makes every downstream assertion
unstable.
"""

from dataclasses import dataclass, field
from datetime import date, datetime, timedelta

SEED = 11
WINDOW_DAYS = 90
WINDOW_END = date(2026, 8, 1)
WINDOW_START = WINDOW_END - timedelta(days=WINDOW_DAYS)

# The single supplier whose telemetry goes quiet, and the plant whose lab pass rate drops.
QUIET_SUPPLIER = "Balluff"
DEGRADED_PLANT = "Monterrey"
INLINE_STATION = "Inline QC"
LAB_STATION = "Metrology lab"


@dataclass(frozen=True)
class Plant:
    name: str
    country: str
    unit_system: str
    currency_free_note: str = ""


@dataclass(frozen=True)
class Supplier:
    name: str
    # How the historian spells it versus how the MES spells it. Neither is wrong.
    historian_spelling: str
    mes_spelling: str


@dataclass(frozen=True)
class Component:
    part_number: str
    part_name: str
    supplier: str
    nominal_cycle_seconds: float


@dataclass(frozen=True)
class Machine:
    """One real machine, however many register rows describe it."""

    machine_id: str
    name: str
    plant: str
    line: str
    commissioned_at: datetime
    # True when two vendor systems each registered this machine separately, under
    # different tags — the case resolution has to collapse.
    double_registered: bool


@dataclass(frozen=True)
class Asset:
    """One register row about a machine, as one vendor system records it."""

    asset_tag: str
    machine_id: str
    asset_name: str
    historian_tag: str
    serial: str
    plant: str
    unit_system: str
    status: str
    commissioned_at: datetime
    operator: str


@dataclass
class World:
    plants: list[Plant] = field(default_factory=list)
    lines: list[str] = field(default_factory=list)
    suppliers: list[Supplier] = field(default_factory=list)
    components: list[Component] = field(default_factory=list)
    machines: list[Machine] = field(default_factory=list)
    assets: list[Asset] = field(default_factory=list)
    operators: list[str] = field(default_factory=list)


PLANTS: tuple[Plant, ...] = (
    Plant("Stuttgart", "Germany", "metric"),
    Plant("Brno", "Czechia", "metric"),
    Plant("Monterrey", "Mexico", "imperial"),
    Plant("Coventry", "United Kingdom", "metric"),
    Plant("Gothenburg", "Sweden", "metric"),
    Plant("Windsor", "Canada", "imperial"),
)

SUPPLIERS: tuple[Supplier, ...] = (
    Supplier("Bosch Rexroth", "BOSCHREXROTH", "Bosch-Rexroth AG"),
    Supplier("SKF", "skf", "SKF Group"),
    Supplier("Festo", "FESTO", "Festo SE"),
    Supplier("Balluff", "balluff", "Balluff GmbH"),
    Supplier("Sandvik Coromant", "SANDVIK", "Sandvik Coromant"),
    Supplier("Kennametal", "kennametal", "Kennametal"),
)

# Three parts per supplier, 18 in total.
PART_NAMES: tuple[tuple[str, str, str], ...] = (
    ("Hydraulic manifold", "Servo valve block", "Pressure accumulator"),
    ("Spindle bearing", "Linear guide", "Ball screw unit"),
    ("Pneumatic actuator", "Air prep unit", "Vacuum generator"),
    ("Inductive sensor", "Photoelectric barrier", "RFID head"),
    ("Turning insert", "Milling cutter", "Boring bar"),
    ("Drill body", "Face mill", "Tool holder"),
)

LINE_NAMES: tuple[str, ...] = (
    "Body-in-white A",
    "Body-in-white B",
    "Powertrain machining",
    "Gearbox assembly",
    "Press shop 1",
    "Press shop 2",
    "Weld cell north",
    "Weld cell south",
    "Paint prep",
    "Final assembly",
    "Subassembly cell",
    "Machining centre 4",
    "Heat treatment",
    "Packing and dispatch",
)

PRODUCT_FAMILIES: tuple[str, ...] = ("Chassis", "Drivetrain", "Housings", "Fasteners")

OPERATOR_FIRST_NAMES: tuple[str, ...] = (
    "Anke",
    "Bogdan",
    "Camila",
    "Dieter",
    "Elena",
    "Felipe",
    "Greta",
    "Hasan",
    "Ivana",
    "Jonas",
    "Karin",
    "Lukas",
    "Marta",
    "Nils",
    "Oksana",
    "Pavel",
    "Quentin",
    "Rosa",
    "Stefan",
    "Tomas",
    "Ulrike",
    "Viktor",
    "Wanda",
    "Yusuf",
)

OPERATOR_LAST_NAMES: tuple[str, ...] = (
    "Adler",
    "Baumann",
    "Cerny",
    "Dvorak",
    "Engel",
    "Fischer",
    "Gomez",
    "Hoffmann",
    "Iversen",
    "Jansson",
    "Kowalski",
    "Lindqvist",
    "Muller",
    "Novak",
    "Ortiz",
    "Petrov",
    "Ramirez",
    "Svensson",
    "Torres",
    "Vogel",
    "Weber",
    "Zeman",
)

ASSET_STATUSES: tuple[str, ...] = ("running", "idle", "maintenance", "decommissioned")
SHIFTS: tuple[str, ...] = ("early", "late", "night")
ROLES: tuple[str, ...] = ("machine operator", "setter", "team lead", "quality technician")
