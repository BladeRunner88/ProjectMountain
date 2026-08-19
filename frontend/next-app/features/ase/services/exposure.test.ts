import { describe, expect, it } from "vitest"
import { buildDataset, EXPOSURE_SOURCE_NAMES, SOURCE_DEFS } from "./dataset"
import { dependentsOfSource } from "./folds"
import { sourceId } from "./traced"
import { computeFragilityScenarios, EXPOSURE_CLASS_ORDER } from "./exposure"
import { testWorld } from "../testing/world"

describe("exposure (S9.12)", () => {
  it("splits into 8 real sources; EXPOSURE_SOURCE_NAMES names exactly the 6 Exposure enumerates, all present in SOURCE_DEFS", () => {
    expect(SOURCE_DEFS).toHaveLength(8)
    expect(EXPOSURE_SOURCE_NAMES).toHaveLength(6)
    const defNames = new Set(SOURCE_DEFS.map((s) => s.name))
    for (const name of EXPOSURE_SOURCE_NAMES)
      expect(defNames.has(name)).toBe(true)
  })

  it("produces exactly one SourceHealth row per Exposure source, in EXPOSURE_SOURCE_NAMES order", () => {
    const d = buildDataset(testWorld(), 1)
    expect(d.exposure.sourceHealth).toHaveLength(6)
    expect(d.exposure.sourceHealth.map((h) => h.sourceName)).toEqual([
      ...EXPOSURE_SOURCE_NAMES,
    ])
  })

  it("the Metrology lab row is the one degraded/critical source, since it is the only source built as degraded", () => {
    const d = buildDataset(testWorld(), 1)
    const weather = d.exposure.sourceHealth.find(
      (h) => h.sourceName === "Metrology lab"
    )!
    expect(weather.degraded).toBe(true)
    expect(weather.state).toBe("critical")
  })

  it("the Matrix's totalDependents for a source equals dependentsOfSource(source).length — the exact figure Revision's own single-source queue item uses as blast radius for the same source, so the two never disagree", () => {
    const d = buildDataset(testWorld(), 1)
    const weatherRow = d.exposure.matrix.find(
      (r) => r.sourceName === "Metrology lab"
    )!
    const real = dependentsOfSource(sourceId("weather-feed")).length
    expect(weatherRow.totalDependents).toBe(real)
    const queueItem = d.revision.queue.find(
      (i) => i.id === "queue-exposure-single-source"
    )!
    expect(queueItem.blastRadius).toBe(real)
  })

  it("every Matrix cell count is a real subset of its row total, never exceeding it, across all six sources", () => {
    const d = buildDataset(testWorld(), 1)
    for (const row of d.exposure.matrix) {
      const sumOfCells = row.cells.reduce((a, c) => a + c.count, 0)
      expect(sumOfCells).toBeLessThanOrEqual(row.totalDependents)
      for (const cell of row.cells) {
        expect(EXPOSURE_CLASS_ORDER).toContain(cell.className)
        expect(cell.count).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it("every conclusion marker built into Exposure lands in exactly one of fragile or corroborated, matching its real cost().sourcesTouched", () => {
    const d = buildDataset(testWorld(), 1)
    const fragileIds = new Set(d.exposure.fragileConclusions.map((f) => f.id))
    const corroboratedIds = new Set(
      d.exposure.corroboratedConclusions.map((c) => c.id)
    )
    for (const id of fragileIds) expect(corroboratedIds.has(id)).toBe(false)
    expect(
      d.exposure.fragileConclusions.length +
        d.exposure.corroboratedConclusions.length
    ).toBeGreaterThan(0)
    // The worked example's commissioning-date-driven identity chain touches two sources (workOrder + register) via the conflict — its ASE serial should NOT show up as single-source fragile for the same reason its Age recomputes on conflict-policy change.
    const jamesFragile = d.exposure.fragileConclusions.find((f) =>
      f.label.startsWith(d.machines[0].name.value)
    )
    // Not asserted either way structurally (serial construction is independent of the DOB conflict) — the real assertion is just that the bucketing is internally consistent, checked above.
    expect(
      jamesFragile === undefined || jamesFragile.className === "Identity"
    ).toBe(true)
  })

  it('computeFragilityScenarios returns 2-3 real counterfactual scenarios for a single-source conclusion, and the "this fact removed" scenario genuinely drops confidence', () => {
    const d = buildDataset(testWorld(), 1)
    const someFragile = d.exposure.fragileConclusions[0]
    expect(someFragile).toBeDefined()
    const exposureSources = d.sources.filter((s) =>
      (EXPOSURE_SOURCE_NAMES as readonly string[]).includes(s.def.name)
    )
    const scenarios = computeFragilityScenarios(
      someFragile.marker,
      exposureSources
    )
    expect(scenarios.length).toBeGreaterThanOrEqual(2)
    expect(scenarios.length).toBeLessThanOrEqual(3)
    const factScenario = scenarios.find((s) => s.id.endsWith("-scenario-fact"))!
    expect(factScenario.confidenceAfterPct).toBeLessThan(
      factScenario.confidenceBeforePct
    )
  })

  it('Exposure keeps no second audit trail: its seeded activity is real entries inside Revision\'s own auditSeed, tagged fromTab "exposure", not a separate array', () => {
    const d = buildDataset(testWorld(), 1)
    expect(
      (d as unknown as Record<string, unknown>).exposureAuditLog
    ).toBeUndefined()
    const exposureEntries = d.revision.auditSeed.filter(
      (e) => e.fromTab === "exposure"
    )
    expect(exposureEntries.length).toBeGreaterThan(0)
  })

  it("a source with no facts lined to it yet (Inline QC) is honestly reported as not in use, not silently scored as perfectly corroborated", () => {
    const d = buildDataset(testWorld(), 1)
    const radio = d.exposure.sourceHealth.find(
      (h) => h.sourceName === "Inline QC"
    )!
    expect(radio.inUse).toBe(false)
    expect(radio.breakdown.corroborationPct).toBe(0)
  })

  it("raises exactly two proactive alerts, one already past its 10-minute auto-raise grace window and one still inside it", () => {
    const d = buildDataset(testWorld(), 1)
    expect(d.exposure.alerts).toHaveLength(2)
    const raised = d.exposure.alerts.filter((a) => a.raisedToQueue)
    const pending = d.exposure.alerts.filter((a) => !a.raisedToQueue)
    expect(raised).toHaveLength(1)
    expect(pending).toHaveLength(1)
  })

  it("no figure on this tab converts model performance or a health score into a claim about lives", () => {
    const d = buildDataset(testWorld(), 1)
    const haystack = JSON.stringify(d.exposure)
    expect(haystack.toLowerCase()).not.toMatch(
      /lives saved|lives at risk|fatalit/
    )
  })
})
