import { describe, expect, it } from 'vitest'
import type { GraphEdge, GraphNode } from './adapter'
import type { SourceId, TracedValue } from '../ase/traced'
import type { Driver } from '../ase/prediction'
import {
  connectionCount,
  connectionRowsFor,
  contributingSourceIds,
  contributingSourceNodes,
  countDescendantsByType,
  curatedPropertyRowsWithConsumedKeys,
  extraPropertyRows,
  generateSummary,
  nearestAncestorOfType,
  positionRowsFor,
  ropePartnerOf,
} from './panelFields'

function tv(value: unknown, sourceId: string): TracedValue<unknown> {
  return {
    id: `tv-${sourceId}-${value}`,
    value,
    recordedAt: '2026-01-01T00:00:00Z',
    derivation: { kind: 'observed', source: sourceId as SourceId, rawField: 'x', rawValue: value, receivedAt: '2026-01-01T00:00:00Z', sourceReliability: 1 },
  } as unknown as TracedValue<unknown>
}

function node(partial: Partial<GraphNode> & Pick<GraphNode, 'id' | 'type' | 'tier'>): GraphNode {
  return {
    label: partial.id,
    parentId: null,
    status: null,
    properties: {},
    serial: null,
    createdAt: '2026-01-01T00:00:00Z',
    drivers: null,
    role: null,
    lastContactMinutesAgo: null,
    predictedOutcome: null,
    predictedWithinHours: null,
    timeline: null,
    sourceCategory: null,
    sourceHealth: null,
    sourceBackup: null,
    ...partial,
  }
}

describe('contributingSourceIds / contributingSourceNodes', () => {
  it('collects every distinct observed source id across a node\'s own properties', () => {
    const n = node({ id: 'climber:1', type: 'climber', tier: 'child', properties: { a: tv(1, 'gps-tracker'), b: tv(2, 'wearable-oximeter'), c: tv(3, 'gps-tracker') } })
    expect(new Set(contributingSourceIds(n))).toEqual(new Set(['gps-tracker', 'wearable-oximeter']))
  })

  it('a node with no properties has no contributing sources', () => {
    const n = node({ id: 'country:A', type: 'country', tier: 'root' })
    expect(contributingSourceIds(n)).toEqual([])
  })

  it('resolves contributing source ids to their actual GraphNode, using the "source:<id>" convention', () => {
    const climber = node({ id: 'climber:1', type: 'climber', tier: 'child', properties: { a: tv(1, 'gps-tracker') } })
    const sourceNode = node({ id: 'source:gps-tracker', type: 'source', tier: 'leaf' })
    const other = node({ id: 'source:weather-feed', type: 'source', tier: 'leaf' })
    expect(contributingSourceNodes(climber, [climber, sourceNode, other])).toEqual([sourceNode])
  })
})

describe('ropePartnerOf', () => {
  it('finds the other end of a cross edge regardless of which side is source/target', () => {
    const a = node({ id: 'climber:a', type: 'climber', tier: 'child' })
    const b = node({ id: 'climber:b', type: 'climber', tier: 'child' })
    const edges: GraphEdge[] = [{ id: 'cross:a-b', source: 'climber:a', target: 'climber:b', kind: 'cross', label: 'rope partner' }]
    expect(ropePartnerOf(a, [a, b], edges)).toBe(b)
    expect(ropePartnerOf(b, [a, b], edges)).toBe(a)
  })

  it('returns null for a climber with no cross edge on record', () => {
    const a = node({ id: 'climber:a', type: 'climber', tier: 'child' })
    expect(ropePartnerOf(a, [a], [])).toBeNull()
  })

  it('ignores non-cross edges', () => {
    const a = node({ id: 'climber:a', type: 'climber', tier: 'child', parentId: 'operator:1' })
    const op = node({ id: 'operator:1', type: 'operator', tier: 'parent' })
    const edges: GraphEdge[] = [{ id: 'parent:operator:1->climber:a', source: 'operator:1', target: 'climber:a', kind: 'parent', label: null }]
    expect(ropePartnerOf(a, [a, op], edges)).toBeNull()
  })
})

describe('nearestAncestorOfType', () => {
  const nodes: GraphNode[] = [
    node({ id: 'country:A', type: 'country', tier: 'root', parentId: null }),
    node({ id: 'route:1', type: 'route', tier: 'parent', parentId: 'country:A' }),
    node({ id: 'operator:1', type: 'operator', tier: 'parent', parentId: 'route:1' }),
    node({ id: 'climber:1', type: 'climber', tier: 'child', parentId: 'operator:1' }),
  ]
  const byId = new Map(nodes.map((n) => [n.id, n]))

  it('skips past a non-matching immediate parent to find the nearest ancestor of the requested type', () => {
    const climber = byId.get('climber:1')!
    expect(nearestAncestorOfType(climber, 'route', byId)?.id).toBe('route:1')
  })

  it('returns null when no ancestor of that type exists', () => {
    const root = byId.get('country:A')!
    expect(nearestAncestorOfType(root, 'route', byId)).toBeNull()
  })
})

describe('countDescendantsByType', () => {
  it('counts real descendants of a given type at any depth, not just direct children', () => {
    const nodes: GraphNode[] = [
      node({ id: 'country:A', type: 'country', tier: 'root' }),
      node({ id: 'route:1', type: 'route', tier: 'parent', parentId: 'country:A' }),
      node({ id: 'operator:1', type: 'operator', tier: 'parent', parentId: 'route:1' }),
      node({ id: 'climber:1', type: 'climber', tier: 'child', parentId: 'operator:1' }),
      node({ id: 'climber:2', type: 'climber', tier: 'child', parentId: 'operator:1' }),
    ]
    expect(countDescendantsByType('country:A', 'climber', nodes)).toBe(2)
    expect(countDescendantsByType('country:A', 'route', nodes)).toBe(1)
  })

  it('is zero for a node with no matching descendants', () => {
    const nodes: GraphNode[] = [node({ id: 'country:A', type: 'country', tier: 'root' })]
    expect(countDescendantsByType('country:A', 'climber', nodes)).toBe(0)
  })
})

describe('generateSummary', () => {
  it('climber: full data — location, readiness, strongest driver, and prediction all present', () => {
    const drivers: Driver[] = [
      { id: 'd1', label: 'Oxygen recovery slower than baseline', kind: 'clinical', contributionPct: 31, evidence: 'SpO2 trend', authority: 'clinical', confidencePct: 90, heldOf: null },
      { id: 'd2', label: 'Radio latency increase', kind: 'learned', contributionPct: 12, evidence: 'radio logs', authority: 'learned', confidencePct: 70, heldOf: { holds: 40, total: 52 } },
    ]
    const n = node({
      id: 'climber:1',
      type: 'climber',
      tier: 'child',
      label: 'Nima Tamang',
      status: 'WATCH',
      drivers,
      predictedOutcome: 'requires-review',
      predictedWithinHours: 6,
      properties: { currentCamp: tv('Camp III', 'gps-tracker'), predictedLikelihoodPct: tv(58, 'wearable-oximeter') },
    })
    const summary = generateSummary(n, [n])
    expect(summary).toContain('Nima Tamang is currently at Camp III with watch readiness.')
    expect(summary).toContain('Oxygen recovery slower than baseline is the strongest driver, contributing +31%.')
    expect(summary).toContain('Prediction: requires review within 6h at 58%.')
  })

  it('climber: unknown driver states the gap plainly rather than omitting it', () => {
    const n = node({ id: 'climber:2', type: 'climber', tier: 'child', label: 'Unscored Climber', drivers: null })
    const summary = generateSummary(n, [n])
    expect(summary).toContain('no traceable driver is on record')
    expect(summary).not.toMatch(/undefined|null/)
  })

  it('climber: no prediction on record says so explicitly, not silently', () => {
    const n = node({ id: 'climber:3', type: 'climber', tier: 'child', label: 'No Prediction Climber', predictedOutcome: null })
    const summary = generateSummary(n, [n])
    expect(summary).toContain('Prediction: none on record for this person.')
  })

  it('country: real descendant counts, not narrated numbers', () => {
    const nodes: GraphNode[] = [
      node({ id: 'country:A', type: 'country', tier: 'root', label: 'Nepal' }),
      node({ id: 'route:1', type: 'route', tier: 'parent', parentId: 'country:A' }),
      node({ id: 'climber:1', type: 'climber', tier: 'child', parentId: 'route:1' }),
    ]
    const summary = generateSummary(nodes[0], nodes)
    expect(summary).toBe('Nepal currently has 1 route and 1 climber on record.')
  })

  it('source: reflects real exposure health state when present', () => {
    const n = node({
      id: 'source:gps-tracker',
      type: 'source',
      tier: 'leaf',
      label: 'GPS Tracker',
      sourceHealth: { sourceId: 'gps-tracker' as SourceId, sourceName: 'GPS Tracker', category: 'position', healthPct: 90, state: 'healthy', breakdown: { uptimePct: 99, freshnessPct: 95, corroborationPct: 80, reliabilityPct: 92 }, failureRiskPct30Min: 2, usefulWindowLabel: '5 min', lastSyncAgeSec: 12, degraded: false, history7Day: [], factsDependent: 14, inUse: true },
    })
    expect(generateSummary(n, [n])).toBe('GPS Tracker is currently healthy, feeding 14 dependent facts.')
  })

  it('source: honestly discloses no exposure health tracked, rather than a fabricated state', () => {
    const n = node({ id: 'source:operator-rosters', type: 'source', tier: 'leaf', label: 'Operator Rosters', sourceHealth: null })
    expect(generateSummary(n, [n])).toBe('Operator Rosters has no exposure health tracked for it.')
  })
})

describe('curatedPropertyRowsWithConsumedKeys', () => {
  it('climber: exactly the 8 spec-requested keys, in order, with real values where they exist and an honest gap where they don\'t', () => {
    const n = node({
      id: 'climber:1',
      type: 'climber',
      tier: 'child',
      serial: 'S-001',
      role: 'guide',
      status: 'WATCH',
      lastContactMinutesAgo: 12,
      properties: { currentAltitudeM: tv(6200, 'gps-tracker') },
    })
    const { rows, consumedKeys } = curatedPropertyRowsWithConsumedKeys(n, [n], [])
    expect(rows.map((r) => r.key)).toEqual(['serial', 'role', 'team', 'current_altitude', 'health_score', 'readiness', 'last_contact', 'rope_partner'])
    expect(rows.find((r) => r.key === 'serial')?.value).toBe('S-001')
    expect(rows.find((r) => r.key === 'role')?.value).toBe('guide')
    expect(rows.find((r) => r.key === 'team')?.value).toBe('Not tracked')
    expect(rows.find((r) => r.key === 'current_altitude')?.kind).toBe('metric')
    expect(rows.find((r) => r.key === 'health_score')?.value).toBe('Not tracked')
    expect(rows.find((r) => r.key === 'readiness')?.value).toBe('Watch')
    expect(rows.find((r) => r.key === 'last_contact')?.value).toBe('12 min ago')
    expect(rows.find((r) => r.key === 'rope_partner')?.value).toBe('No rope partner on record')
    expect(consumedKeys.has('currentAltitudeM')).toBe(true)
  })

  it('country: active_climbers is a real derived count, code/permit_registry/base_camps/weather_feed are disclosed gaps', () => {
    const country = node({ id: 'country:A', type: 'country', tier: 'root', label: 'Nepal' })
    const climber = node({ id: 'climber:1', type: 'climber', tier: 'child', parentId: 'country:A' })
    const { rows } = curatedPropertyRowsWithConsumedKeys(country, [country, climber], [])
    expect(rows.find((r) => r.key === 'active_climbers')?.value).toBe('1')
    for (const key of ['code', 'permit_registry', 'base_camps', 'weather_feed']) {
      expect(rows.find((r) => r.key === key)?.value).toMatch(/not tracked/i)
    }
  })
})

describe('positionRowsFor', () => {
  it('climber: real camp/last-known-position/gps-fix-age render as Metrics when present', () => {
    const n = node({
      id: 'climber:1',
      type: 'climber',
      tier: 'child',
      properties: { currentCamp: tv('Camp III', 'gps-tracker'), lastKnownPosition: tv('South Col', 'gps-tracker'), gpsFixAgeSec: tv(90, 'gps-tracker') },
    })
    const rows = positionRowsFor(n)
    expect(rows.map((r) => r.key)).toEqual(['currentCamp', 'lastKnownPosition', 'gpsFixAgeSec'])
    expect(rows.every((r) => r.kind === 'metric')).toBe(true)
  })

  it('climber: an honest gap when a position field is missing, never a fabricated value', () => {
    const n = node({ id: 'climber:1', type: 'climber', tier: 'child', properties: {} })
    const rows = positionRowsFor(n)
    expect(rows.every((r) => r.kind === 'text' && r.value === 'Not available')).toBe(true)
  })

  it('non-climber: honestly discloses no position concept exists, rather than inventing coordinates', () => {
    const n = node({ id: 'country:A', type: 'country', tier: 'root' })
    const rows = positionRowsFor(n)
    expect(rows).toHaveLength(1)
    expect(rows[0].value).toBe('Not tracked')
  })
})

describe('extraPropertyRows', () => {
  it('surfaces real properties not already shown in the curated set, never dropping real data', () => {
    const n = node({
      id: 'climber:1',
      type: 'climber',
      tier: 'child',
      properties: { currentAltitudeM: tv(6200, 'gps-tracker'), operatorName: tv('Everest Expeditions', 'operator-rosters') },
    })
    const { consumedKeys } = curatedPropertyRowsWithConsumedKeys(n, [n], [])
    const extra = extraPropertyRows(n, consumedKeys)
    expect(extra.map((r) => r.key)).toEqual(['operatorName'])
    expect(extra[0].kind).toBe('metric')
  })
})

describe('connectionRowsFor / connectionCount', () => {
  it('a climber with a parent, route ancestor, rope partner, and one contributing source counts 4 real connections', () => {
    const country = node({ id: 'country:A', type: 'country', tier: 'root' })
    const route = node({ id: 'route:1', type: 'route', tier: 'parent', parentId: 'country:A' })
    const operator = node({ id: 'operator:1', type: 'operator', tier: 'parent', parentId: 'route:1' })
    const a = node({ id: 'climber:a', type: 'climber', tier: 'child', parentId: 'operator:1', properties: { currentAltitudeM: tv(6200, 'gps-tracker') } })
    const b = node({ id: 'climber:b', type: 'climber', tier: 'child', parentId: 'operator:1' })
    const sourceNode = node({ id: 'source:gps-tracker', type: 'source', tier: 'leaf' })
    const edges: GraphEdge[] = [{ id: 'cross:a-b', source: 'climber:a', target: 'climber:b', kind: 'cross', label: 'rope partner' }]
    const nodes = [country, route, operator, a, b, sourceNode]

    const rows = connectionRowsFor(a, nodes, edges)
    expect(rows.find((r) => r.key === 'parent')?.value).toBe(operator.label)
    expect(rows.find((r) => r.key === 'route')?.value).toBe(route.label)
    expect(rows.find((r) => r.key === 'rope')?.value).toBe(b.label)
    expect(rows.find((r) => r.key === 'sources')?.value).toBe('1 source')
    expect(connectionCount(rows)).toBe(4)
  })

  it('a node with nothing real connected counts 0', () => {
    const country = node({ id: 'country:A', type: 'country', tier: 'root' })
    const rows = connectionRowsFor(country, [country], [])
    expect(connectionCount(rows)).toBe(0)
  })
})
