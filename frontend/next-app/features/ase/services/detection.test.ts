import { describe, expect, it } from "vitest"
import { buildDataset } from "./dataset"
import { confidence, provenance } from "./folds"
import {
  applySuppression,
  builtInRules,
  descendantNodeIds,
  dimOpacityFor,
  firingCount,
  needsTuning,
  simulateThreshold,
} from "./detection"
import { testWorld } from "../testing/world"

describe("detection (S9.9)", () => {
  it("NO CODE: every rule condition is a plain sentence, never a predicate or field name", () => {
    const rules = builtInRules()
    expect(rules).toHaveLength(12)
    for (const r of rules) {
      expect(r.conditionSentence.length).toBeGreaterThan(0)
      // No operator/predicate punctuation, no SCREAMING_CASE field names leaking into the sentence.
      expect(r.conditionSentence).not.toMatch(/[<>=]|_[A-Z]/)
      expect(/^[A-Z_0-9]+$/.test(r.label)).toBe(false)
    }
  })

  it("acceptance: exactly two rules sit below 60% accuracy, tagged needs tuning", () => {
    const rules = builtInRules()
    const tuning = rules.filter((r) => needsTuning(r))
    expect(tuning).toHaveLength(2)
    for (const r of tuning) expect(r.accuracy).toBeLessThan(0.6)
  })

  it("the dataset builds 17 real detections (16 firing, 1 pre-suppressed), each a real folded TracedValue", () => {
    const d = buildDataset(testWorld(), 1)
    const { detections } = d.detectionEngine
    expect(detections).toHaveLength(17)
    expect(detections.filter((det) => det.suppressed)).toHaveLength(1)
    expect(detections.filter((det) => !det.suppressed)).toHaveLength(16)
    for (const det of detections) {
      expect(() => provenance(det.valueTraced)).not.toThrow()
      expect(() => confidence(det.valueTraced)).not.toThrow()
      expect(det.series).toHaveLength(40)
      expect(det.series[det.series.length - 1].value).toBe(
        det.valueTraced.value
      )
    }
  })

  it("firingCount excludes suppressed detections and matches the rule table", () => {
    const d = buildDataset(testWorld(), 1)
    const { detectionEngine: engine } = d
    expect(firingCount(engine, "rule-low-oee")).toBe(4)
    expect(firingCount(engine, "rule-dangerous-vibration")).toBe(3)
    expect(firingCount(engine, "rule-high-vibration")).toBe(2)
    expect(firingCount(engine, "rule-climbing-too-fast")).toBe(2) // 3 real, 1 suppressed
    expect(firingCount(engine, "rule-not-enough-guides")).toBe(1)
    expect(firingCount(engine, "rule-sensor-quiet")).toBe(0)
    expect(firingCount(engine, "rule-effectiveness-collapse")).toBe(1)
    expect(firingCount(engine, "rule-workOrder-expired")).toBe(0)
    expect(firingCount(engine, "rule-low-battery")).toBe(2)
    expect(firingCount(engine, "rule-rope-partner-lost")).toBe(0)
    expect(firingCount(engine, "rule-pressure-mismatch")).toBe(1)
    expect(firingCount(engine, "rule-slow-processing")).toBe(0)
  })

  it("the map tree covers all 113 entities plus 14 sensors, five tiers", () => {
    const d = buildDataset(testWorld(), 1)
    const { mapNodes } = d.detectionEngine
    const byTier = (t: string) => mapNodes.filter((n) => n.tier === t).length
    expect(byTier("country")).toBe(5)
    expect(byTier("plantLine")).toBe(14)
    expect(byTier("operator")).toBe(30)
    expect(byTier("machine")).toBe(50)
    expect(byTier("sensor")).toBe(14)
  })

  it("propagation: a firing machine turns their operator, line and country to watch or anomaly — never left nominal", () => {
    const d = buildDataset(testWorld(), 1)
    const { mapNodes, detections } = d.detectionEngine
    const firing = detections.find(
      (det) => !det.suppressed && det.subject.kind === "machine"
    )!
    const machineNode = mapNodes.find(
      (n) => n.id === (firing.subject as { nodeId: string }).nodeId
    )!
    expect(machineNode.status).toBe("anomaly")

    const operatorNode = mapNodes.find((n) => n.id === machineNode.parentId)!
    expect(operatorNode.status).not.toBe("nominal")
    const lineNode = mapNodes.find((n) => n.id === operatorNode.parentId)!
    expect(lineNode.status).not.toBe("nominal")
    const countryNode = mapNodes.find((n) => n.id === lineNode.parentId)!
    expect(countryNode.status).not.toBe("nominal")
  })

  it("a node with no firing descendants stays nominal — propagation does not leak sideways", () => {
    const d = buildDataset(testWorld(), 1)
    const { mapNodes } = d.detectionEngine
    // rule-sensor-quiet and rule-workOrder-expired both fire zero times, so at
    // least some leaf machine/operator far from every firing subject must
    // still read nominal.
    const anyNominalMachine = mapNodes.some(
      (n) => n.tier === "machine" && n.status === "nominal"
    )
    expect(anyNominalMachine).toBe(true)
  })

  it("dimOpacityFor: with no rule selected everything is full opacity; with one selected, only its own firing nodes stay full", () => {
    const d = buildDataset(testWorld(), 1)
    const { mapNodes } = d.detectionEngine
    for (const n of mapNodes) expect(dimOpacityFor(n, null)).toBe(1)
    const firingNode = mapNodes.find((n) =>
      n.firingRuleIds.includes("rule-low-oee")
    )!
    const otherNode = mapNodes.find(
      (n) => n.tier === "machine" && !n.firingRuleIds.includes("rule-low-oee")
    )!
    expect(dimOpacityFor(firingNode, "rule-low-oee")).toBe(1)
    expect(dimOpacityFor(otherNode, "rule-low-oee")).toBeLessThan(1)
  })

  it("descendantNodeIds includes the root and every node beneath it, not siblings", () => {
    const d = buildDataset(testWorld(), 1)
    const { mapNodes } = d.detectionEngine
    const line = mapNodes.find((n) => n.tier === "plantLine")!
    const ids = descendantNodeIds(mapNodes, line.id)
    expect(ids.has(line.id)).toBe(true)
    const childOperator = mapNodes.find((n) => n.parentId === line.id)!
    expect(ids.has(childOperator.id)).toBe(true)
    const unrelatedCountry = mapNodes.find(
      (n) => n.tier === "country" && n.id !== line.parentId
    )!
    expect(ids.has(unrelatedCountry.id)).toBe(false)
  })

  it("acceptance: tightening a threshold genuinely recomputes firing count and names who changes", () => {
    const d = buildDataset(testWorld(), 1)
    const rule = d.detectionEngine.rules.find((r) => r.id === "rule-low-oee")!
    const population = d.detectionEngine.tuningPopulations.get(rule.id)!
    expect(population.length).toBe(50)

    const baseline = simulateThreshold(
      population,
      rule.thresholdDirection,
      rule.thresholdValue,
      rule.thresholdValue
    )
    const tightened = simulateThreshold(
      population,
      rule.thresholdDirection,
      rule.thresholdValue,
      rule.thresholdValue - 10
    ) // below 70% instead of below 80%
    const loosened = simulateThreshold(
      population,
      rule.thresholdDirection,
      rule.thresholdValue,
      rule.thresholdValue + 10
    ) // below 90%

    expect(tightened.firingCount).toBeLessThan(baseline.firingCount)
    expect(tightened.newlyCleared.length).toBeGreaterThan(0)
    expect(loosened.firingCount).toBeGreaterThan(baseline.firingCount)
    expect(loosened.newlyFlagged.length).toBeGreaterThan(0)
  })

  it("applySuppression is a real state transition: firing count drops, and the map re-propagates", () => {
    const d = buildDataset(testWorld(), 1)
    const engine = d.detectionEngine
    const target = engine.detections.find(
      (det) =>
        !det.suppressed &&
        det.subject.kind === "machine" &&
        det.ruleId === "rule-high-vibration"
    )!
    const before = firingCount(engine, "rule-high-vibration")

    const after = applySuppression(engine, {
      id: "test-suppression",
      ruleId: "rule-high-vibration",
      subject: target.subject,
      reason: "test",
      setBy: "test",
      setAt: target.detectedAt,
      expiresAt: target.detectedAt,
    })

    expect(firingCount(after, "rule-high-vibration")).toBe(before - 1)
    const node = after.mapNodes.find(
      (n) => n.id === (target.subject as { nodeId: string }).nodeId
    )!
    expect(node.firingRuleIds).not.toContain("rule-high-vibration")
  })

  it("is deterministic for a given seed", () => {
    const a = buildDataset(testWorld(), 1)
    const aValues = a.detectionEngine.detections.map(
      (det) => det.valueTraced.value
    )
    const b = buildDataset(testWorld(), 1)
    const bValues = b.detectionEngine.detections.map(
      (det) => det.valueTraced.value
    )
    expect(aValues).toEqual(bValues)
  })
})
