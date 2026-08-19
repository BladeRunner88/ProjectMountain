import { describe, expect, it } from "vitest"
import { buildGraphDataset, GRAPH_SEED } from "./dataset"
import { computeFilterVisible, DEFAULT_FILTER } from "./filters"
import { computeWatchIds } from "./watchStatus"
import { graphTestWorld } from "@/features/graph-next/testing/graphWorld"

describe("graph/filters (S8.8)", () => {
  const dataset = buildGraphDataset(graphTestWorld(), GRAPH_SEED)

  it('"all" returns null — no filter active, nothing hidden', () => {
    expect(computeFilterVisible(dataset, DEFAULT_FILTER)).toBeNull()
  })

  it('"anomalies" admits exactly the anomalous entities', () => {
    const visible = computeFilterVisible(dataset, {
      kind: "anomalies",
      tier: null,
      countryId: null,
    })!
    for (const id of dataset.anomalyMachineIds)
      expect(visible.has(id)).toBe(true)
    for (const id of dataset.anomalySensorIds)
      expect(visible.has(id)).toBe(true)
    const nominalMachine = dataset.domainEntities.find(
      (e) => e.tier === "machine" && e.status === "nominal"
    )!
    expect(visible.has(nominalMachine.id)).toBe(false)
  })

  it('"watch" matches computeWatchIds exactly', () => {
    const visible = computeFilterVisible(dataset, {
      kind: "watch",
      tier: null,
      countryId: null,
    })!
    expect(visible).toEqual(new Set(computeWatchIds(dataset)))
  })

  it('"tier" admits only that tier', () => {
    const visible = computeFilterVisible(dataset, {
      kind: "tier",
      tier: "sensor",
      countryId: null,
    })!
    // Derived, not hardcoded: 14 was the old invented sensor count.
    expect(visible.size).toBe(
      dataset.domainEntities.filter((e) => e.tier === "sensor").length
    )
    for (const id of visible) {
      expect(dataset.domainEntities.find((e) => e.id === id)?.tier).toBe(
        "sensor"
      )
    }
  })

  it('"country" admits only entities under that country', () => {
    const country = dataset.domainEntities.find((e) => e.tier === "country")!
    const visible = computeFilterVisible(dataset, {
      kind: "country",
      tier: null,
      countryId: country.id,
    })!
    for (const id of visible) {
      expect(dataset.domainEntities.find((e) => e.id === id)?.countryId).toBe(
        country.id
      )
    }
    // every entity under this country is included, none from another
    const expectedCount = dataset.domainEntities.filter(
      (e) => e.countryId === country.id
    ).length
    expect(visible.size).toBe(expectedCount)
  })
})
