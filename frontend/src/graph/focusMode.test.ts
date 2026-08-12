import { describe, expect, it } from 'vitest'
import { buildGraphDataset, GRAPH_SEED } from './dataset'
import { boundingBoxOf, computeTwoHopNeighbourhood, viewportToFit } from './focusMode'

describe('graph/focusMode (S8.8)', () => {
  const dataset = buildGraphDataset(GRAPH_SEED)

  it("a climber's two-hop neighbourhood reaches exactly its operator (1 hop) and the operator's other climbers + route (2 hops)", () => {
    const climber = dataset.domainEntities.find((e) => e.tier === 'climber')!
    const operator = dataset.domainEntities.find((e) => e.id === climber.parentId)!
    const route = dataset.domainEntities.find((e) => e.id === operator.parentId)!

    const chain = computeTwoHopNeighbourhood(dataset, climber.id)
    expect(chain.nodeIds.has(climber.id)).toBe(true)
    expect(chain.nodeIds.has(operator.id)).toBe(true) // 1 hop
    expect(chain.nodeIds.has(route.id)).toBe(true) // 2 hops, via the operator

    // a route on the OTHER side of the graph should not appear
    const distantRoute = dataset.domainEntities.find((e) => e.tier === 'route' && e.id !== route.id)!
    expect(chain.nodeIds.has(distantRoute.id)).toBe(false)
  })

  it('never includes filament edges (sub-node edges) — a neighbourhood of ENTITIES, not records', () => {
    const climber = dataset.domainEntities.find((e) => e.tier === 'climber')!
    const chain = computeTwoHopNeighbourhood(dataset, climber.id)
    const subNodeIds = new Set(dataset.subNodes.map((s) => s.id))
    for (const id of chain.nodeIds) expect(subNodeIds.has(id)).toBe(false)
  })

  it('a node with no dataset entry at all still returns itself, alone', () => {
    const chain = computeTwoHopNeighbourhood(dataset, 'not-a-real-id')
    expect(chain.nodeIds).toEqual(new Set(['not-a-real-id']))
  })

  describe('boundingBoxOf', () => {
    it('spans exactly the given points', () => {
      const layout = new Map([
        ['a', { x: 10, y: 20 }],
        ['b', { x: -5, y: 40 }],
        ['c', { x: 30, y: 0 }],
      ])
      const box = boundingBoxOf(layout, new Set(['a', 'b', 'c']))!
      expect(box).toEqual({ minX: -5, minY: 0, maxX: 30, maxY: 40 })
    })

    it('returns null when none of the ids resolve to a position', () => {
      const layout = new Map([['a', { x: 0, y: 0 }]])
      expect(boundingBoxOf(layout, new Set(['nope']))).toBeNull()
    })
  })

  describe('viewportToFit', () => {
    it('centres the box in the canvas', () => {
      const box = { minX: 0, minY: 0, maxX: 100, maxY: 100 }
      const vp = viewportToFit(box, { width: 800, height: 600 }, 0.3, 4)
      // the box's own centre (50, 50), projected through (worldPos*zoom + cx,cy), should land at the canvas centre
      expect(50 * vp.zoom + vp.cx).toBeCloseTo(400, 4)
      expect(50 * vp.zoom + vp.cy).toBeCloseTo(300, 4)
    })

    it('clamps the fitted zoom to the given band', () => {
      const tinyBox = { minX: 0, minY: 0, maxX: 1, maxY: 1 }
      const vp = viewportToFit(tinyBox, { width: 800, height: 600 }, 0.3, 4)
      expect(vp.zoom).toBe(4)

      const hugeBox = { minX: 0, minY: 0, maxX: 100000, maxY: 100000 }
      const vpHuge = viewportToFit(hugeBox, { width: 800, height: 600 }, 0.3, 4)
      expect(vpHuge.zoom).toBe(0.3)
    })
  })
})
