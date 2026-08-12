import { describe, expect, it } from 'vitest'
import { buildGraphDataset, GRAPH_SEED } from './dataset'
import { buildSearchIndex, computeSearchMatches, firstSearchMatch } from './search'
import { serialFor } from './serial'

describe('graph/search (S8.8)', () => {
  const dataset = buildGraphDataset(GRAPH_SEED)
  const index = buildSearchIndex(dataset)

  it('an empty query matches nothing (null — "no active search")', () => {
    expect(computeSearchMatches(index, '')).toBeNull()
    expect(computeSearchMatches(index, '   ')).toBeNull()
  })

  it("matches a climber by their OWN name", () => {
    const climber = dataset.domainEntities.find((e) => e.tier === 'climber')!
    const matches = computeSearchMatches(index, climber.label.slice(0, 5))!
    expect(matches.has(climber.id)).toBe(true)
  })

  it('matches a climber by their serial', () => {
    const climber = dataset.domainEntities.find((e) => e.tier === 'climber')!
    const serial = serialFor(climber.id)
    const matches = computeSearchMatches(index, serial)!
    expect(matches.has(climber.id)).toBe(true)
  })

  it("matches a climber by their operator's name — a climber IS its own operator/route/region/country chain", () => {
    const climber = dataset.domainEntities.find((e) => e.tier === 'climber')!
    const operator = dataset.domainEntities.find((e) => e.id === climber.parentId)!
    const matches = computeSearchMatches(index, operator.label)!
    expect(matches.has(climber.id)).toBe(true)
    expect(matches.has(operator.id)).toBe(true)
  })

  it("matches a climber by their route and by their country (\"origin\")", () => {
    const climber = dataset.domainEntities.find((e) => e.tier === 'climber')!
    const operator = dataset.domainEntities.find((e) => e.id === climber.parentId)!
    const route = dataset.domainEntities.find((e) => e.id === operator.parentId)!
    const region = dataset.domainEntities.find((e) => e.id === route.parentId)!
    const country = dataset.domainEntities.find((e) => e.id === region.parentId)!

    expect(computeSearchMatches(index, route.label)!.has(climber.id)).toBe(true)
    expect(computeSearchMatches(index, country.label)!.has(climber.id)).toBe(true)
  })

  it('is case-insensitive', () => {
    const climber = dataset.domainEntities.find((e) => e.tier === 'climber')!
    const matches = computeSearchMatches(index, climber.label.toUpperCase())!
    expect(matches.has(climber.id)).toBe(true)
  })

  it('firstSearchMatch returns the first match in the dataset\'s own stable order', () => {
    const country = dataset.domainEntities.find((e) => e.tier === 'country')!
    // every entity's search text includes its own country's name somewhere up the chain — searching the
    // first country's name should return that SAME country itself first, since countries come first in
    // dataset.domainEntities and a country matches on its own label.
    const match = firstSearchMatch(dataset, index, country.label)
    expect(match).toBe(country.id)
  })

  it('a query matching nothing returns null from firstSearchMatch', () => {
    expect(firstSearchMatch(dataset, index, 'zzz-nonexistent-zzz')).toBeNull()
  })
})
