import { describe, expect, it } from 'vitest'
import { buildGraphDataset, GRAPH_SEED } from './dataset'
import { buildHoverChainIndex } from './hoverChain'

describe('buildHoverChainIndex (S8.6/S8.8)', () => {
  const dataset = buildGraphDataset(GRAPH_SEED)
  const index = buildHoverChainIndex(dataset)

  it('precomputes one entry per domain entity AND per sub-node — an O(1) lookup, not a walk', () => {
    expect(index.size).toBe(dataset.domainEntities.length + dataset.subNodes.length)
  })

  it("hovering a climber includes its operator, route, region and country — a continuous vertical path, per S8.6's acceptance line", () => {
    const climber = dataset.domainEntities.find((e) => e.tier === 'climber')!
    const chain = index.get(climber.id)!
    const operator = dataset.domainEntities.find((e) => e.id === climber.parentId)!
    const route = dataset.domainEntities.find((e) => e.id === operator.parentId)!
    const region = dataset.domainEntities.find((e) => e.id === route.parentId)!
    const country = dataset.domainEntities.find((e) => e.id === region.parentId)!

    expect(chain.nodeIds.has(climber.id)).toBe(true)
    expect(chain.nodeIds.has(operator.id)).toBe(true)
    expect(chain.nodeIds.has(route.id)).toBe(true)
    expect(chain.nodeIds.has(region.id)).toBe(true)
    expect(chain.nodeIds.has(country.id)).toBe(true)

    expect(chain.edgeKeys.has(`${operator.id}->${climber.id}`)).toBe(true)
    expect(chain.edgeKeys.has(`${route.id}->${operator.id}`)).toBe(true)
    expect(chain.edgeKeys.has(`${region.id}->${route.id}`)).toBe(true)
    expect(chain.edgeKeys.has(`${country.id}->${region.id}`)).toBe(true)
  })

  it('a country has no ancestors, so its chain is just itself', () => {
    const country = dataset.domainEntities.find((e) => e.tier === 'country')!
    const chain = index.get(country.id)!
    expect(chain.nodeIds).toEqual(new Set([country.id]))
    expect(chain.edgeKeys.size).toBe(0)
  })

  it("a sub-node's chain is its parent's chain plus itself, not a fresh walk", () => {
    const sub = dataset.subNodes[0]
    const parentChain = index.get(sub.parentId)!
    const subChain = index.get(sub.id)!
    expect(subChain.nodeIds.has(sub.id)).toBe(true)
    expect(subChain.nodeIds.has(sub.parentId)).toBe(true)
    expect(subChain.edgeKeys).toBe(parentChain.edgeKeys) // literally the same Set instance, reused rather than recomputed
  })

  it('an unknown id has no entry', () => {
    expect(index.get('not-a-real-id')).toBeUndefined()
  })
})
