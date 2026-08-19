"""The audit chain's seal.

Each entry's seal covers its own fields AND the previous entry's seal, so altering any
entry after the fact changes every seal after it. Verification is re-walking the chain
and recomputing — which is only meaningful because the inputs are serialised
deterministically here, with sorted keys and a fixed separator.

blake2b rather than sha256: same guarantee, and it is what the frontend's own chain used,
so the two halves produce identical digests for identical input while both exist.
"""

import hashlib
import json
from datetime import UTC, datetime
from typing import Any

DIGEST_SIZE = 32
GENESIS_PREV = ""


def compute_seal(
    *,
    sequence: int,
    actor: str,
    action: str,
    occurred_at: datetime,
    payload: dict[str, Any],
    prev_seal: str | None,
) -> str:
    """The seal for one entry. Pure — same inputs, same digest, on any machine."""
    body = json.dumps(
        {
            "sequence": sequence,
            "actor": actor,
            "action": action,
            # Normalised to UTC before formatting: a stamp rendered in a local zone would
            # seal to a different digest on a different machine.
            "occurred_at": occurred_at.astimezone(UTC).replace(tzinfo=None).isoformat(),
            "payload": payload,
            "prev": prev_seal if prev_seal is not None else GENESIS_PREV,
        },
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.blake2b(body.encode("utf-8"), digest_size=DIGEST_SIZE).hexdigest()
