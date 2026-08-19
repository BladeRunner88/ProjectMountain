"""JSON-in-VARCHAR column type.

Several columns hold JSON encoded as text: `graph.objects.properties_json`, the five
`findings.*_json` columns, and the list-valued fields on `app.access_requests`.

Typing them at the column level would mean 40+ nullable columns or one table per object
type, either of which destroys the property the whole design rests on: the API reads the
ontology generically and never hardcodes an object's shape.

DuckDB does have a native JSON type, but its mapping through duckdb-engine 0.17 is
unverified on the pinned versions, and AGENTS.md 1 forbids relying on that. So the
encoding stays text and this decorator does the conversion once, at the Python boundary,
instead of scattering `json.loads` through every repository.
"""

import json
from typing import Any

from sqlalchemy import Dialect, String, TypeDecorator


class JsonText(TypeDecorator[Any]):
    """Transparently `json.dumps`/`json.loads` a VARCHAR column."""

    impl = String
    cache_ok = True

    def process_bind_param(self, value: Any, dialect: Dialect) -> str | None:
        if value is None:
            return None
        return json.dumps(value)

    def process_result_value(self, value: Any, dialect: Dialect) -> Any:
        if value is None:
            return None
        return json.loads(value)
