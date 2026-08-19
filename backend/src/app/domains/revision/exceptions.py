"""Revision-domain errors."""

from app.core.exceptions import ConflictError, NotFoundError


class QueueItemNotFoundError(NotFoundError):
    def __init__(self, item_id: str) -> None:
        super().__init__("queue item not found")
        self.item_id = item_id


class QueueItemAlreadyResolvedError(ConflictError):
    def __init__(self, item_id: str, stage: str) -> None:
        super().__init__("queue item is already resolved")
        self.item_id = item_id
        self.stage = stage


class IdempotencyKeyReusedError(ConflictError):
    """The same key was presented for a different queue item.

    Not a replay — a bug or a collision in the caller's key generation. Returning the
    other item's record would be worse than refusing: it would tell the caller their
    decision was applied to something it never touched.
    """

    def __init__(self, key: str) -> None:
        super().__init__("idempotency key already used for a different item")
        self.key = key
