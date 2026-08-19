import { describe, expect, it } from "vitest"
import { buildDataset } from "./dataset"
import { confidence, counterfactual, dependents, provenance } from "./folds"
import {
  addHumanRule,
  allUnboundFieldKeys,
  builtInRules,
  perSourceCoverage,
  readingCoverage,
  systemWideCoverage,
} from "./contextEngine"
import { testWorld } from "../testing/world"

describe("contextEngine (S9.7 rebuild)", () => {
  it("builds one reading per source, each with a real bound/unbound split", () => {
    const d = buildDataset(testWorld(), 1)
    const { readings } = d.contextEngine
    expect(readings.length).toBeGreaterThanOrEqual(5)
    const sources = new Set(readings.map((r) => r.source))
    expect(sources).toEqual(
      new Set([
        "OT historian",
        "Metrology lab",
        "Service contractor",
        "CMMS",
        "Plant MES",
      ])
    )
    // FW stays unbound on the sensor-mesh reading — same demonstrated gap S9.7 has always kept.
    const sensor = readings.find((r) => r.source === "OT historian")!
    expect(sensor.unbound.map((u) => u.key)).toEqual(["FW"])
  })

  it("every bound field is a real `bound`-derivation TracedValue, walkable and foldable", () => {
    const d = buildDataset(testWorld(), 1)
    for (const reading of d.contextEngine.readings) {
      for (const b of reading.bound) {
        expect(b.traced.derivation.kind).toBe("bound")
        expect(() => provenance(b.traced)).not.toThrow()
        expect(() => confidence(b.traced)).not.toThrow()
      }
    }
  })

  it("THE RULE THAT FIXES THE WHOLE TAB: every rule leads with a plain meaning, not a raw field name", () => {
    const rules = builtInRules()
    for (const rule of rules) {
      expect(rule.meaningStatement.length).toBeGreaterThan(0)
      // A meaning statement is prose, never just the bare SCREAMING_CASE field key standing in for one.
      expect(rule.meaningStatement).not.toBe(rule.fieldKey)
      expect(/^[A-Z_0-9]+$/.test(rule.meaningStatement)).toBe(false)
    }
  })

  it("rules cover all four entity groups, and at least one is FROM A HUMAN", () => {
    const rules = builtInRules()
    const groups = new Set(rules.map((r) => r.entityType))
    expect(groups).toEqual(new Set(["Machine", "Line", "Sensor", "Operator"]))
    expect(rules.some((r) => r.origin === "human")).toBe(true)
  })

  it("each reading names who or what it concerns — machine readings carry a real serial from identityRecords", () => {
    const d = buildDataset(testWorld(), 1)
    for (const reading of d.contextEngine.readings) {
      if (reading.about.kind !== "machine") continue
      const record = d.identityRecords.get(reading.about.machineId)
      expect(record).toBeDefined()
      expect(reading.about.serial).toBe(record!.serial.value)
      expect(reading.about.label).toBe(record!.who.fullLegalName.value)
    }
  })

  it("per-reading coverage is real math", () => {
    const d = buildDataset(testWorld(), 1)
    const sensor = d.contextEngine.readings.find(
      (r) => r.source === "OT historian"
    )!
    const cov = readingCoverage(sensor)
    expect(cov.boundFields).toBe(sensor.bound.length)
    expect(cov.totalFields).toBe(sensor.bound.length + sensor.unbound.length)
    expect(cov.pct).toBe(Math.round((cov.boundFields / cov.totalFields) * 100))
  })

  it("system-wide coverage aggregates every reading, not just one payload", () => {
    const d = buildDataset(testWorld(), 1)
    const system = systemWideCoverage(d.contextEngine)
    const totalAcrossReadings = d.contextEngine.readings.reduce(
      (n, r) => n + r.bound.length + r.unbound.length,
      0
    )
    const boundAcrossReadings = d.contextEngine.readings.reduce(
      (n, r) => n + r.bound.length,
      0
    )
    expect(system.totalFields).toBe(totalAcrossReadings)
    expect(system.boundFields).toBe(boundAcrossReadings)
    // Exactly one unbound field system-wide (FW) given every other reading is fully bound.
    expect(system.totalFields - system.boundFields).toBe(1)
  })

  it("per-source coverage breaks out fields received/bound/still-unbound for each source", () => {
    const d = buildDataset(testWorld(), 1)
    const rows = perSourceCoverage(d.contextEngine)
    const sensorRow = rows.find((r) => r.source === "OT historian")!
    expect(sensorRow.stillUnbound).toEqual(["FW"])
    expect(sensorRow.pct).toBeLessThan(100)
    const weatherRow = rows.find((r) => r.source === "Metrology lab")!
    expect(weatherRow.stillUnbound).toEqual([])
    expect(weatherRow.pct).toBe(100)
  })

  it("acceptance: adding a rule for FW moves both the per-reading and system-wide coverage figures", () => {
    const d = buildDataset(testWorld(), 1)
    const before = d.contextEngine
    const beforeSensor = before.readings.find(
      (r) => r.source === "OT historian"
    )!
    const beforeCov = readingCoverage(beforeSensor)
    const beforeSystem = systemWideCoverage(before)

    const after = addHumanRule(
      before,
      "FW",
      "Sensor firmware version",
      "Sensor",
      "Human correction, added just now"
    )
    const afterSensor = after.readings.find(
      (r) => r.source === "OT historian"
    )!
    expect(afterSensor.unbound).toHaveLength(0)
    const fwBound = afterSensor.bound.find((b) => b.fieldKey === "FW")!
    expect(fwBound.traced.value).toContain("Sensor firmware version")

    const afterCov = readingCoverage(afterSensor)
    expect(afterCov.pct).toBeGreaterThan(beforeCov.pct)
    expect(afterCov.pct).toBe(100)

    const afterSystem = systemWideCoverage(after)
    expect(afterSystem.pct).toBeGreaterThan(beforeSystem.pct)
    expect(afterSystem.pct).toBe(100)

    const rule = after.rules.find((r) => r.fieldKey === "FW")!
    expect(rule.origin).toBe("human")
    expect(allUnboundFieldKeys(after)).toHaveLength(0)
  })

  it("addHumanRule is a no-op for a field that is not unbound anywhere", () => {
    const d = buildDataset(testWorld(), 1)
    const before = d.contextEngine
    const after = addHumanRule(
      before,
      "NOT_A_REAL_FIELD",
      "nonsense",
      "Machine",
      "nobody"
    )
    expect(after).toBe(before)
  })

  it("is deterministic for a given seed", () => {
    const a = buildDataset(testWorld(), 1)
    const aValues = a.contextEngine.readings.map((r) =>
      r.bound.map((b) => b.traced.value)
    )
    const b = buildDataset(testWorld(), 1)
    const bValues = b.contextEngine.readings.map((r) =>
      r.bound.map((b) => b.traced.value)
    )
    expect(aValues).toEqual(bValues)
  })

  describe("the outlier machine's historian reading really shares TracedValues with reasoning.ts and Detection", () => {
    it("its OEE_VAL raw fact is the exact node the physiological_outlier finding depends on", () => {
      const d = buildDataset(testWorld(), 1)
      const sensor = d.contextEngine.readings.find(
        (r) => r.source === "OT historian"
      )!
      const oeeRaw = sensor.rawFieldTvs.get("OEE_VAL")!
      const finding = d.findings.find(
        (f) => f.kind === "physiological_outlier"
      )!
      expect(dependents(oeeRaw.id)).toContain(finding.traced.id)
    })

    it("IMPACT-style counterfactual: removing this reading's OEE_VAL is a real recomputation, not a no-op fabrication", () => {
      const d = buildDataset(testWorld(), 1)
      const sensor = d.contextEngine.readings.find(
        (r) => r.source === "OT historian"
      )!
      const oeeRaw = sensor.rawFieldTvs.get("OEE_VAL")!
      const finding = d.findings.find(
        (f) => f.kind === "physiological_outlier"
      )!
      const baseline = confidence(finding.traced)

      // The finding is `inferred` from [oeeRaw, baselineOee] — whichever
      // of the two has the LOWER real confidence is the one whose removal
      // actually moves the result (S9.8's own "limiting step" lesson
      // applies here too). Removing BOTH always collapses fully; that's
      // the one assertion that can't depend on which source rolled lower.
      const withoutOee = counterfactual(finding.traced, {
        remove: [oeeRaw.id],
      })
      const withoutBoth = counterfactual(finding.traced, {
        remove: [
          oeeRaw.id,
          ...(finding.traced.derivation.kind === "inferred"
            ? finding.traced.derivation.from.filter((id) => id !== oeeRaw.id)
            : []),
        ],
      })
      expect(withoutOee.confidence).toBeLessThanOrEqual(baseline)
      expect(withoutBoth.confidence).toBe(0)
      expect(withoutBoth.changed).toBe(true)
    })
  })
})
