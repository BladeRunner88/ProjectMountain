// THE PERTURBATION TEST (S2): change one source's reliability in the real
// dataset builder and every confidence that depends on it must move — the
// gate that proves `confidence()` is actually wired end to end through the
// real dataset, not just internally consistent with itself in isolation.
// Runs `buildDataset(testWorld())` directly now that a real dataset exists (S1f) —
// the version prior to this block used a small synthetic forest as a
// stand-in, since neither the dataset nor the tabs existed yet.

import { describe, expect, it } from "vitest"
import { buildDataset, SOURCE_DEFS } from "./dataset"
import {
  confidence,
  cost,
  counterfactual,
  dependentsOfSource,
  provenance,
  renderProvenance,
  sourceReliability,
  matchScore,
} from "./folds"
import { allTraced, clearRegistry } from "./graph"
import {
  derivationFnId,
  derived,
  instant,
  matchRuleId,
  merged,
  normalised,
  observed,
  sourceId,
  transformId,
  type TracedValue,
} from "./traced"
import { testWorld } from "../testing/world"

// Two independent buildDataset(testWorld()) calls never share TracedIds — traced.ts's
// id counter never resets, so the two builds' sequential ids don't line up.
// What DOES line up is construction ORDER: both builds run the identical
// sequence of builder calls (same RNG stream — buildDataset always rolls
// the dice even when overriding, see dataset.ts), so `allTraced()` from
// each build corresponds position-for-position. Compare by index, not id.
function snapshotConfidences(): number[] {
  return allTraced().map((tv) => confidence(tv))
}

function describeAt(tv: TracedValue<unknown>, index: number): string {
  const d = tv.derivation
  if (d.kind === "observed")
    return `#${index} observed ${d.source}/${d.rawField}`
  return `#${index} ${d.kind}`
}

describe("the perturbation test (real dataset)", () => {
  for (const def of SOURCE_DEFS) {
    it(`perturbing ${def.name}'s reliability moves every confidence that depends on it`, () => {
      buildDataset(testWorld(), 1)
      // Computed from the graph itself right after the baseline build —
      // never hand-written, per S1b/S2's own rule that the expectation in
      // this test can't itself be an authored number.
      const expectedDependents = dependentsOfSource(def.id).length
      const beforeNodes = allTraced()
      const before = snapshotConfidences()

      // A drastic drop (not just "a bit lower") so this source becomes the
      // binding minimum everywhere it's an input, regardless of what the
      // other four sources happen to roll for this seed.
      buildDataset(testWorld(), 1, { sourceReliability: { [def.name]: 0.02 } })
      const after = snapshotConfidences()

      expect(after.length).toBe(before.length) // same construction order/count, or the position-comparison itself would be invalid

      const moved: string[] = []
      for (let i = 0; i < before.length; i++) {
        if (before[i] !== after[i]) moved.push(describeAt(beforeNodes[i], i))
      }

      console.log(
        `perturbing ${def.name}: ${moved.length} value(s) moved (dependents-index predicted ${expectedDependents})`
      )
      if (moved.length > 0) {
        console.log(moved.slice(0, 15).join("\n"))
      }

      expect(moved.length).toBeGreaterThanOrEqual(expectedDependents)
      expect(moved.length).toBeGreaterThan(0)
    })
  }
})

describe("renderProvenance", () => {
  it("renders a chronological, natural-language sentence", () => {
    clearRegistry()
    const raw = observed(
      sourceId("workOrder-registry"),
      "issue_date",
      "2026-01-01",
      sourceReliability(0.9)
    )
    const norm = normalised(raw.id, transformId("reformat-date"), "2026-01-01")
    const other = observed(
      sourceId("other-source"),
      "issue_date",
      "2026-01-01",
      sourceReliability(0.85)
    )
    const mergedTv = merged(
      [norm.id, other.id],
      matchRuleId("same-person"),
      matchScore(0.9),
      "2026-01-01"
    )

    const sentence = renderProvenance(provenance(mergedTv))
    expect(sentence.startsWith("This came from workOrder-registry")).toBe(true)
    expect(sentence).toContain("reformat date")
    expect(sentence).toContain("merged with 1 other record")
    expect(sentence.endsWith(".")).toBe(true)
  })

  it("is empty for an empty hop list", () => {
    expect(renderProvenance([])).toBe("")
  })
})

describe("cost", () => {
  it("counts hops, distinct sources touched, and the oldest input age", () => {
    clearRegistry()
    const now = new Date("2026-01-01T12:00:00.000Z")
    const old = observed(sourceId("a"), "f", 1, sourceReliability(0.9), {
      recordedAt: instant("2026-01-01T00:00:00.000Z"),
    })
    const recent = observed(sourceId("b"), "f", 2, sourceReliability(0.9), {
      recordedAt: instant("2026-01-01T11:00:00.000Z"),
    })
    const combined = derived([old.id, recent.id], derivationFnId("combine"), 3)

    const result = cost(combined, now)
    expect(result.hops).toBe(3) // combined + old + recent
    expect(result.sourcesTouched).toBe(2)
    expect(result.oldestInputAgeMs).toBe(12 * 60 * 60 * 1000)
  })
})

describe("counterfactual", () => {
  it("removing the weaker of two merged inputs raises confidence, leaves value untouched", () => {
    clearRegistry()
    const a = observed(sourceId("a"), "f", 1, sourceReliability(0.9))
    const b = observed(sourceId("b"), "f", 1, sourceReliability(0.5))
    const mergedTv = merged(
      [a.id, b.id],
      matchRuleId("r"),
      matchScore(1),
      "value"
    )

    const baseline = confidence(mergedTv)
    const result = counterfactual(mergedTv, { remove: [b.id] })

    expect(result.changed).toBe(true)
    expect(result.confidence).toBeGreaterThan(baseline)
    expect(result.value).toBe("value")
  })

  it("overriding a value changes value, not confidence", () => {
    clearRegistry()
    const a = observed(sourceId("a"), "f", "original", sourceReliability(0.9))
    const result = counterfactual(a, {
      override: new Map([[a.id, "hypothetical"]]),
    })

    expect(result.value).toBe("hypothetical")
    expect(result.confidence).toBe(confidence(a))
    expect(result.changed).toBe(true)
  })

  it("mutates nothing — the real graph is unaffected after the call", () => {
    clearRegistry()
    const a = observed(sourceId("a"), "f", 1, sourceReliability(0.9))
    const b = observed(sourceId("b"), "f", 1, sourceReliability(0.5))
    const mergedTv = merged(
      [a.id, b.id],
      matchRuleId("r"),
      matchScore(1),
      "value"
    )
    const before = confidence(mergedTv)

    counterfactual(mergedTv, { remove: [b.id] })

    expect(confidence(mergedTv)).toBe(before)
  })
})
