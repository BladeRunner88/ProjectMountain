import { describe, expect, it } from "vitest"
import { buildDataset } from "./dataset"
import { ACCESS_LEVEL_LABEL, securityPosture } from "./trust"
import { testWorld } from "../testing/world"

// S9.13: Trust's own coverage is deliberately the lowest on its own
// Quality panel (see ase/trust.ts's COVERAGE_BY_AREA — Trust: 9 tests).
// This file has exactly nine tests so that number stays true by
// construction rather than narrated, the same discipline every other
// number on this tab is held to.
describe("trust (S9.13)", () => {
  it("documents exactly seven decisions, IDs 1 through 7", () => {
    const d = buildDataset(testWorld(), 1)
    expect(d.trust.decisions).toHaveLength(7)
    expect(d.trust.decisions.map((x) => x.id).sort((a, b) => a - b)).toEqual([
      1, 2, 3, 4, 5, 6, 7,
    ])
  })

  it("decision 5 is superseded by decision 7, with a real reason recorded", () => {
    const d = buildDataset(testWorld(), 1)
    const five = d.trust.decisions.find((x) => x.id === 5)!
    expect(five.status).toBe("superseded")
    expect(five.supersededById).toBe(7)
    expect(five.supersededReason).toBeTruthy()
    expect(five.supersededReason!.length).toBeGreaterThan(20)
  })

  it("security posture is computed from the findings array, not hand-typed: at least four open, at least one high, level amber", () => {
    const d = buildDataset(testWorld(), 1)
    const posture = securityPosture(d.trust.securityFindings)
    expect(posture.openCount).toBeGreaterThanOrEqual(4)
    expect(posture.highCount).toBeGreaterThanOrEqual(1)
    expect(posture.level).toBe("amber")
  })

  it("the access control matrix renders a real label for every role against every tab, even where the level is none", () => {
    const d = buildDataset(testWorld(), 1)
    const { accessMatrix, accessMatrixTabs } = d.trust
    for (const role of Object.keys(
      accessMatrix
    ) as (keyof typeof accessMatrix)[]) {
      for (const tabId of accessMatrixTabs) {
        const level = accessMatrix[role][tabId] ?? "none"
        expect(ACCESS_LEVEL_LABEL[level]).toBeTruthy()
      }
    }
  })

  it("breach history discloses a near-miss and claims no confirmed breach", () => {
    const d = buildDataset(testWorld(), 1)
    expect(d.trust.breachHistory.some((b) => b.kind === "near-miss")).toBe(true)
    expect(
      d.trust.breachHistory.some((b) => b.kind === "confirmed-breach")
    ).toBe(false)
  })

  it("Trust's own coverage is the strict lowest among tested areas, and is not hidden", () => {
    const d = buildDataset(testWorld(), 1)
    const tested = d.trust.coverageByArea.filter((r) => r.tests > 0)
    const trust = tested.find((r) => r.area === "Trust")!
    const lowest = Math.min(...tested.map((r) => r.coveragePct))
    expect(trust.coveragePct).toBe(lowest)
  })

  it("ten product questions are kept separate from the domain questions, and exactly two are marked partial", () => {
    const d = buildDataset(testWorld(), 1)
    expect(d.trust.productQuestions).toHaveLength(10)
    expect(
      d.trust.productQuestions.filter((q) => q.status === "partial")
    ).toHaveLength(2)
  })

  it('performance budgets do not all say "Never" for last violation, and at least one has a real dated violation', () => {
    const d = buildDataset(testWorld(), 1)
    const budgets = d.trust.performanceBudgets
    expect(budgets.some((b) => b.lastViolation === "Never")).toBe(true)
    expect(
      budgets.some(
        (b) =>
          b.lastViolation !== "Never" &&
          /^\d{4}-\d{2}-\d{2}/.test(b.lastViolation)
      )
    ).toBe(true)
  })

  it("known limitations lists exactly six items, each with a non-empty link label", () => {
    const d = buildDataset(testWorld(), 1)
    expect(d.trust.knownLimitations).toHaveLength(6)
    for (const lim of d.trust.knownLimitations) {
      expect(lim.linkLabel.length).toBeGreaterThan(0)
    }
  })
})
