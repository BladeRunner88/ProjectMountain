// 8.6: a SYNTHETIC fixture for the "verify at 500+ nodes" requirement —
// the real backend dataset only has 121 nodes (8.4's own counts), so
// there is no real data at this scale to test against. This is a
// disclosed, dev-only stress-test fixture, never mixed into the real
// rendering path: it exists purely to prove the layout+render pipeline
// holds up well past the current real scale, the same standard practice
// any performance test needs a large-enough fixture for. Shape mirrors
// the real tree (country -> route -> operator -> climber, plus leaf
// sources) so the cone-seeding/collision logic sees the branching pattern
// it actually expects, just scaled up.

import type { GraphEdge, GraphNode } from './adapter'

function seededUnit(key: string): number {
  let h = 2166136261
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) % 100000) / 100000
}

const STATUSES: readonly GraphNode['status'][] = ['READY', 'WATCH', 'IMPAIRED', 'REQUIRES_DESCENT', null, null, null]

// 8.11: none of these fields have a synthetic-stress-fixture equivalent —
// they're real backend facts (a driver list, a source's health rollup),
// not something this fixture invents just to satisfy the type.
const NO_811_FIELDS = {
  drivers: null,
  role: null,
  lastContactMinutesAgo: null,
  predictedOutcome: null,
  predictedWithinHours: null,
  timeline: null,
  sourceCategory: null,
  sourceHealth: null,
  sourceBackup: null,
} as const

export function buildStressFixture(targetNodeCount = 520): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  const now = '2026-01-01T00:00:00.000Z'

  const countryCount = 5
  // solve roughly for route/operator/climber counts that land near targetNodeCount,
  // keeping the same real-data branching shape (routes:operators:climbers ~ 14:30:50)
  const scale = targetNodeCount / (5 + 14 + 30 + 50 + 22)
  const routeCount = Math.max(countryCount, Math.round(14 * scale))
  const operatorCount = Math.max(routeCount, Math.round(30 * scale))
  const climberCount = Math.max(operatorCount, Math.round(50 * scale))
  const sourceCount = Math.max(1, Math.round(22 * scale))

  for (let i = 0; i < countryCount; i++) {
    nodes.push({ id: `stress-country-${i}`, type: 'country', tier: 'root', label: `Stress Country ${i}`, parentId: null, status: null, properties: {}, serial: null, createdAt: now, ...NO_811_FIELDS })
  }

  for (let i = 0; i < routeCount; i++) {
    const parentId = `stress-country-${i % countryCount}`
    const id = `stress-route-${i}`
    nodes.push({ id, type: 'route', tier: 'parent', label: `Stress Route ${i}`, parentId, status: null, properties: {}, serial: null, createdAt: now, ...NO_811_FIELDS })
    edges.push({ id: `parent:${parentId}->${id}`, source: parentId, target: id, kind: 'parent', label: null })
  }

  for (let i = 0; i < operatorCount; i++) {
    const parentId = `stress-route-${i % routeCount}`
    const id = `stress-operator-${i}`
    nodes.push({ id, type: 'operator', tier: 'parent', label: `Stress Operator ${i}`, parentId, status: null, properties: {}, serial: null, createdAt: now, ...NO_811_FIELDS })
    edges.push({ id: `parent:${parentId}->${id}`, source: parentId, target: id, kind: 'parent', label: null })
  }

  for (let i = 0; i < climberCount; i++) {
    const parentId = `stress-operator-${i % operatorCount}`
    const id = `stress-climber-${i}`
    const status = STATUSES[Math.floor(seededUnit(id) * STATUSES.length)]
    nodes.push({ id, type: 'climber', tier: 'child', label: `Stress Climber ${i}`, parentId, status, properties: {}, serial: null, createdAt: now, ...NO_811_FIELDS })
    edges.push({ id: `parent:${parentId}->${id}`, source: parentId, target: id, kind: 'parent', label: null })
  }

  for (let i = 0; i < sourceCount; i++) {
    const parentId = `stress-route-${i % routeCount}`
    const id = `stress-source-${i}`
    nodes.push({ id, type: 'source', tier: 'leaf', label: `Stress Source ${i}`, parentId, status: null, properties: {}, serial: null, createdAt: now, ...NO_811_FIELDS })
    edges.push({ id: `parent:${parentId}->${id}`, source: parentId, target: id, kind: 'parent', label: null })
  }

  // a handful of cross edges (rope-partner analogue) between climbers, same as real data's shape
  for (let i = 0; i + 1 < climberCount; i += 7) {
    const a = `stress-climber-${i}`
    const b = `stress-climber-${i + 1}`
    edges.push({ id: `cross:${a}-${b}`, source: a, target: b, kind: 'cross', label: 'rope partner' })
  }

  return { nodes, edges }
}
