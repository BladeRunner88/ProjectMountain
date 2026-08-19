"""Window correlation rules."""

from datetime import datetime, timedelta

from app.core.exceptions import ValidationError
from app.domains.correlate.repository import WindowRepository
from app.domains.correlate.schemas import CorrelateResponse
from app.domains.findings.schemas import WindowContext


class CorrelateService:
    def __init__(self, repository: WindowRepository) -> None:
        self._repository = repository

    def around(self, at: str, window_minutes: int) -> CorrelateResponse:
        try:
            anchor = datetime.fromisoformat(at)
        except ValueError as exc:
            raise ValidationError("at must be an ISO datetime") from exc

        span = timedelta(minutes=window_minutes)
        start, end = anchor - span, anchor + span
        context = self.between(start, end)

        return CorrelateResponse(
            at=at,
            window_minutes=window_minutes,
            start=str(start),
            end=str(end),
            batches=context.batches,
            cycles=context.cycles,
            runs=context.runs,
            work_orders=context.work_orders,
            # The same rows under the gaming-era names, for clients still on that contract.
            transactions=context.batches,
            rounds=context.cycles,
            sessions=context.runs,
            campaign_sends=context.work_orders,
        )

    def between(self, start: datetime, end: datetime) -> WindowContext:
        """Everything every source recorded in [start, end). Reused by finding detail."""
        batches = self._repository.batches_between(start, end)
        cycles = self._repository.cycles_between(start, end)
        runs = self._repository.runs_between(start, end)
        work_orders = self._repository.work_orders_between(start, end)
        return WindowContext(
            batches=batches,
            cycles=cycles,
            runs=runs,
            work_orders=work_orders,
            # The same rows under the gaming-era names, for clients still on that contract.
            transactions=batches,
            rounds=cycles,
            sessions=runs,
            campaign_sends=work_orders,
        )
