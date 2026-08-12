import { describe, expect, it } from 'vitest'
import { buildGraphDataset, GRAPH_SEED } from './dataset'
import { nextEntity, siblingInTier } from './keyboardNav'

describe('graph/keyboardNav (S8.8)', () => {
  const dataset = buildGraphDataset(GRAPH_SEED)

  describe('nextEntity — Tab cycles all 127 entities', () => {
    it('with no current id, forward starts at the first entity and backward at the last', () => {
      expect(nextEntity(dataset, null, 1)).toBe(dataset.domainEntities[0].id)
      expect(nextEntity(dataset, null, -1)).toBe(dataset.domainEntities[dataset.domainEntities.length - 1].id)
    })

    it('steps forward and backward through the dataset order', () => {
      const first = dataset.domainEntities[0].id
      const second = dataset.domainEntities[1].id
      expect(nextEntity(dataset, first, 1)).toBe(second)
      expect(nextEntity(dataset, second, -1)).toBe(first)
    })

    it('wraps at both ends', () => {
      const first = dataset.domainEntities[0].id
      const last = dataset.domainEntities[dataset.domainEntities.length - 1].id
      expect(nextEntity(dataset, last, 1)).toBe(first)
      expect(nextEntity(dataset, first, -1)).toBe(last)
    })

    it('an unknown current id resets to the first entity', () => {
      expect(nextEntity(dataset, 'not-a-real-id', 1)).toBe(dataset.domainEntities[0].id)
    })
  })

  describe('siblingInTier — arrows move within a tier', () => {
    it('moves to another climber, never a different tier', () => {
      const climber = dataset.domainEntities.find((e) => e.tier === 'climber')!
      const next = siblingInTier(dataset, climber.id, 1)!
      const nextEntityObj = dataset.domainEntities.find((e) => e.id === next)!
      expect(nextEntityObj.tier).toBe('climber')
      expect(next).not.toBe(climber.id)
    })

    it('wraps within the tier', () => {
      const countries = dataset.domainEntities.filter((e) => e.tier === 'country')
      expect(siblingInTier(dataset, countries[countries.length - 1].id, 1)).toBe(countries[0].id)
      expect(siblingInTier(dataset, countries[0].id, -1)).toBe(countries[countries.length - 1].id)
    })

    it('an unknown id returns null', () => {
      expect(siblingInTier(dataset, 'not-a-real-id', 1)).toBeNull()
    })
  })
})
