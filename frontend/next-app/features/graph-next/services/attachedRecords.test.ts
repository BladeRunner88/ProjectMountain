import { describe, expect, it } from "vitest"
import { buildGraphDataset, GRAPH_SEED } from "./dataset"
import {
  computeFlaggedRecords,
  computeRecentRecords,
  computeRecordCounts,
} from "./attachedRecords"
import { graphTestWorld } from "@/features/graph-next/testing/graphWorld"

describe("graph/attachedRecords (S8.9)", () => {
  const dataset = buildGraphDataset(graphTestWorld(), GRAPH_SEED)
  const machine = dataset.domainEntities.find((e) => e.tier === "machine")!

  it("counts sum to the total number of that entity's own sub-nodes", () => {
    const counts = computeRecordCounts(dataset, machine.id)
    const sum = counts.reduce((a, c) => a + c.count, 0)
    const expected = dataset.subNodes.filter(
      (s) => s.parentId === machine.id
    ).length
    expect(sum).toBe(expected)
  })

  it("returns at most 10 records, sorted most-recent first", () => {
    const recent = computeRecentRecords(dataset, machine.id, 10)
    expect(recent.length).toBeLessThanOrEqual(10)
    for (let i = 1; i < recent.length; i++)
      expect(recent[i - 1].ts).toBeGreaterThanOrEqual(recent[i].ts)
  })

  it("every returned record actually belongs to the requested parent", () => {
    const recent = computeRecentRecords(dataset, machine.id, 10)
    for (const r of recent) expect(r.parentId).toBe(machine.id)
  })

  it("an id with no sub-nodes returns empty, not a throw", () => {
    expect(computeRecordCounts(dataset, "not-a-real-id")).toEqual([])
    expect(computeRecentRecords(dataset, "not-a-real-id")).toEqual([])
  })

  it("computeFlaggedRecords is exactly the alert-status subset of the same parent's records", () => {
    const anomalousMachineId = dataset.anomalyMachineIds[0]
    const flagged = computeFlaggedRecords(dataset, anomalousMachineId)
    for (const r of flagged) {
      expect(r.parentId).toBe(anomalousMachineId)
      expect(r.status).toBe("alert")
    }
    const expectedCount = dataset.subNodes.filter(
      (s) => s.parentId === anomalousMachineId && s.status === "alert"
    ).length
    expect(flagged.length).toBe(expectedCount)
  })
})
