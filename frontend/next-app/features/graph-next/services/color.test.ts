import { describe, expect, it } from "vitest"
import { buildGraphDataset, GRAPH_SEED } from "./dataset"
import { buildColorResolver } from "./color"
import { ANOMALY_RED } from "../types/tokens"
import { graphTestWorld } from "@/features/graph-next/testing/graphWorld"
import { countryHue } from "../types/tokens"

function lightnessOf(hsl: string): number {
  const m = /hsl\([\d.]+,\s*[\d.]+%,\s*([\d.]+)%\)/.exec(hsl)
  return m ? parseFloat(m[1]) : Number.NaN
}
function hueOf(hsl: string): number {
  const m = /hsl\(([\d.]+),/.exec(hsl)
  return m ? parseFloat(m[1]) : Number.NaN
}

describe("buildColorResolver (S8.5)", () => {
  const dataset = buildGraphDataset(graphTestWorld(), GRAPH_SEED)
  const colors = buildColorResolver(dataset)

  it("anomaly overrides hue entirely: every anomalous machine/sensor is the fixed anomaly red, regardless of country", () => {
    for (const id of [
      ...dataset.anomalyMachineIds,
      ...dataset.anomalySensorIds,
    ]) {
      expect(colors.colorFor(id)).toBe(ANOMALY_RED)
      expect(colors.glowFor(id)).toBe(true)
    }
  })

  it("every alert-status sub-node is the fixed anomaly red", () => {
    const alertSubs = dataset.subNodes.filter((s) => s.status === "alert")
    expect(alertSubs.length).toBeGreaterThan(0)
    for (const s of alertSubs) {
      expect(colors.colorFor(s.id)).toBe(ANOMALY_RED)
      expect(colors.glowFor(s.id)).toBe(true)
    }
  })

  it("a nominal node inherits its own country's hue — two entities under the same country share hue, and it differs from a different country's", () => {
    const countries = dataset.domainEntities.filter((e) => e.tier === "country")
    const [c1, c2] = countries
    const plant1 = dataset.domainEntities.find(
      (e) =>
        e.tier === "plant" && e.countryId === c1.id && e.status === "nominal"
    )!
    const plant2 = dataset.domainEntities.find(
      (e) =>
        e.tier === "plant" && e.countryId === c2.id && e.status === "nominal"
    )!
    expect(hueOf(colors.colorFor(plant1.id))).toBeCloseTo(
      hueOf(colors.colorFor(c1.id)),
      1
    )
    expect(hueOf(colors.colorFor(plant1.id))).not.toBeCloseTo(
      hueOf(colors.colorFor(plant2.id)),
      1
    )
  })

  it("lightness increases with depth: a nominal sub-node glows brighter than its own country entity", () => {
    const country = dataset.domainEntities.find((e) => e.tier === "country")!
    const sub = dataset.subNodes.find((s) => s.status === "nominal")!
    expect(lightnessOf(colors.colorFor(sub.id))).toBeGreaterThan(
      lightnessOf(colors.colorFor(country.id))
    )
  })

  it("an unresolvable id falls back to a defensive grey rather than throwing", () => {
    expect(() => colors.colorFor("does-not-exist")).not.toThrow()
    expect(colors.colorFor("does-not-exist")).toMatch(/^#/)
  })
})

describe("countryHue (S8.5 branch colour)", () => {
  // The countries the warehouse actually reports. See backend PLANTS.
  const REAL_COUNTRIES = [
    "Germany",
    "Czechia",
    "Mexico",
    "United Kingdom",
    "Sweden",
    "Canada",
  ]

  it("gives every real country a visually distinct hue", () => {
    // The whole point of the fix: a fixed palette keyed on an invented world's
    // countries collapsed all of these to one grey.
    const hues = REAL_COUNTRIES.map(countryHue).sort((a, b) => a - b)

    for (let i = 1; i < hues.length; i++) {
      expect(hues[i]! - hues[i - 1]!).toBeGreaterThan(10)
    }
  })

  it("is a pure function of the name — stable across calls", () => {
    expect(countryHue("Germany")).toBe(countryHue("Germany"))
  })

  it("gives different names different hues", () => {
    expect(countryHue("Germany")).not.toBe(countryHue("Czechia"))
  })

  it("never lands on the arcs reserved for history green or anomaly red", () => {
    // A country branch sharing history-green would have a viewer reading
    // "history" into an ordinary node.
    for (const country of [...REAL_COUNTRIES, "Japan", "Brazil", "Kenya"]) {
      const hue = countryHue(country)
      expect(Math.abs(hue - 145)).toBeGreaterThan(20)
      expect(Math.min(hue, 360 - hue)).toBeGreaterThan(15)
    }
  })

  it("handles a country name it has never seen", () => {
    // No lookup table means no unknown country.
    expect(countryHue("Somewhere New")).toBeGreaterThanOrEqual(0)
    expect(countryHue("Somewhere New")).toBeLessThan(360)
  })
})
