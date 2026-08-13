import { describe, expect, it } from 'vitest'
import { buildDataset } from './dataset'

describe('S9.6 rebuild — robust across seeds, not just seed 1', () => {
  for (const seed of [2, 7, 42, 12345]) {
    it(`builds cleanly for seed ${seed}`, () => {
      const d = buildDataset(seed)
      expect(d.identityCards.size).toBe(50)
      expect(d.personScoring.size).toBe(50)
      expect(d.conflicts).toHaveLength(6)
      const withConflict = Array.from(d.identityCards.values()).filter((c) => c.identity.ethnicityHasConflict)
      expect(withConflict).toHaveLength(1)
    })
  }
})
