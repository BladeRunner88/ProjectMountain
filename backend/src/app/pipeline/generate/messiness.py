"""Deliberate imperfections, applied consistently so a test can predict them.

None of this is decoration. Every helper here reproduces a specific way real vendor
exports differ from each other, and each one is something the ingest stage has to survive.
"""

import random


def messy_case(value: str, rng: random.Random) -> str:
    """The same string as typed by three different people into three different systems."""
    return rng.choice([value, value.upper(), value.lower(), value.title()])


def messy_pad(value: str, rng: random.Random) -> str:
    """Stray whitespace, the way a spreadsheet paste leaves it."""
    return rng.choice([value, f" {value}", f"{value} ", f"  {value}  "])


def mask_tag(asset_tag: str) -> str:
    """How a system that must not store the full tag records it.

    Only the last four alphanumeric characters survive, which is exactly why resolution
    has to match on a suffix rather than an identifier.
    """
    alphanumeric = [character for character in asset_tag if character.isalnum()]
    return "****" + "".join(alphanumeric[-4:])


def numeric_core(reference: str) -> str:
    """The digits inside a reference, ignoring whatever prefix a system decorates it with.

    `EQ-000123-M` and `AST-000123` share nothing textually and are the same asset.
    """
    return "".join(character for character in reference if character.isdigit())
