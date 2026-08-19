import { describe, expect, it } from "vitest"
import { buildGraphDataset, GRAPH_SEED } from "./dataset"
import {
  loadAt,
  buildMachinePlacements,
  buildLineConditions,
  buildLineProfiles,
  defaultLineId,
  summarizeLineMachines,
} from "./terrainProfile"
import { graphTestWorld } from "@/features/graph-next/testing/graphWorld"

describe("terrainProfile (S8.7)", () => {
  const dataset = buildGraphDataset(graphTestWorld(), GRAPH_SEED)
  const profiles = buildLineProfiles(dataset)

  it("builds one profile per line, deterministically", () => {
    expect(profiles.size).toBe(14)
    const again = buildLineProfiles(dataset)
    for (const [id, p] of profiles) expect(again.get(id)).toEqual(p)
  })

  it("every profile has a real rampUp: entry < crux and crux is between entry and exit", () => {
    for (const p of profiles.values()) {
      expect(p.entryLoadM).toBeLessThan(p.exitLoadM)
      expect(p.cruxLoadM).toBeGreaterThan(p.entryLoadM)
      expect(p.cruxLoadM).toBeLessThan(p.exitLoadM)
      expect(p.cruxProgress).toBeGreaterThan(0)
      expect(p.cruxProgress).toBeLessThan(1)
    }
  })

  it("loadAt reproduces entry/crux/exit exactly at their own progress values", () => {
    const p = [...profiles.values()][0]
    expect(loadAt(p, 0)).toBeCloseTo(p.entryLoadM, 5)
    expect(loadAt(p, p.cruxProgress)).toBeCloseTo(p.cruxLoadM, 5)
    expect(loadAt(p, 1)).toBeCloseTo(p.exitLoadM, 5)
  })

  it("conditions are deterministic and within instrument-plausible ranges", () => {
    const lineId = [...profiles.keys()][0]
    const a = buildLineConditions(lineId)
    const b = buildLineConditions(lineId)
    expect(a).toEqual(b)
    expect(a.vibrationMmS).toBeGreaterThanOrEqual(12)
    expect(a.tempC).toBeLessThan(0)
    expect(a.oeePct).toBeGreaterThan(0)
  })

  describe("machine placement", () => {
    const placements = buildMachinePlacements(dataset, profiles)

    it("places every one of the 50 machines on some line", () => {
      expect(placements.size).toBe(50)
      for (const p of placements.values()) {
        expect(profiles.has(p.lineId)).toBe(true)
        expect(p.progress).toBeGreaterThanOrEqual(0)
        expect(p.progress).toBeLessThanOrEqual(1)
        expect(p.lateral).toBeGreaterThanOrEqual(-1)
        expect(p.lateral).toBeLessThanOrEqual(1)
      }
    })

    it("the trail's last point is exactly the machine's current position", () => {
      for (const p of placements.values()) {
        const last = p.trail[p.trail.length - 1]
        expect(last.progress).toBeCloseTo(p.progress, 5)
        expect(last.lateral).toBeCloseTo(p.lateral, 5)
      }
    })

    it('an anomalous machine is never also flagged "watch" — anomaly overrides, it does not stack with it', () => {
      for (const machineId of dataset.anomalyMachineIds) {
        expect(placements.get(machineId)?.watch).toBe(false)
      }
    })

    it("defaultLineId opens on a line that actually has an anomaly on it", () => {
      const lineId = defaultLineId(dataset, placements)
      const summary = summarizeLineMachines(dataset, placements, lineId)
      expect(summary.anomalyCount).toBeGreaterThan(0)
    })

    it("summarizeLineMachines' per-station counts sum to the line total", () => {
      const lineId = defaultLineId(dataset, placements)
      const summary = summarizeLineMachines(dataset, placements, lineId)
      const sum = summary.byStation.reduce((acc, c) => acc + c.count, 0)
      expect(sum).toBe(summary.totalOnLine)
    })
  })
})
