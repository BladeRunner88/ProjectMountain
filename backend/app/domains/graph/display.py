"""How an object is labelled for a human.

One rule, used by the object detail view, the graph and search, so the same entity never
appears under two different names in two places.
"""

from typing import Any

# Ordered by how identifying the property is. `account_ref` is last because it is a
# masked reference, not a name — a fallback before giving up and showing the raw id.
_NAME_PROPERTIES = ("name", "title", "account_ref")


def display_name(properties: dict[str, Any], object_id: str) -> str:
    for key in _NAME_PROPERTIES:
        value = properties.get(key)
        if value:
            return str(value)
    return object_id
