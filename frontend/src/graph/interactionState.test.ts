import { describe, expect, it } from 'vitest'
import type { GraphEdge, GraphNode } from './adapter'
import { buildAdjacency, computeAncestorChain, computeMutualConnections, computeTierOrder } from './interactionState'

function node(partial: Partial<GraphNode> & Pick<GraphNode, 'id' | 'tier'>): GraphNode {
  return {
    type: 'route',
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

describe('buildAdjacency', () => {
  it('is bidirectional — both endpoints see each other regardless of edge direction', () => {
    const edges: GraphEdge[] = [{ id: 'e1', source: 'a', target: 'b', kind: 'parent', label: null }]
    const adj = buildAdjacency(edges)
    expect(adj.get('a')).toEqual(new Set(['b']))
    expect(adj.get('b')).toEqual(new Set(['a']))
  })

  it('accumulates multiple edges touching the same node', () => {
    const edges: GraphEdge[] = [
      { id: 'e1', source: 'a', target: 'b', kind: 'parent', label: null },
      { id: 'e2', source: 'a', target: 'c', kind: 'cross', label: null },
    ]
    const adj = buildAdjacency(edges)
    expect(adj.get('a')).toEqual(new Set(['b', 'c']))
  })

  it('a node with no edges is simply absent from the map', () => {
    const adj = buildAdjacency([])
    expect(adj.has('lonely')).toBe(false)
  })
})

describe('computeAncestorChain', () => {
  const nodes: GraphNode[] = [
    node({ id: 'country:A', tier: 'root', parentId: null }),
    node({ id: 'route:1', tier: 'parent', parentId: 'country:A' }),
    node({ id: 'operator:1', tier: 'parent', parentId: 'route:1' }),
    node({ id: 'climber:1', tier: 'child', parentId: 'operator:1' }),
  ]
  const nodeById = new Map(nodes.map((n) => [n.id, n]))

  it('includes the selected node itself, plus every ancestor up to the root', () => {
    const result = computeAncestorChain('climber:1', nodeById)
    expect(result.nodeIds).toEqual(new Set(['climber:1', 'operator:1', 'route:1', 'country:A']))
  })

  it('edge ids match adapter.ts\'s own "parent:<parentId>-><childId>" convention exactly', () => {
    const result = computeAncestorChain('climber:1', nodeById)
    expect(result.edgeIds).toEqual(new Set(['parent:operator:1->climber:1', 'parent:route:1->operator:1', 'parent:country:A->route:1']))
  })

  it('selecting a root gives just the root, no edges', () => {
    const result = computeAncestorChain('country:A', nodeById)
    expect(result.nodeIds).toEqual(new Set(['country:A']))
    expect(result.edgeIds.size).toBe(0)
  })

  it('an unknown node id resolves to an empty chain, not a throw', () => {
    const result = computeAncestorChain('does-not-exist', nodeById)
    expect(result.nodeIds.size).toBe(0)
  })
})

describe('computeMutualConnections', () => {
  it('only includes edges where BOTH endpoints are selected — not an ancestor trail', () => {
    const edges: GraphEdge[] = [
      { id: 'parent:a->b', source: 'a', target: 'b', kind: 'parent', label: null },
      { id: 'parent:a->c', source: 'a', target: 'c', kind: 'parent', label: null },
      { id: 'cross:b-d', source: 'b', target: 'd', kind: 'cross', label: null },
    ]
    const selected = new Set(['a', 'b'])
    const result = computeMutualConnections(selected, edges)
    expect(result.edgeIds).toEqual(new Set(['parent:a->b']))
    expect(result.nodeIds).toBe(selected)
  })

  it('no mutual edges at all if no two selected nodes are directly connected', () => {
    const edges: GraphEdge[] = [{ id: 'parent:a->b', source: 'a', target: 'b', kind: 'parent', label: null }]
    const result = computeMutualConnections(new Set(['a', 'c']), edges)
    expect(result.edgeIds.size).toBe(0)
  })
})

describe('computeTierOrder', () => {
  it('groups root, then parent, then child, then leaf, preserving each tier\'s own relative order', () => {
    const nodes: GraphNode[] = [
      node({ id: 'leaf:1', tier: 'leaf' }),
      node({ id: 'root:1', tier: 'root' }),
      node({ id: 'child:1', tier: 'child' }),
      node({ id: 'root:2', tier: 'root' }),
      node({ id: 'parent:1', tier: 'parent' }),
    ]
    const ordered = computeTierOrder(nodes).map((n) => n.id)
    expect(ordered).toEqual(['root:1', 'root:2', 'parent:1', 'child:1', 'leaf:1'])
  })

  it('does not mutate the input array', () => {
    const nodes: GraphNode[] = [node({ id: 'b', tier: 'leaf' }), node({ id: 'a', tier: 'root' })]
    const originalOrder = nodes.map((n) => n.id)
    computeTierOrder(nodes)
    expect(nodes.map((n) => n.id)).toEqual(originalOrder)
  })
})
