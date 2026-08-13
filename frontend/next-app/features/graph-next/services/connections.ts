// S8.9: CONNECTED — "rope partners, operator, sensor — each clickable,
// each swapping the selection." Rope partners are the operational
// climber<->climber edges dataset.ts adds for an operator with 2+
// climbers; the sensor is the one attached to this climber's own route,
// not to the climber directly — there's no climber->sensor edge in the
// dataset, so it's resolved via the shared route.

import type { DomainDataset, EntityTier } from '../types/domain'
import type { GraphId } from '../types/graph'

export interface ConnectedEntity {
  id: GraphId
  label: string
  tier: EntityTier
  relation: 'operator' | 'rope-partner' | 'sensor'
}

export function computeConnections(dataset: DomainDataset, climberId: GraphId): ConnectedEntity[] {
  const byId = new Map(dataset.domainEntities.map((e) => [e.id, e]))
  const climber = byId.get(climberId)
  if (!climber || climber.tier !== 'climber') return []

  const results: ConnectedEntity[] = []

  const operator = climber.parentId ? byId.get(climber.parentId) : undefined
  if (operator) results.push({ id: operator.id, label: operator.label, tier: operator.tier, relation: 'operator' })

  const route = operator?.parentId ? byId.get(operator.parentId) : undefined
  if (route) {
    const sensor = dataset.domainEntities.find((e) => e.tier === 'sensor' && e.parentId === route.id)
    if (sensor) results.push({ id: sensor.id, label: sensor.label, tier: sensor.tier, relation: 'sensor' })
  }

  for (const edge of dataset.edges) {
    if (edge.kind !== 'operational' && edge.kind !== 'anomaly') continue
    const otherId = edge.source === climberId ? edge.target : edge.target === climberId ? edge.source : null
    if (!otherId) continue
    const other = byId.get(otherId)
    if (other && other.tier === 'climber') {
      results.push({ id: other.id, label: other.label, tier: other.tier, relation: 'rope-partner' })
    }
  }
  return results
}
