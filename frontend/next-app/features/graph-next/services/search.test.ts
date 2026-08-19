import { describe, expect, it } from "vitest"
import { buildGraphDataset, GRAPH_SEED } from "./dataset"
import {
  buildSearchIndex,
  computeSearchMatches,
  firstSearchMatch,
} from "./search"
import { serialFor } from "./serial"
import { graphTestWorld } from "@/features/graph-next/testing/graphWorld"

describe("graph/search (S8.8)", () => {
  const dataset = buildGraphDataset(graphTestWorld(), GRAPH_SEED)
  const index = buildSearchIndex(dataset)

  it('an empty query matches nothing (null — "no active search")', () => {
    expect(computeSearchMatches(index, "")).toBeNull()
    expect(computeSearchMatches(index, "   ")).toBeNull()
  })

  it("matches a machine by their OWN name", () => {
    const machine = dataset.domainEntities.find((e) => e.tier === "machine")!
    const matches = computeSearchMatches(index, machine.label.slice(0, 5))!
    expect(matches.has(machine.id)).toBe(true)
  })

  it("matches a machine by their serial", () => {
    const machine = dataset.domainEntities.find((e) => e.tier === "machine")!
    const serial = serialFor(machine.id)
    const matches = computeSearchMatches(index, serial)!
    expect(matches.has(machine.id)).toBe(true)
  })

  it("matches a machine by its line's name — a machine IS its own line/plant/country chain", () => {
    const machine = dataset.domainEntities.find((e) => e.tier === "machine")!
    const line = dataset.domainEntities.find((e) => e.id === machine.parentId)!

    const matches = computeSearchMatches(index, line.label)!

    expect(matches.has(machine.id)).toBe(true)
    expect(matches.has(line.id)).toBe(true)
  })

  it('matches a machine by their line and by their country ("origin")', () => {
    // machine -> line -> plant -> country. These bindings previously assumed an
    // `operator` rung between machine and line, which no longer exists.
    const machine = dataset.domainEntities.find((e) => e.tier === "machine")!
    const line = dataset.domainEntities.find((e) => e.id === machine.parentId)!
    const plant = dataset.domainEntities.find((e) => e.id === line.parentId)!
    const country = dataset.domainEntities.find((e) => e.id === plant.parentId)!

    expect(computeSearchMatches(index, line.label)!.has(machine.id)).toBe(true)
    expect(computeSearchMatches(index, country.label)!.has(machine.id)).toBe(
      true
    )
  })

  it("is case-insensitive", () => {
    const machine = dataset.domainEntities.find((e) => e.tier === "machine")!
    const matches = computeSearchMatches(index, machine.label.toUpperCase())!
    expect(matches.has(machine.id)).toBe(true)
  })

  it("firstSearchMatch returns the first match in the dataset's own stable order", () => {
    const country = dataset.domainEntities.find((e) => e.tier === "country")!
    // every entity's search text includes its own country's name somewhere up the chain — searching the
    // first country's name should return that SAME country itself first, since countries come first in
    // dataset.domainEntities and a country matches on its own label.
    const match = firstSearchMatch(dataset, index, country.label)
    expect(match).toBe(country.id)
  })

  it("a query matching nothing returns null from firstSearchMatch", () => {
    expect(firstSearchMatch(dataset, index, "zzz-nonexistent-zzz")).toBeNull()
  })
})
