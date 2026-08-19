"""Append-only JSONL archive of access requests.

Superseded by `app.access_requests`. Kept writing for one phase so the cutover is
additive: nothing that reads the file breaks, and the two stores can be compared before
the file is retired.
"""

import json
from pathlib import Path
from typing import Any


class AccessRequestArchive:
    def __init__(self, path: Path) -> None:
        self._path = path

    def append(self, record: dict[str, Any]) -> None:
        # The directory may not exist on a fresh checkout; the legacy code assumed it did.
        self._path.parent.mkdir(parents=True, exist_ok=True)
        with self._path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(record) + "\n")
