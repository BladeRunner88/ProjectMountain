import { describe, expect, it } from "vitest"
import { buildDataset, tickOnce } from "./dataset"
import { applyConflictPolicy } from "./conflict"
import { confidence, provenance } from "./folds"
import { allTraced, latest } from "./graph"
import { Rng } from "./rng"
import { testWorld } from "../testing/world"

describe("buildDataset", () => {
  it("builds without dangling references and is deterministic for a given seed", () => {
    const a = buildDataset(testWorld(), 1)
    expect(a.machines).toHaveLength(50)
    // One stage per stage the pipeline actually runs, taken from the backend.
    // This drew twelve for a long time — Data Observer, Pattern Learning,
    // Intelligence Synthesis and the rest — none of which corresponded to
    // code, and each of which reported an invented throughput.
    expect(a.stages).toHaveLength(testWorld().stages.length)
    expect(a.stages.map((stage) => stage.name)).toEqual(
      testWorld().stages.map((stage) => stage.name)
    )
    // S9.12: sensor mesh split into the OT historian and the GPS
    // tracker, plus a new radio-check-in log and manual-observation feed —
    // eight sources total (Plant MES and service contractor kept
    // alongside the six Exposure names, see SOURCE_DEFS's own comment).
    expect(a.sources).toHaveLength(8)

    const b = buildDataset(testWorld(), 1)
    expect(b.headline.entitiesTracked.value).toBe(
      a.headline.entitiesTracked.value
    )
    expect(b.headline.meanConfidencePct.value).toBe(
      a.headline.meanConfidencePct.value
    )
  })

  it("every TracedValue in the graph has a walkable provenance (no dangling refs)", () => {
    buildDataset(testWorld(), 1)
    for (const tv of allTraced()) {
      expect(() => provenance(tv)).not.toThrow()
      expect(() => confidence(tv)).not.toThrow()
    }
  })

  it("has exactly one degraded source (Metrology lab), and a separate silent_sensor finding exists", () => {
    const d = buildDataset(testWorld(), 1)
    const degraded = d.sources.filter((s) => s.degraded)
    expect(degraded).toHaveLength(1)
    expect(degraded[0].def.name).toBe("Metrology lab")
    // The silent-sensor finding is about one line sensor within Sensor
    // mesh, not about Metrology lab being degraded — the two are deliberately
    // unrelated in this domain.
    expect(d.findings.some((f) => f.kind === "silent_sensor")).toBe(true)
  })

  // S9.6 fix: tickOnce used to re-randomise a source's "seconds ago" reading
  // independently every tick, so the reported delta was noise, not real
  // elapsed time. It must now be recomputed from a real anchor instant.
  it("tickOnce recomputes a degraded source's age from its own anchor, so it only ever grows", () => {
    const d = buildDataset(testWorld(), 1)
    const degraded = d.sources.find((s) => s.degraded)!
    const rng = new Rng(1)
    const before = degraded.lastSyncAgeSec.value
    // Force the degraded source to be the one ticked, regardless of what
    // rng.pick would otherwise choose, by ticking enough times that it's
    // certain to be selected at least once.
    for (let i = 0; i < 200; i++) tickOnce(d, rng)
    const after = (
      latest(degraded.lastSyncAgeSec) as typeof degraded.lastSyncAgeSec
    ).value
    expect(after).toBeGreaterThanOrEqual(before)
  })

  it("index 0 is the worked example, and one machine drives the outlier finding", () => {
    const d = buildDataset(testWorld(), 1)
    expect(d.machines[0].name.value).toBeTruthy()
    const outlierFinding = d.findings.find((f) => f.kind === "physiological_outlier")
    const outlier = d.machines.find((c) => c.findingId === outlierFinding?.id)
    expect(outlier).toBeDefined()
    expect(
      d.findings.some(
        (f) =>
          f.kind === "physiological_outlier" && f.entityLabel === outlier?.name.value
      )
    ).toBe(true)
  })

  it("has exactly two duplicate_identity findings (each a 3-way merge) and one conflicting_reading finding", () => {
    const d = buildDataset(testWorld(), 1)
    const dup = d.findings.filter((f) => f.kind === "duplicate_identity")
    expect(dup).toHaveLength(2)
    expect(
      d.findings.filter((f) => f.kind === "conflicting_reading")
    ).toHaveLength(1)
  })

  it("headline entitiesTracked is independent of any single source (the hover test case)", () => {
    const d = buildDataset(testWorld(), 1)
    // None of the five source ids should appear anywhere in entitiesTracked's provenance.
    const hops = provenance(d.headline.entitiesTracked).map((h) => h.summary)
    for (const s of d.sources) {
      expect(hops.some((h) => h.includes(s.def.name))).toBe(false)
    }
  })

  it("pipeline stage throughput reconciles down the chain (each stage derives from the previous)", () => {
    const d = buildDataset(testWorld(), 1)
    for (let i = 1; i < d.stages.length; i++) {
      const hops = provenance(d.stages[i].throughput)
      expect(hops.some((h) => h.id === d.stages[i - 1].throughput.id)).toBe(
        true
      )
    }
  })

  it("open issues count matches the number of findings, and needsYou counts sum correctly", () => {
    const d = buildDataset(testWorld(), 1)
    expect(d.headline.openIssues.value).toBe(d.findings.length)
    const totalNeedsYou = d.needsYou.reduce(
      (sum, row) => sum + row.count.value,
      0
    )
    expect(totalNeedsYou).toBeLessThanOrEqual(d.findings.length)
  })

  it("reports each stage's state as the backend reported it", () => {
    // Every stage in the fixture succeeded, so nothing should be shown as
    // catching up or degraded. The state used to be assigned by stage number,
    // which meant two stages were permanently "catching up" whether or not
    // anything had run.
    const d = buildDataset(testWorld(), 1)

    expect(d.stages.every((stage) => stage.state === "running")).toBe(true)
  })

  it("shows a failed run as degraded rather than as running", () => {
    const world = testWorld()
    const failed = {
      ...world,
      stages: world.stages.map((stage, index) =>
        index === 1 ? { ...stage, state: "failed" } : stage
      ),
    }

    const d = buildDataset(failed, 1)

    expect(d.stages[1].state).toBe("degraded")
  })

  it("carries the row count each stage actually processed", () => {
    const d = buildDataset(testWorld(), 1)
    const ingest = d.stages.find(
      (stage) => stage.name === "Ingest and normalise"
    )

    expect(ingest?.throughput.value).toBe(72384)
  })

  describe("conflicts (S9.4)", () => {
    it("seeds exactly six conflicts, covering all five named strategies (S9.6 adds a second highest-confidence one)", () => {
      const d = buildDataset(testWorld(), 1)
      expect(d.conflicts).toHaveLength(6)
      const strategies = new Set(d.conflicts.map((c) => c.policy.strategy))
      expect(strategies).toEqual(
        new Set([
          "human-required",
          "most-recent",
          "highest-confidence",
          "range-merge",
          "source-priority",
        ])
      )
    })

    it("the commissioning-date conflict belongs to the worked-example machine, resolves via source-priority, and drives a real Age dependent", () => {
      const d = buildDataset(testWorld(), 1)
      const dob = d.conflicts.find((c) => c.propertyLabel === "Date of birth")!
      expect(dob).toBeDefined()
      expect(dob.entityLabel).toBe(d.machines[0].name.value)
      expect(dob.policy.strategy).toBe("source-priority")
      expect(dob.resolved).not.toBeNull()
      expect(dob.resolved!.value).toBe(dob.a.value) // the CMMS's value, per source-priority
      expect(dob.a.value).not.toBe(dob.b.value) // genuinely conflicting, not a no-op fixture
      expect(dob.downstream).toHaveLength(1)
      expect(dob.downstream[0].label).toBe("Age")
    })

    it("the acceptance scenario: switching date of birth to most-recent visibly changes the resolved value AND the downstream age, on any day of the year", () => {
      const d = buildDataset(testWorld(), 1)
      const dob = d.conflicts.find((c) => c.propertyLabel === "Date of birth")!
      const ageBefore = dob.downstream[0].traced.value
      const mostRecent = dob.availablePolicies.find(
        (p) => p.strategy === "most-recent"
      )!

      applyConflictPolicy(dob, mostRecent)

      expect(dob.resolved!.value).toBe(dob.b.value) // register was recorded more recently
      expect(dob.resolved!.value).not.toBe(dob.a.value)
      const ageAfter = dob.downstream[0].traced.value
      expect(ageAfter).not.toBe(ageBefore) // the whole point of the acceptance scenario
    })

    it("the mountains-climbed conflict is human-required and sits unresolved", () => {
      const d = buildDataset(testWorld(), 1)
      const mountains = d.conflicts.find(
        (c) => c.propertyLabel === "Mountains climbed"
      )!
      expect(mountains).toBeDefined()
      expect(mountains.policy.strategy).toBe("human-required")
      expect(mountains.resolved).toBeNull()
    })

    it("the ambient-pressure conflict range-merges into an interval spanning both readings", () => {
      const d = buildDataset(testWorld(), 1)
      const pressure = d.conflicts.find(
        (c) => c.propertyLabel === "Ambient pressure"
      )!
      expect(pressure).toBeDefined()
      expect(pressure.policy.strategy).toBe("range-merge")
      const value = pressure.resolved!.value as { min: number; max: number }
      expect(value.min).toBe(
        Math.min(pressure.a.value as number, pressure.b.value as number)
      )
      expect(value.max).toBe(
        Math.max(pressure.a.value as number, pressure.b.value as number)
      )
    })

    it("every conflict keeps both inputs in the graph — nothing discarded", () => {
      const d = buildDataset(testWorld(), 1)
      for (const c of d.conflicts) {
        expect(allTraced().some((tv) => tv.id === c.a.id)).toBe(true)
        expect(allTraced().some((tv) => tv.id === c.b.id)).toBe(true)
      }
    })
  })
})
