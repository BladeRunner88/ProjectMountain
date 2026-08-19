"""Time-window correlation across every source."""

from typing import Annotated

from fastapi import APIRouter, Query, status

from app.domains.correlate.deps import CorrelateServiceDep
from app.domains.correlate.schemas import CorrelateResponse

router = APIRouter(prefix="/correlate", tags=["correlate"])

_DEFAULT_WINDOW_MINUTES = 60


@router.get("", status_code=status.HTTP_200_OK)
def correlate(
    service: CorrelateServiceDep,
    at: Annotated[str, Query(description="ISO-8601 instant to centre the window on")],
    window: Annotated[int, Query(description="Half-width of the window, in minutes")] = (
        _DEFAULT_WINDOW_MINUTES
    ),
) -> CorrelateResponse:
    """Everything every source recorded within `window` minutes either side of `at`."""
    return service.around(at, window)
