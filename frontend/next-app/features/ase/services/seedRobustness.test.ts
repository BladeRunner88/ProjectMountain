import { describe, expect, it } from "vitest"
import { buildDataset } from "./dataset"
import { testWorld } from "../testing/world"

describe("S9.6 rebuild — robust across seeds, not just seed 1", () => {
  for (const seed of [2, 7, 42, 12345]) {
    it(`builds cleanly for seed ${seed}`, () => {
      const d = buildDataset(testWorld(), seed)
      expect(d.identityCards.size).toBe(50)
      expect(d.personScoring.size).toBe(50)
      expect(d.conflicts).toHaveLength(6)
      const withConflict = Array.from(d.identityCards.values()).filter(
        (c) => c.identity.linePrefixHasConflict
      )
      expect(withConflict).toHaveLength(1)
    })
  }
})
