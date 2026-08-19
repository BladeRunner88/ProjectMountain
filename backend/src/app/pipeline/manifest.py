"""Provenance manifest for the six vendor systems.

Raw source files carry no self-referential "which system am I" column — a real vendor
export would not. This manifest is the single source of truth for where each file came
from, so ingestion can tag every raw row with its origin and that provenance survives
cleaning, resolution and the findings engine.

The field maps record what each vendor's own field name became in the shared vocabulary
and, critically, how its timestamp was interpreted. "assumed" is not a footnote: it is
the part a reader has to be able to audit.
"""

from typing import Final, TypedDict


class SourceDef(TypedDict):
    owner: str
    department: str
    format: str
    describes: str


MES_FILE: Final = "mes_platform.json"
SCADA_FILE: Final = "scada_historian.xml"
QC_INLINE_FILE: Final = "qc_inline.csv"
QC_LAB_FILE: Final = "qc_lab.csv"
MAINTENANCE_FILE: Final = "maintenance_plan.xlsx"
CONTRACTOR_FILE: Final = "contractor_service.csv"

SOURCES: Final[dict[str, SourceDef]] = {
    MES_FILE: {
        "owner": "Plant MES",
        "department": "Manufacturing execution",
        "format": "json",
        "describes": "asset register, production runs, operators",
    },
    SCADA_FILE: {
        "owner": "OT historian",
        "department": "Controls engineering",
        "format": "xml",
        "describes": "part catalogue, machine cycles, suppliers, cycle times",
    },
    QC_INLINE_FILE: {
        "owner": "Inline QC",
        "department": "Quality station A",
        "format": "csv",
        "describes": "batch dispositions, pass, rework, scrap",
    },
    QC_LAB_FILE: {
        "owner": "Metrology lab",
        "department": "Quality station B",
        "format": "csv",
        "describes": "batch dispositions, pass, rework, scrap",
    },
    MAINTENANCE_FILE: {
        "owner": "CMMS",
        "department": "Maintenance planning",
        "format": "xlsx",
        "describes": "work orders, priorities, scheduled dates",
    },
    CONTRACTOR_FILE: {
        "owner": "Service contractor",
        "department": "External service",
        "format": "csv",
        "describes": "callouts, vendors, asset references",
    },
}

FIELD_MAPPINGS: Final[dict[str, dict[str, str]]] = {
    MES_FILE: {
        "asset_id": "asset_tag",
        "asset_name": "machine identifier",
        "commissioned_at": "occurred_at (UTC, explicit)",
    },
    SCADA_FILE: {
        "tag": "asset_tag (masked)",
        "timestamp": "occurred_at (assumed UTC)",
        "supplier": "supplier_canonical (aliased)",
    },
    QC_INLINE_FILE: {
        "asset_ref": "asset_tag (masked)",
        "status": "disposition (already canonical)",
        "created_at": "occurred_at (explicit offset)",
    },
    QC_LAB_FILE: {
        "equipment": "asset_tag (masked)",
        "result": "disposition (mapped: RELEASED/REJECTED/HOLD_FOR_REVIEW)",
        "local_datetime": "occurred_at (assumed from plant timezone)",
        "uom": "unit",
        "value": "quantity",
    },
    MAINTENANCE_FILE: {
        "historian_tag": "machine identifier",
        "scheduled_at": "occurred_at (assumed UTC, Excel serial)",
    },
    CONTRACTOR_FILE: {
        "equipment_ref": "asset_tag (numeric-core matched)",
        "service_date": "occurred_at (date only)",
    },
}
