"""What fields each vendor file actually contained.

The Meaning surface has to be able to show fields NOTHING mapped, which means the
inventory has to come from the files themselves. Neither of the two obvious shortcuts
works:

  * `raw.*` columns are the loader's names, not the vendor's — the SCADA loader reads
    `<tag>` and stores it as `tag_masked` — and only two of the six feeds land in `raw.*`
    at all, so four would silently report no fields.
  * `FIELD_MAPPINGS` lists only what was successfully mapped, which is precisely the
    half that is not interesting here.

So the fields are read straight off each file, at the one moment something is already
opening all six: ingest. Read generically per format — every key of a JSON object, every
CSV header, every child tag of an XML record, every column of a spreadsheet — because a
hand-maintained list would drift the first time a vendor added a column, and a vendor
adding a column nobody noticed is exactly what this surface is for.
"""

import csv
import json
from pathlib import Path
from typing import Any
from xml.etree import ElementTree

from openpyxl import load_workbook


def observe(path: Path) -> list[str]:
    """Every field name in one vendor file, sorted and de-duplicated.

    An unreadable or absent file yields nothing rather than raising: a missing feed is
    already reported as a failed connector, and losing the whole inventory because one
    file is malformed would be a worse outcome than reporting it as empty.
    """
    if not path.exists():
        return []
    try:
        suffix = path.suffix.lower()
        if suffix == ".json":
            return _from_json(path)
        if suffix == ".xml":
            return _from_xml(path)
        if suffix == ".csv":
            return _from_csv(path)
        if suffix == ".xlsx":
            return _from_xlsx(path)
    except (OSError, ValueError, ElementTree.ParseError, json.JSONDecodeError):
        return []
    return []


def _from_json(path: Path) -> list[str]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    keys: set[str] = set()
    _walk_json(payload, keys)
    return sorted(keys)


def _walk_json(node: Any, keys: set[str], depth: int = 0) -> None:
    """Collect keys from record-shaped nodes.

    Depth-limited: a deeply nested config blob would otherwise contribute keys that are
    structure rather than data fields.
    """
    max_depth = 3
    if depth > max_depth:
        return
    if isinstance(node, dict):
        for key, value in node.items():
            if isinstance(value, list | dict):
                _walk_json(value, keys, depth + 1)
            else:
                keys.add(key)
    elif isinstance(node, list):
        for item in node[:1]:
            _walk_json(item, keys, depth + 1)


def _from_xml(path: Path) -> list[str]:
    root = ElementTree.parse(path).getroot()  # noqa: S314  # local pipeline input
    keys: set[str] = set()
    for element in root.iter():
        children = list(element)
        # A record is an element whose children are leaves; those children are its
        # fields. An element holding other records is structure, not a record.
        if children and all(len(child) == 0 for child in children):
            keys.update(child.tag for child in children)
            keys.update(element.attrib)
    return sorted(keys)


def _from_csv(path: Path) -> list[str]:
    with path.open(newline="", encoding="utf-8") as handle:
        header = next(csv.reader(handle), [])
    return sorted({name.strip() for name in header if name.strip()})


def _from_xlsx(path: Path) -> list[str]:
    workbook = load_workbook(path, read_only=True)
    try:
        sheet = workbook.active
        if sheet is None:
            return []
        header = next(sheet.iter_rows(min_row=1, max_row=1, values_only=True), ())
        return sorted({str(cell).strip() for cell in header if cell is not None})
    finally:
        workbook.close()
