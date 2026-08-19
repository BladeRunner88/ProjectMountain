import { describe, expect, it } from "vitest"

import { graphTestWorld } from "@/features/graph-next/testing/graphWorld"

import { buildGraphDataset, GRAPH_SEED, validateGraphDataset } from "./dataset"

describe("validateGraphDataset", () => {
  const dataset = buildGraphDataset(graphTestWorld(), GRAPH_SEED)

  it("passes a freshly built dataset", () => {
    expect(validateGraphDataset(dataset)).toEqual([])
  })

  it("catches a history link pointing at the machine's OWN plant", () => {
    // This invariant never fired once: `ownPlantOf` walked four hops through an
    // `operator` rung that no longer exists, so it returned null for every
    // machine and every comparison silently passed.
    const machine = dataset.domainEntities.find((e) => e.tier === "machine")!
    const line = dataset.domainEntities.find((e) => e.id === machine.parentId)!
    const ownPlantId = line.parentId!

    const violations = validateGraphDataset({
      ...dataset,
      historyLinks: [{ machineId: machine.id, plantId: ownPlantId }],
    })

    expect(violations.length).toBeGreaterThan(0)
    expect(violations.join(" ")).toContain(machine.id)
  })

  it("accepts a history link pointing at a DIFFERENT plant", () => {
    const machine = dataset.domainEntities.find((e) => e.tier === "machine")!
    const line = dataset.domainEntities.find((e) => e.id === machine.parentId)!
    const otherPlant = dataset.domainEntities.find(
      (e) => e.tier === "plant" && e.id !== line.parentId
    )!

    const violations = validateGraphDataset({
      ...dataset,
      historyLinks: [{ machineId: machine.id, plantId: otherPlant.id }],
    })

    expect(violations).toEqual([])
  })

  it("catches the worked example being marked anomalous", () => {
    // Checked by position now; the old literal `machine-0` could never match a
    // warehouse id, so this guard was permanently dead.
    const workedExample = dataset.domainEntities.find(
      (e) => e.tier === "machine"
    )!

    const violations = validateGraphDataset({
      ...dataset,
      anomalyMachineIds: [...dataset.anomalyMachineIds, workedExample.id],
    })

    expect(violations.join(" ")).toContain(workedExample.id)
  })
})
