// S8.5: edge width by kind, and "every edge on its path to the core turns
// red" for an anomalous node — computed once per dataset (anomaly status is
// static/seeded in S8.3, nothing here changes live yet), not re-derived
// every frame.

import { isDomainEntity, isEnvironmentNode } from './domain'
import { ANOMALY_RED } from './tokens'
import type { ColorResolver } from './color'
import type { DomainDataset, DomainEntity, EdgeKind } from './domain'
import type { GraphId } from './types'

export const EDGE_WIDTH: Record<EdgeKind, number> = {
  structural: 1.2,
  operational: 1,
  filament: 0.4,
  anomaly: 1.2, // an anomaly-recoloured edge keeps its structural/operational weight; filaments needing the anomaly colour stay filament-thin, handled separately via FILAMENT_ANOMALY_WIDTH
}
export const FILAMENT_WIDTH_START = 0.6
export const FILAMENT_WIDTH_END = 0.2

// S8.4b: environment nodes and history links are rendered by their OWN
// dedicated code (NetworkSvgLayer/NetworkCanvasLayer), never through
// buildEdgeAppearanceResolver below — their colour rules (fixed teal,
// fixed green) don't fit "colour by branch, anomaly overrides". Their
// widths still live here, the one place every edge width in NETWORK is
// named, rather than an inline literal at the draw call.
export const ENVIRONMENT_EDGE_WIDTH = 1.2
export const HISTORY_LINK_WIDTH = 0.8

function edgeKey(sourceId: GraphId, targetId: GraphId): string {
  return `${sourceId}->${targetId}`
}

/** Every "parent -> child" hop on the path from an anomalous entity up to its country — the red path S8.5 asks for, not just the one edge directly into the anomalous node. */
export function buildAnomalyPathEdgeKeys(dataset: DomainDataset): ReadonlySet<string> {
  const byId = new Map<GraphId, DomainEntity>(dataset.domainEntities.map((e) => [e.id, e]))
  const keys = new Set<string>()
  const anomalous = dataset.domainEntities.filter((e) => e.status === 'anomaly')
  for (const start of anomalous) {
    let current: DomainEntity | undefined = start
    while (current && current.parentId !== null) {
      keys.add(edgeKey(current.parentId, current.id))
      current = byId.get(current.parentId)
    }
  }
  return keys
}

export interface EdgeAppearance {
  color: string
  width: number
  isAnomalyPath: boolean
}

export function buildEdgeAppearanceResolver(dataset: DomainDataset, colors: ColorResolver) {
  const anomalyPathKeys = buildAnomalyPathEdgeKeys(dataset)
  const byId = new Map(dataset.entities.map((e) => [e.id, e]))

  return function appearanceFor(sourceId: GraphId, targetId: GraphId, kind: EdgeKind): EdgeAppearance {
    const targetNode = byId.get(targetId)
    const targetFlagged = targetNode
      ? isDomainEntity(targetNode)
        ? targetNode.status === 'anomaly'
        : isEnvironmentNode(targetNode)
          ? targetNode.breached
          : targetNode.status === 'alert'
      : false
    const onAnomalyPath = anomalyPathKeys.has(edgeKey(sourceId, targetId))
    const isAnomaly = kind === 'anomaly' || targetFlagged || onAnomalyPath
    return {
      color: isAnomaly ? ANOMALY_RED : colors.colorFor(targetId),
      width: kind === 'filament' ? FILAMENT_WIDTH_START : EDGE_WIDTH[kind],
      isAnomalyPath: isAnomaly,
    }
  }
}
