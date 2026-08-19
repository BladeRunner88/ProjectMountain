// S8.9: CONNECTED — "rope partners, operator, sensor — each clickable,
// each swapping the selection." Rope partners are the operational
// machine<->machine edges dataset.ts adds for an operator with 2+
// machines; the sensor is the one attached to this machine's own line,
// not to the machine directly — there's no machine->sensor edge in the
// dataset, so it's resolved via the shared line.

import type { DomainDataset, EntityTier } from "../types/domain"
import type { GraphId } from "../types/graph"

export interface ConnectedEntity {
  id: GraphId
  label: string
  tier: EntityTier
  relation: "line" | "rope-partner" | "sensor"
}

export function computeConnections(
  dataset: DomainDataset,
  machineId: GraphId
): ConnectedEntity[] {
  const byId = new Map(dataset.domainEntities.map((e) => [e.id, e]))
  const machine = byId.get(machineId)
  if (!machine || machine.tier !== "machine") return []

  const results: ConnectedEntity[] = []

  const operator = machine.parentId ? byId.get(machine.parentId) : undefined
  if (operator)
    results.push({
      id: operator.id,
      label: operator.label,
      tier: operator.tier,
      relation: "line",
    })

  const line = operator?.parentId ? byId.get(operator.parentId) : undefined
  if (line) {
    const sensor = dataset.domainEntities.find(
      (e) => e.tier === "sensor" && e.parentId === line.id
    )
    if (sensor)
      results.push({
        id: sensor.id,
        label: sensor.label,
        tier: sensor.tier,
        relation: "sensor",
      })
  }

  for (const edge of dataset.edges) {
    if (edge.kind !== "operational" && edge.kind !== "anomaly") continue
    const otherId =
      edge.source === machineId
        ? edge.target
        : edge.target === machineId
          ? edge.source
          : null
    if (!otherId) continue
    const other = byId.get(otherId)
    if (other && other.tier === "machine") {
      results.push({
        id: other.id,
        label: other.label,
        tier: other.tier,
        relation: "rope-partner",
      })
    }
  }
  return results
}
