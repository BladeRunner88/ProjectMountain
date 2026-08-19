"""Search ranking.

Pure functions, no database and no HTTP, so the ranking can be tested on its own.

The ladder is deliberate: a canonical-name prefix is the strongest signal a reader
expects, and an incidental property match the weakest. Alias matches sit in between —
they are real, but the reader has to be told which spelling hit, which is why the rank
carries the alias back out with it.
"""

from dataclasses import dataclass
from typing import Any

NAME_PREFIX = 0
NAME_SUBSTRING = 1
ALIAS_PREFIX = 2
ALIAS_SUBSTRING = 3
PROPERTY_SUBSTRING = 4

# Already covered by the name ladder — re-checking them would rank a name match as a
# weaker property match.
_NAME_KEYS = ("name", "title")


@dataclass(frozen=True)
class Match:
    rank: int
    matched_alias: str | None


def rank_object(
    query: str, name: str, aliases: list[str], properties: dict[str, Any]
) -> Match | None:
    """Where this object places for `query`, or None when it does not match at all."""
    name_lower = name.lower()
    if name_lower.startswith(query):
        return Match(NAME_PREFIX, None)
    if query in name_lower:
        return Match(NAME_SUBSTRING, None)

    for alias in aliases:
        if alias.lower().startswith(query):
            return Match(ALIAS_PREFIX, alias)
    for alias in aliases:
        if query in alias.lower():
            return Match(ALIAS_SUBSTRING, alias)

    for key, value in properties.items():
        if key in _NAME_KEYS or value is None:
            continue
        if query in str(value).lower():
            return Match(PROPERTY_SUBSTRING, None)
    return None
