"""Provenance manifest for the vendor source systems.

The manifest itself is defined by the pipeline, which is what tags every raw row with its
origin. This module re-exports it so the API layer depends on the domain vocabulary rather
than reaching into the pipeline package, and so the import site says what it means.
"""

from app.pipeline.manifest import FIELD_MAPPINGS, SOURCES, SourceDef

__all__ = ["FIELD_MAPPINGS", "SOURCES", "SourceDef"]
