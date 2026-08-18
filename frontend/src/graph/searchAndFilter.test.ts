import { describe, expect, it } from 'vitest'
import type { GraphEdge, GraphNode } from './adapter'
import type { TracedValue } from '../ase/traced'
import {
  computeFilterMatchIds,
  computeSearchMatchIds,
  edgeMatchesFilter,
  firstSearchMatch,
  matchesSearch,
  pushedAlongAxis,
  pushedPosition,
  resolveFilterReferenceId,
} from './searchAndFilter'

function tv(value: unknown): TracedValue<unknown> {
  return { id: `tv-${value}`, value, recordedAt: '2026-01-01T00:00:00Z', derivation: { kind: 'observed' } } as unknown as TracedValue<unknown>
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

const tree: GraphNode[] = [
  node({ id: 'country:Nepal', type: 'country', tier: 'root', label: 'Nepal' }),
  node({ id: 'route:1', type: 'route', tier: 'parent', parentId: 'country:Nepal', label: 'Khumbu' }),
  node({ id: 'operator:1', type: 'operator', tier: 'parent', parentId: 'route:1', label: 'Khumbu Vertical' }),
  node({ id: 'climber:1', type: 'climber', tier: 'child', parentId: 'operator:1', label: 'Nima Tamang', serial: '977-1484', properties: { operatorName: tv('Khumbu Vertical'), routeName: tv('Khumbu') } }),
  node({ id: 'climber:2', type: 'climber', tier: 'child', parentId: 'operator:1', label: 'James Marshall III', serial: '001-002', status: 'WATCH' }),
  node({ id: 'country:Pakistan', type: 'country', tier: 'root', label: 'Pakistan' }),
  node({ id: 'route:2', type: 'route', tier: 'parent', parentId: 'country:Pakistan', label: 'Baltoro' }),
  node({ id: 'climber:3', type: 'climber', tier: 'child', parentId: 'route:2', label: 'Fahad Hussain', status: 'REQUIRES_DESCENT' }),
]

describe('matchesSearch', () => {
  const byId = new Map(tree.map((n) => [n.id, n]))

  it('matches by name (case-insensitive substring)', () => {
    expect(matchesSearch(tree.find((n) => n.id === 'climber:1')!, 'nima', byId)).toBe(true)
    expect(matchesSearch(tree.find((n) => n.id === 'climber:1')!, 'NIMA TAM', byId)).toBe(true)
  })

  it('matches by serial', () => {
    expect(matchesSearch(tree.find((n) => n.id === 'climber:1')!, '977', byId)).toBe(true)
  })

  it('matches by operator/route (real properties, climbers only)', () => {
    const c = tree.find((n) => n.id === 'climber:1')!
    expect(matchesSearch(c, 'vertical', byId)).toBe(true)
    expect(matchesSearch(c, 'khumbu', byId)).toBe(true)
  })

  it('matches by origin — the nearest country ancestor', () => {
    expect(matchesSearch(tree.find((n) => n.id === 'climber:1')!, 'nepal', byId)).toBe(true)
    expect(matchesSearch(tree.find((n) => n.id === 'climber:3')!, 'pakistan', byId)).toBe(true)
  })

  it('a country node matches on its own label as its own origin', () => {
    expect(matchesSearch(tree.find((n) => n.id === 'country:Nepal')!, 'nepal', byId)).toBe(true)
  })

  it('empty query matches nothing', () => {
    expect(matchesSearch(tree[0], '', byId)).toBe(false)
    expect(matchesSearch(tree[0], '   ', byId)).toBe(false)
  })

  it('no match returns false', () => {
    expect(matchesSearch(tree.find((n) => n.id === 'climber:1')!, 'zzz-no-match', byId)).toBe(false)
  })
})

describe('computeSearchMatchIds / firstSearchMatch', () => {
  it('collects every matching node id', () => {
    expect(computeSearchMatchIds(tree, 'nepal')).toEqual(new Set(['country:Nepal', 'route:1', 'operator:1', 'climber:1', 'climber:2']))
  })

  it('empty query has no matches', () => {
    expect(computeSearchMatchIds(tree, '')).toEqual(new Set())
  })

  it('first match is tier-ordered — root before parent before child', () => {
    expect(firstSearchMatch(tree, 'nepal')?.id).toBe('country:Nepal')
  })

  it('null when nothing matches', () => {
    expect(firstSearchMatch(tree, 'zzz')).toBeNull()
  })
})

describe('computeFilterMatchIds', () => {
  it('"all" is null — no dimming', () => {
    expect(computeFilterMatchIds('all', tree, null)).toBeNull()
  })

  it('"anomalies" includes REQUIRES_DESCENT/IMPAIRED nodes plus their ancestors, not siblings', () => {
    const ids = computeFilterMatchIds('anomalies', tree, null)!
    expect(ids.has('climber:3')).toBe(true)
    expect(ids.has('route:2')).toBe(true)
    expect(ids.has('country:Pakistan')).toBe(true)
    expect(ids.has('climber:2')).toBe(false) // WATCH, not an anomaly
    expect(ids.has('country:Nepal')).toBe(false)
  })

  it('"watch" includes WATCH nodes plus ancestors only', () => {
    const ids = computeFilterMatchIds('watch', tree, null)!
    expect(ids.has('climber:2')).toBe(true)
    expect(ids.has('operator:1')).toBe(true)
    expect(ids.has('country:Nepal')).toBe(true)
    expect(ids.has('climber:3')).toBe(false)
  })

  it('"by-tier" with no reference is null (no-op, same as All)', () => {
    expect(computeFilterMatchIds('by-tier', tree, null)).toBeNull()
  })

  it('"by-tier" with a reference matches every node of that same tier, flat across the whole graph (route and operator share the "parent" tier by design)', () => {
    const ids = computeFilterMatchIds('by-tier', tree, 'route:1')!
    expect(ids).toEqual(new Set(['route:1', 'route:2', 'operator:1']))
  })

  it('"by-country" with no reference is null', () => {
    expect(computeFilterMatchIds('by-country', tree, null)).toBeNull()
  })

  it('"by-country" with a climber reference resolves to that climber\'s whole country subtree', () => {
    const ids = computeFilterMatchIds('by-country', tree, 'climber:1')!
    expect(ids).toEqual(new Set(['country:Nepal', 'route:1', 'operator:1', 'climber:1', 'climber:2']))
  })

  it('"by-country" with a country reference itself works the same way', () => {
    const ids = computeFilterMatchIds('by-country', tree, 'country:Pakistan')!
    expect(ids).toEqual(new Set(['country:Pakistan', 'route:2', 'climber:3']))
  })
})

describe('resolveFilterReferenceId', () => {
  it('"all"/"anomalies"/"watch" never resolve a reference — they don\'t need one', () => {
    expect(resolveFilterReferenceId('all', new Set(['climber:1']), tree, '')).toBeNull()
    expect(resolveFilterReferenceId('anomalies', new Set(['climber:1']), tree, '')).toBeNull()
  })

  it('a single selection wins as the reference', () => {
    expect(resolveFilterReferenceId('by-country', new Set(['climber:3']), tree, 'nepal')).toBe('climber:3')
  })

  it('falls back to the first search match when nothing is selected', () => {
    expect(resolveFilterReferenceId('by-country', new Set(), tree, 'nepal')).toBe('country:Nepal')
  })

  it('multi-select does not resolve a reference (ambiguous — falls back to search or null)', () => {
    expect(resolveFilterReferenceId('by-country', new Set(['climber:1', 'climber:2']), tree, '')).toBeNull()
  })

  it('null when neither selection nor search resolves anything', () => {
    expect(resolveFilterReferenceId('by-tier', new Set(), tree, '')).toBeNull()
  })
})

describe('edgeMatchesFilter', () => {
  it('null matchIds (All) means every edge matches', () => {
    const e: GraphEdge = { id: 'e1', source: 'a', target: 'b', kind: 'parent', label: null }
    expect(edgeMatchesFilter(e, null)).toBe(true)
  })

  it('an edge matches only when BOTH endpoints are in the match set', () => {
    const e: GraphEdge = { id: 'e1', source: 'route:1', target: 'operator:1', kind: 'parent', label: null }
    expect(edgeMatchesFilter(e, new Set(['route:1', 'operator:1']))).toBe(true)
    expect(edgeMatchesFilter(e, new Set(['route:1']))).toBe(false)
  })
})

describe('pushedPosition', () => {
  it('pushes a position further from centre along the same direction, unchanged at factor 1', () => {
    const center = { x: 0, y: 0 }
    expect(pushedPosition({ x: 10, y: 0 }, center, 1)).toEqual({ x: 10, y: 0 })
    expect(pushedPosition({ x: 10, y: 0 }, center, 2)).toEqual({ x: 20, y: 0 })
    expect(pushedPosition({ x: 0, y: -5 }, center, 3)).toEqual({ x: 0, y: -15 })
  })

  it('respects an off-origin centre', () => {
    expect(pushedPosition({ x: 110, y: 100 }, { x: 100, y: 100 }, 2)).toEqual({ x: 120, y: 100 })
  })
})

describe('pushedAlongAxis', () => {
  it('moves a fixed distance further along the real origin-to-point direction', () => {
    expect(pushedAlongAxis({ x: 10, y: 0 }, { x: 0, y: 0 }, 5)).toEqual({ x: 15, y: 0 })
    expect(pushedAlongAxis({ x: 0, y: -10 }, { x: 0, y: 0 }, 3)).toEqual({ x: 0, y: -13 })
  })

  it('respects an off-origin parent position', () => {
    expect(pushedAlongAxis({ x: 110, y: 100 }, { x: 100, y: 100 }, 10)).toEqual({ x: 120, y: 100 })
  })

  it('is a no-op (never divides by zero) when the two points coincide', () => {
    expect(pushedAlongAxis({ x: 5, y: 5 }, { x: 5, y: 5 }, 10)).toEqual({ x: 5, y: 5 })
  })
})
