"""Resolving the records that no feed shares a key for.

Four techniques, one per problem:

  * assets to machines — normalise the name and group. Two register rows for one machine
    differ only by casing and whitespace.
  * batches to assets  — the quality feeds hold a masked tag, so match on its four-
    character tail and report ambiguity instead of guessing.
  * work orders to machines — the CMMS holds the historian tag verbatim. This is the one
    genuinely shared identifier in the whole landscape.
  * callouts to assets — the contractor decorates its own reference, so compare the digits.
"""

from typing import Any

from app.pipeline.resolve.graph_builder import GraphBuilder
from app.pipeline.resolve.matching import (
    match_by_suffix,
    normalised_name,
    numeric_core,
    suffix,
)


def resolve_machines(
    builder: GraphBuilder, assets: list[Any], lines: dict[str, str]
) -> dict[str, str]:
    """Group asset register rows into the machines they actually describe."""
    groups: dict[str, list[Any]] = {}
    for asset in assets:
        groups.setdefault(normalised_name(asset.asset_name), []).append(asset)

    machine_by_tag: dict[str, str] = {}
    for index, key in enumerate(sorted(groups)):
        rows = groups[key]
        machine_id = f"machine_{index + 1:05d}"
        first = rows[0]
        builder.add_object(
            machine_id,
            "Machine",
            {
                "name": first.asset_name.strip(),
                "plant": first.plant,
                "commissioned_at": str(first.commissioned_at_utc),
            },
        )
        line = _line_for(first.historian_tag, lines)
        if line:
            builder.add_link(machine_id, line, "INSTALLED_ON")

        for row in rows:
            machine_by_tag[row.asset_tag] = machine_id
            builder.add_resolution(
                "Machine", "clean.assets", row.asset_tag, row.asset_name, machine_id
            )

        builder.count("machines_resolved")
        if len(rows) > 1:
            builder.count("machines_registered_more_than_once")

    builder.count("asset_records_ingested", len(assets))
    return machine_by_tag


def resolve_batches(
    builder: GraphBuilder,
    batches: list[Any],
    assets: list[Any],
    stations: dict[str, str],
) -> None:
    """Attach each inspected batch to the asset it was produced on."""
    by_suffix: dict[str, list[str]] = {}
    for asset in assets:
        by_suffix.setdefault(suffix(asset.asset_tag), []).append(asset.asset_tag)

    for batch in batches:
        builder.add_object(
            batch.batch_id,
            "Batch",
            {
                "disposition": batch.disposition,
                "quantity": batch.quantity_kg,
                "unit": "kg",
                "status": batch.disposition,
                "occurred_at": str(batch.occurred_at_utc),
            },
        )
        station = stations.get(batch.inspection_station)
        if station:
            builder.add_link(batch.batch_id, station, "INSPECTED_BY")

        asset_tag, ambiguous = match_by_suffix(batch.asset_ref_masked, by_suffix)
        if asset_tag:
            builder.add_link(batch.batch_id, asset_tag, "PRODUCED_ON")
            builder.count("batches_resolved_to_asset")
        elif ambiguous:
            builder.count("batches_ambiguous_tag_suffix")
        else:
            builder.count("batches_unresolved")


def resolve_work_orders(
    builder: GraphBuilder, work_orders: list[Any], machine_by_historian_tag: dict[str, str]
) -> None:
    """The CMMS holds the historian tag verbatim, so this is an exact join, not a guess."""
    for order in work_orders:
        builder.add_object(
            order.work_order,
            "WorkOrder",
            {"code": order.work_order, "wo_type": order.wo_type, "priority": order.priority},
        )
        machine_id = machine_by_historian_tag.get(order.historian_tag)
        if machine_id:
            builder.add_link(order.work_order, machine_id, "SCHEDULED_FOR")
            builder.count("work_orders_resolved_to_machine")
        else:
            builder.count("work_orders_unresolved")
    builder.count("work_orders_total", len(work_orders))


def resolve_callouts(
    builder: GraphBuilder, callouts: list[Any], assets: list[Any], vendors: dict[str, str]
) -> None:
    """Match the contractor's own equipment reference by the digits inside it."""
    by_core: dict[str, list[str]] = {}
    for asset in assets:
        by_core.setdefault(numeric_core(asset.asset_tag), []).append(asset.asset_tag)

    for callout in callouts:
        vendor_id = vendors.get(callout.vendor)
        candidates = by_core.get(numeric_core(callout.equipment_ref), [])
        if vendor_id and len(candidates) == 1:
            builder.add_link(vendor_id, candidates[0], "SERVICED")
            builder.count("callouts_resolved")
        else:
            builder.count("callouts_unresolved")
    builder.count("callouts_total", len(callouts))


def _line_for(historian_tag: str, lines: dict[str, str]) -> str | None:
    """The historian tag encodes the line as its second segment."""
    segments = historian_tag.split(".")
    if len(segments) < 2:
        return None
    prefix = segments[1]
    for name, object_id in lines.items():
        if name.split()[0][:4].upper() == prefix:
            return object_id
    return None
