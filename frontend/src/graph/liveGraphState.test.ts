import { describe, expect, it } from 'vitest'
import type { GraphEdge, GraphNode } from './adapter'
import { edgesTo, propertiesChanged } from './liveGraphState'
import type { TracedValue } from '../ase/traced'

function tv(value: unknown, recordedAt: string): TracedValue<unknown> {
  return { id: `tv-${recordedAt}`, value, recordedAt, derivation: { kind: 'observed' } } as unknown as TracedValue<unknown>
}

function node(partial: Partial<GraphNode> & Pick<GraphNode, 'id'>): GraphNode {
  return {
    type: 'source',
    tier: 'leaf',
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

describe('propertiesChanged', () => {
  it('false for two nodes with identical property recordedAt stamps', () => {
    const a = node({ id: 'x', properties: { reliabilityPct: tv(0.9, 't1') } })
    const b = node({ id: 'x', properties: { reliabilityPct: tv(0.9, 't1') } })
    expect(propertiesChanged(a, b)).toBe(false)
  })

  it('true when a property was superseded (new recordedAt), even if the resolved value looks the same', () => {
    const a = node({ id: 'x', properties: { reliabilityPct: tv(0.9, 't1') } })
    const b = node({ id: 'x', properties: { reliabilityPct: tv(0.9, 't2') } })
    expect(propertiesChanged(a, b)).toBe(true)
  })

  it('true when a property is added or removed entirely', () => {
    const a = node({ id: 'x', properties: {} })
    const b = node({ id: 'x', properties: { reliabilityPct: tv(0.9, 't1') } })
    expect(propertiesChanged(a, b)).toBe(true)
  })

  it('false for two nodes with no properties at all', () => {
    const a = node({ id: 'x' })
    const b = node({ id: 'x' })
    expect(propertiesChanged(a, b)).toBe(false)
  })
})

describe('edgesTo', () => {
  it('returns the real edge object when it still exists in currentEdges', () => {
    const prev = new Map([['climber:1', node({ id: 'climber:1', parentId: 'operator:1' })]])
    const realEdge: GraphEdge = { id: 'parent:operator:1->climber:1', source: 'operator:1', target: 'climber:1', kind: 'parent', label: null }
    expect(edgesTo('climber:1', prev, [realEdge])).toBe(realEdge)
  })

  it('synthesizes a matching parent edge from the departing node\'s own parentId when the real edge is already gone', () => {
    const prev = new Map([['climber:1', node({ id: 'climber:1', parentId: 'operator:1' })]])
    const result = edgesTo('climber:1', prev, [])
    expect(result).toEqual({ id: 'parent:operator:1->climber:1', source: 'operator:1', target: 'climber:1', kind: 'parent', label: null })
  })

  it('returns null for a node that never had a parent', () => {
    const prev = new Map([['country:A', node({ id: 'country:A', parentId: null })]])
    expect(edgesTo('country:A', prev, [])).toBeNull()
  })

  it('returns null for an id not present in prevNodes at all', () => {
    expect(edgesTo('ghost', new Map(), [])).toBeNull()
  })
})
