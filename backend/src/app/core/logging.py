"""Structured logging setup. Called once, from the app lifespan."""

import logging
import sys

_FORMAT = "%(asctime)s %(levelname)-8s %(name)s %(message)s"


def configure_logging(level: str) -> None:
    """Install a single stderr handler at `level`, replacing anything already configured."""
    handler = logging.StreamHandler(sys.stderr)
    handler.setFormatter(logging.Formatter(_FORMAT))

    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(level.upper())
