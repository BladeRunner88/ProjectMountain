"""How records from systems that share no key are matched.

Four techniques, each one because a specific pair of feeds has no identifier in common.
All pure functions: no database, no I/O, so each can be tested on its own.
"""

import re

_NON_DIGIT = re.compile(r"\D")
_MASK_CHARACTERS = "*"
_SUFFIX_LENGTH = 4


def normalised_name(raw: str) -> str:
    """The comparable form of a machine name.

    Two register rows for one machine differ by casing and stray whitespace and nothing
    else, so trimming and lowercasing is sufficient — and, crucially, is not a fuzzy
    match: it either collides or it does not.
    """
    return " ".join(raw.strip().lower().split())


def numeric_core(reference: str) -> str:
    """The digits inside a reference, ignoring each system's own decoration.

    `EQ-000123-M` from the contractor and `AST-000123` from the plant share no text and
    are the same asset.
    """
    return _NON_DIGIT.sub("", reference)


def unmask(masked: str) -> str:
    """The visible tail of a masked tag: `****0123` becomes `0123`."""
    return masked.replace(_MASK_CHARACTERS, "").strip()


def suffix(value: str) -> str:
    """The last four characters, which is all a masked reference preserves."""
    return value[-_SUFFIX_LENGTH:]


def match_by_suffix(
    masked: str, candidates_by_suffix: dict[str, list[str]]
) -> tuple[str | None, bool]:
    """Resolve a masked reference to exactly one asset tag.

    Returns the tag and whether the reference was ambiguous. Ambiguity is reported rather
    than resolved by picking one: a wrong attribution is worse than an unresolved row, and
    the count of ambiguous references is itself a number worth publishing.
    """
    candidates = candidates_by_suffix.get(unmask(masked), [])
    if len(candidates) == 1:
        return candidates[0], False
    return None, len(candidates) > 1
