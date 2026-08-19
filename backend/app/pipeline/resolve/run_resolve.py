"""Stage 3 — resolve normalised records into canonical objects and typed links."""

from typing import Any

from sqlalchemy import Connection, text

from app.pipeline.bulk import insert_rows
from app.pipeline.resolve import entities, reference_data
from app.pipeline.resolve.graph_builder import GraphBuilder
from app.pipeline.resolve.matching import suffix, unmask
from app.pipeline.resolve.schema import create_all


def resolve_all(connection: Connection) -> GraphBuilder:
    builder = GraphBuilder()
    create_all(connection)

    assets = _rows(connection, "SELECT * FROM clean.assets")
    components = _rows(connection, "SELECT * FROM clean.components")
    batches = _rows(connection, "SELECT * FROM clean.batches")
    work_orders = _rows(connection, "SELECT * FROM clean.work_orders")
    callouts = _rows(connection, "SELECT * FROM clean.callouts")
    runs = _rows(connection, "SELECT * FROM clean.runs")
    sensors = _rows(connection, "SELECT * FROM clean.sensor_profiles")

    plants = reference_data.plant_ids(builder)
    lines = reference_data.line_ids(builder, plants)
    stations = reference_data.station_ids(builder)
    vendors = reference_data.vendor_ids(builder, [row.vendor for row in callouts])
    operators = reference_data.operator_ids(builder, assets)

    machine_by_tag = entities.resolve_machines(builder, assets, lines)
    _add_assets(builder, assets, machine_by_tag, plants, operators)
    supplier_ids = _add_suppliers_and_components(builder, components)
    _add_sensors(builder, sensors, assets, machine_by_tag)
    _link_produced(builder, runs, components)

    machine_by_historian_tag = {
        row.historian_tag: machine_by_tag[row.asset_tag]
        for row in assets
        if row.asset_tag in machine_by_tag
    }
    entities.resolve_batches(builder, batches, assets, stations)
    entities.resolve_work_orders(builder, work_orders, machine_by_historian_tag)
    entities.resolve_callouts(builder, callouts, assets, vendors)

    builder.count("suppliers_resolved", len(supplier_ids))
    _write(connection, builder)
    return builder


def _add_assets(
    builder: GraphBuilder,
    assets: list[Any],
    machine_by_tag: dict[str, str],
    plants: dict[str, str],
    operators: dict[str, str],
) -> None:
    for asset in assets:
        builder.add_object(
            asset.asset_tag,
            "Asset",
            {
                "asset_tag": asset.asset_tag,
                "plant": asset.plant,
                "unit_system": asset.unit_system,
                "status": asset.status,
            },
        )
        builder.add_link(asset.asset_tag, machine_by_tag[asset.asset_tag], "REGISTERED_AS")
        if asset.plant in plants:
            builder.add_link(asset.asset_tag, plants[asset.plant], "LOCATED_IN")
        if asset.operator in operators:
            builder.add_link(asset.asset_tag, operators[asset.operator], "OPERATED_BY")


def _add_suppliers_and_components(builder: GraphBuilder, components: list[Any]) -> dict[str, str]:
    supplier_ids: dict[str, str] = {}
    for name in sorted({row.supplier_canonical for row in components}):
        object_id = f"supplier_{len(supplier_ids) + 1:02d}"
        builder.add_object(object_id, "Supplier", {"name": name})
        supplier_ids[name] = object_id

    for component in components:
        object_id = f"component_{component.part_number}"
        builder.add_object(
            object_id,
            "Component",
            {
                "part_name": component.part_name,
                "part_number": component.part_number,
                "nominal_cycle_seconds": component.nominal_cycle_seconds,
            },
        )
        builder.add_link(object_id, supplier_ids[component.supplier_canonical], "SUPPLIED_BY")
        builder.add_resolution(
            "Component",
            "clean.components",
            component.part_number,
            component.supplier_raw,
            object_id,
        )
    return supplier_ids


def _add_sensors(
    builder: GraphBuilder,
    sensors: list[Any],
    assets: list[Any],
    machine_by_tag: dict[str, str],
) -> None:
    """A sensor is mounted on a machine, via the asset row whose tag the historian masks."""
    by_suffix = {suffix(asset.asset_tag): asset.asset_tag for asset in assets}
    for sensor in sensors:
        builder.add_object(
            sensor.channel_id,
            "Sensor",
            {
                "channel": sensor.channel,
                "unit": sensor.unit,
                "sample_rate_hz": sensor.sample_rate_hz,
                "status": sensor.status,
            },
        )
        asset_tag = by_suffix.get(unmask(sensor.tag_masked))
        machine_id = machine_by_tag.get(asset_tag) if asset_tag else None
        if machine_id:
            builder.add_link(sensor.channel_id, machine_id, "MOUNTED_ON")
            builder.count("sensors_mounted")
        else:
            builder.count("sensors_unmounted")


def _link_produced(builder: GraphBuilder, runs: list[Any], components: list[Any]) -> None:
    """A production run says which part an asset made. The catalogue says which part that is."""
    component_by_name = {row.part_name: f"component_{row.part_number}" for row in components}
    linked = set()
    for run in runs:
        component_id = component_by_name.get(run.part_name)
        if component_id is None:
            builder.count("runs_with_unknown_part")
            continue
        # One edge per asset/part pair, not one per run: the graph records that this
        # machine makes this part, not how many times.
        if (run.asset_tag, component_id) not in linked:
            builder.add_link(run.asset_tag, component_id, "PRODUCED")
            linked.add((run.asset_tag, component_id))
        builder.count("runs_linked_to_part")


def _rows(connection: Connection, statement: str) -> list[Any]:
    return list(connection.execute(text(statement)).all())


def _write(connection: Connection, builder: GraphBuilder) -> None:
    insert_rows(connection, "graph.objects", builder.object_rows())
    insert_rows(connection, "graph.links", builder.links)
    insert_rows(connection, "graph.resolution_map", builder.resolution)
    insert_rows(connection, "main.resolution_stats", sorted(builder.stats.items()))
