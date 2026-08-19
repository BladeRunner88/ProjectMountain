"""What a finding is.

Every field exists so a reader can check the claim themselves: which sources it drew on,
what was computed, over what window, and the rows behind it. The language stops at
co-occurrence — nothing here asserts a cause.
"""

import json
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any


@dataclass
class Finding:
    finding_type: str
    title: str
    description: str
    sources: list[str]
    computed: dict[str, Any]
    window_start: datetime
    window_end: datetime
    entities: list[dict[str, str]]
    evidence: dict[str, Any] = field(default_factory=dict)
    # Nothing writes these yet; the review tables arrive in a later phase.
    reviewer_status: str = "Open"

    def as_row(self, finding_id: str) -> tuple[Any, ...]:
        return (
            finding_id,
            self.finding_type,
            self.title,
            self.description,
            json.dumps(self.sources),
            json.dumps(self.computed),
            json.dumps({"start": str(self.window_start), "end": str(self.window_end)}),
            json.dumps(self.entities),
            self.reviewer_status,
            None,
            None,
            json.dumps(self.evidence),
        )
