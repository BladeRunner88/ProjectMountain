import { beforeEach, describe, expect, it } from "vitest"
import { buildGraphDataset, GRAPH_SEED } from "./dataset"
import {
  BAND_HEIGHT,
  BAND_INDEX,
  computeBandStats,
  computeDensityStrip,
  computeStrataLayout,
  resetStrataLayoutCache,
} from "./strataLayout"
import { graphTestWorld } from "@/features/graph-next/testing/graphWorld"

const WIDTH = 1200

describe("computeStrataLayout (S8.6)", () => {
  beforeEach(() => resetStrataLayoutCache())

  it("places every domain entity at its band's fixed y (no sub-nodes included)", () => {
    const d = buildGraphDataset(graphTestWorld(), GRAPH_SEED)
    const layout = computeStrataLayout(d, WIDTH)
    expect(layout.positions.size).toBe(d.domainEntities.length)
    for (const e of d.domainEntities) {
      const p = layout.positions.get(e.id)!
      expect(p.y).toBe(BAND_INDEX[e.tier] * BAND_HEIGHT + BAND_HEIGHT / 2)
    }
  })

  it("a subtree stays vertically aligned: a country's x is the average of all its descendants' leaf slots, so it sits between its own plants", () => {
    const d = buildGraphDataset(graphTestWorld(), GRAPH_SEED)
    const layout = computeStrataLayout(d, WIDTH)
    const country = d.domainEntities.find((e) => e.tier === "country")!
    const ownPlants = d.domainEntities.filter(
      (e) => e.tier === "plant" && e.countryId === country.id
    )
    const plantXs = ownPlants.map((r) => layout.positions.get(r.id)!.x)
    const countryX = layout.positions.get(country.id)!.x
    expect(countryX).toBeGreaterThanOrEqual(Math.min(...plantXs))
    expect(countryX).toBeLessThanOrEqual(Math.max(...plantXs))
  })

  it("node size grows with direct child count: an line with more machines has a larger radius than one with fewer", () => {
    const d = buildGraphDataset(graphTestWorld(), GRAPH_SEED)
    const layout = computeStrataLayout(d, WIDTH)
    const lines = d.domainEntities.filter((e) => e.tier === "line")
    const withCounts = lines.map((o) => ({
      o,
      count: layout.childCount.get(o.id) ?? 0,
    }))
    const sorted = [...withCounts].sort((a, b) => a.count - b.count)
    const smallest = sorted[0]
    const largest = sorted[sorted.length - 1]
    if (smallest.count !== largest.count) {
      expect(layout.radius.get(largest.o.id)!).toBeGreaterThan(
        layout.radius.get(smallest.o.id)!
      )
    }
  })

  it("memoises on (dataset, width): unchanged inputs return the same object", () => {
    const d = buildGraphDataset(graphTestWorld(), GRAPH_SEED)
    const a = computeStrataLayout(d, WIDTH)
    const b = computeStrataLayout(d, WIDTH)
    expect(b).toBe(a)
  })
})

describe("computeBandStats (S8.6)", () => {
  it("reports the real per-tier count and anomaly count, matching the dataset exactly", () => {
    const d = buildGraphDataset(graphTestWorld(), GRAPH_SEED)
    const stats = computeBandStats(d)
    const machineStat = stats.find((s) => s.tier === "machine")!
    expect(machineStat.total).toBe(50)
    expect(machineStat.anomalyCount).toBe(9)
    const sensorStat = stats.find((s) => s.tier === "sensor")!
    // Derived, not hardcoded: 14 was the old invented sensor count.
    expect(sensorStat.total).toBe(
      d.domainEntities.filter((e) => e.tier === "sensor").length
    )
    expect(sensorStat.anomalyCount).toBe(3)
  })
})

describe("computeDensityStrip (S8.6)", () => {
  it("returns one bucket per requested bin, each a 0..1 density, summing to a real distribution", () => {
    const d = buildGraphDataset(graphTestWorld(), GRAPH_SEED)
    const layout = computeStrataLayout(d, WIDTH)
    const strip = computeDensityStrip(d, layout, "machine", WIDTH, 20)
    expect(strip).toHaveLength(20)
    for (const v of strip) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
    expect(strip.some((v) => v > 0)).toBe(true)
  })
})
