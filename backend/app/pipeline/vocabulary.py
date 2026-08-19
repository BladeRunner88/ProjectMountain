"""The vocabularies that make the six feeds disagree, and the maps that reconcile them.

Every constant here exists because two vendor systems describe the same fact differently.
Nothing is a preference; each one is a stated assumption a reader is entitled to audit.
"""

from typing import Final

# Quantities arrive in whatever unit the recording system uses. The canonical unit is the
# kilogram; these are the stated conversions, not looked-up live rates.
MASS_TO_KG: Final[dict[str, float]] = {
    "kg": 1.0,
    "g": 0.001,
    "t": 1000.0,
    "lb": 0.45359237,
    "oz": 0.028349523125,
}

# Two quality systems, two disposition vocabularies, one canonical set.
DISPOSITION_MAP: Final[dict[str, str]] = {
    "pass": "pass",
    "rework": "rework",
    "scrap": "scrap",
    "released": "pass",
    "rejected": "scrap",
    "hold_for_review": "rework",
}

# The lab exports wall-clock local time with no offset. This is the assumption made when
# converting it, per plant. No DST — stated, not modelled.
PLANT_UTC_OFFSET: Final[dict[str, int]] = {
    "Stuttgart": 1,
    "Brno": 1,
    "Monterrey": -6,
    "Coventry": 0,
    "Gothenburg": 1,
    "Windsor": -5,
}

# The historian and the MES spell supplier names differently, and neither is wrong.
SUPPLIER_ALIASES: Final[dict[str, str]] = {
    "bosch rexroth": "Bosch Rexroth",
    "boschrexroth": "Bosch Rexroth",
    "bosch-rexroth ag": "Bosch Rexroth",
    "skf": "SKF",
    "skf group": "SKF",
    "festo": "Festo",
    "festo se": "Festo",
    "balluff": "Balluff",
    "balluff gmbh": "Balluff",
    "sandvik coromant": "Sandvik Coromant",
    "sandvik": "Sandvik Coromant",
    "kennametal": "Kennametal",
}


def canonical_supplier(raw: str) -> str:
    """Map a vendor's spelling of a supplier onto the canonical name.

    Unknown spellings are returned untouched rather than dropped: losing a supplier
    silently is worse than reporting one the alias table has not caught up with.
    """
    return SUPPLIER_ALIASES.get(raw.strip().lower(), raw.strip())


def canonical_disposition(raw: str) -> str | None:
    """Map a quality system's own result vocabulary onto the canonical disposition."""
    return DISPOSITION_MAP.get(raw.strip().lower().replace(" ", "_"))


def to_kilograms(quantity: float, unit: str) -> float:
    """Convert a recorded quantity to kilograms.

    Raises KeyError on an unknown unit. The caller counts that as a parse failure rather
    than guessing — an unconverted number silently summed with converted ones is the kind
    of error this whole pipeline exists to surface.
    """
    return quantity * MASS_TO_KG[unit.strip().lower()]
