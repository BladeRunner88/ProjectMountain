import { describe, expect, it } from "vitest"
import { buildGraphDataset, GRAPH_SEED } from "./dataset"
import { buildColorResolver } from "./color"
import {
  buildAnomalyPathEdgeKeys,
  buildEdgeAppearanceResolver,
} from "./edgeAppearance"
import { ANOMALY_RED } from "../types/tokens"
import { graphTestWorld } from "@/features/graph-next/testing/graphWorld"

describe("buildAnomalyPathEdgeKeys / buildEdgeAppearanceResolver (S8.5)", () => {
  const dataset = buildGraphDataset(graphTestWorld(), GRAPH_SEED)
  const colors = buildColorResolver(dataset)

  it("every hop from an anomalous machine up to its country is on the anomaly path, not just the final hop", () => {
    const keys = buildAnomalyPathEdgeKeys(dataset)
    const byId = new Map(dataset.domainEntities.map((e) => [e.id, e]))
    const machineId = dataset.anomalyMachineIds[0]
    let current = byId.get(machineId)!
    let hops = 0
    while (current.parentId !== null) {
      expect(keys.has(`${current.parentId}->${current.id}`)).toBe(true)
      current = byId.get(current.parentId)!
      hops++
    }
    // machine -> line -> plant -> country is 3 hops. Was 4, counting an
    // `operator` rung that no longer exists.
    expect(hops).toBe(3)
  })

  it("an edge whose target is anomalous renders anomaly red via the appearance resolver", () => {
    const appearanceFor = buildEdgeAppearanceResolver(dataset, colors)
    const byId = new Map(dataset.domainEntities.map((e) => [e.id, e]))
    const machineId = dataset.anomalyMachineIds[0]
    const machine = byId.get(machineId)!
    const a = appearanceFor(machine.parentId!, machineId, "operational")
    expect(a.color).toBe(ANOMALY_RED)
    expect(a.isAnomalyPath).toBe(true)
  })

  it("a structural edge into a plant with no anomalous descendant at all uses the branch colour, not red", () => {
    // "status: nominal" alone isn't enough to pick from — plants never
    // carry any status but 'nominal' (only machines/sensors do), yet a
    // plant can still be an ANCESTOR of an anomalous machine, which
    // correctly puts its incoming edge on the anomaly path (that's the
    // whole point of "every edge on the path to the core turns red"). This
    // test needs a plant genuinely off every anomaly path, not merely one
    // whose own status field says nominal.
    // Pinned seed. Nine anomalous machines are required to spread across at
    // least four lines and three countries, and with only six plants the
    // default seed happens to touch every one of them — leaving nothing clean
    // to assert against. This seed leaves at least one plant off every path.
    const cleanDataset = buildGraphDataset(graphTestWorld(), 8302)
    const cleanColors = buildColorResolver(cleanDataset)
    const anomalyKeys = buildAnomalyPathEdgeKeys(cleanDataset)
    const appearanceFor = buildEdgeAppearanceResolver(cleanDataset, cleanColors)
    const cleanPlant = cleanDataset.domainEntities.find(
      (e) => e.tier === "plant" && !anomalyKeys.has(`${e.parentId}->${e.id}`)
    )!
    expect(cleanPlant).toBeDefined()
    const a = appearanceFor(cleanPlant.parentId!, cleanPlant.id, "structural")
    expect(a.color).not.toBe(ANOMALY_RED)
    expect(a.isAnomalyPath).toBe(false)
  })
})
