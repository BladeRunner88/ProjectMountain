import { allEntities, generateDataset } from './generate'
import type { Dataset } from './generate'
import { getMetric as getMetricImpl } from './reconciliation'
import type { MetricResult, WindowInput } from './reconciliation'
import type { Edge, Entity, Flag } from './types'

export type {
  Account,
  CanonicalStatus,
  Edge,
  Entity,
  EntityKind,
  Flag,
  FlagKind,
  Organization,
  Provider,
  RelationType,
  Transaction,
} from './types'
export type { Adjustment, AdjustmentRowRef, MetricResult, RawRow, SourceContribution, WindowInput } from './reconciliation'
export { METRIC_REGISTRY } from './reconciliation'
export { NOW_UTC } from './generate'

let dataset: Dataset | null = null

function getDataset(): Dataset {
  if (!dataset) dataset = generateDataset()
  return dataset
}

export interface ConnectionRef {
  entity: Entity
  relType: string
  direction: 'in' | 'out'
}

export function getNode(id: string): Entity | undefined {
  return allEntities(getDataset()).find((e) => e.id === id)
}

export function getConnections(id: string): ConnectionRef[] {
  const d = getDataset()
  const entities = allEntities(d)
  const byId = new Map(entities.map((e) => [e.id, e]))
  const results: ConnectionRef[] = []

  for (const edge of d.edges) {
    if (edge.source === id) {
      const target = byId.get(edge.target)
      if (target) results.push({ entity: target, relType: edge.relType, direction: 'out' })
    } else if (edge.target === id) {
      const source = byId.get(edge.source)
      if (source) results.push({ entity: source, relType: edge.relType, direction: 'in' })
    }
  }
  return results
}

export function nameOf(e: Entity): string {
  if (e.kind === 'organization') return e.name
  if (e.kind === 'account') return e.label
  if (e.kind === 'provider') return e.name
  return e.id
}

export interface SearchResult {
  entity: Entity
  matchedOn: string
}

export function search(query: string): SearchResult[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const d = getDataset()
  const results: SearchResult[] = []

  for (const e of allEntities(d)) {
    const name = nameOf(e)
    if (name.toLowerCase().includes(q)) {
      results.push({ entity: e, matchedOn: name })
    } else if (e.id.toLowerCase().includes(q)) {
      results.push({ entity: e, matchedOn: e.id })
    }
  }
  return results.slice(0, 50)
}

export interface Stats {
  totalNodes: number
  counts: { organizations: number; accounts: number; providers: number; transactions: number }
  flagged: { total: number; byKind: Record<string, number> }
  totalSettledUsd: number
}

export function getStats(): Stats {
  const d = getDataset()
  const byKind: Record<string, number> = {}
  for (const f of d.flags) byKind[f.kind] = (byKind[f.kind] ?? 0) + 1

  return {
    totalNodes: allEntities(d).length,
    counts: {
      organizations: d.organizations.length,
      accounts: d.accounts.length,
      providers: d.providers.length,
      transactions: d.transactions.length,
    },
    flagged: { total: d.flags.length, byKind },
    totalSettledUsd:
      Math.round(d.transactions.filter((t) => t.status === 'settled').reduce((s, t) => s + t.amount, 0) * 100) / 100,
  }
}

export function getFlags(): Flag[] {
  return getDataset().flags
}

export function getFlagFor(entityId: string): Flag | undefined {
  return getDataset().flags.find((f) => f.entityId === entityId)
}

export function getMetric(key: string, opts: { window?: WindowInput; asOf?: string | 'now' } = {}): MetricResult {
  return getMetricImpl(getDataset(), key, opts)
}

export function getAllNodes(): Entity[] {
  return allEntities(getDataset())
}

export function getAllEdges(): Edge[] {
  return getDataset().edges
}

let connectionCounts: Record<string, number> | null = null

export function getConnectionCounts(): Record<string, number> {
  if (connectionCounts) return connectionCounts
  const counts: Record<string, number> = {}
  for (const edge of getDataset().edges) {
    counts[edge.source] = (counts[edge.source] ?? 0) + 1
    counts[edge.target] = (counts[edge.target] ?? 0) + 1
  }
  connectionCounts = counts
  return counts
}
