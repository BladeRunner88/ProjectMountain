import { describe, expect, it } from "vitest"
import { buildGraphDataset, GRAPH_SEED } from "./dataset"
import { buildHoverChainIndex } from "./hoverChain"
import { graphTestWorld } from "@/features/graph-next/testing/graphWorld"

describe("buildHoverChainIndex (S8.6/S8.8)", () => {
  const dataset = buildGraphDataset(graphTestWorld(), GRAPH_SEED)
  const index = buildHoverChainIndex(dataset)

  it("precomputes one entry per domain entity AND per sub-node — an O(1) lookup, not a walk", () => {
    expect(index.size).toBe(
      dataset.domainEntities.length + dataset.subNodes.length
    )
  })

  it("hovering a machine includes its line, plant and country — a continuous vertical path, per S8.6's acceptance line", () => {
    const machine = dataset.domainEntities.find((e) => e.tier === "machine")!
    const chain = index.get(machine.id)!
    // machine -> line -> plant -> country. These bindings previously assumed an
    // `operator` rung between machine and line, which no longer exists.
    const line = dataset.domainEntities.find(
      (e) => e.id === machine.parentId
    )!
    const plant = dataset.domainEntities.find((e) => e.id === line.parentId)!
    const country = dataset.domainEntities.find((e) => e.id === plant.parentId)!

    expect(chain.nodeIds.has(machine.id)).toBe(true)
    expect(chain.nodeIds.has(line.id)).toBe(true)
    expect(chain.nodeIds.has(plant.id)).toBe(true)
    expect(chain.nodeIds.has(country.id)).toBe(true)

    expect(chain.edgeKeys.has(`${line.id}->${machine.id}`)).toBe(true)
    expect(chain.edgeKeys.has(`${plant.id}->${line.id}`)).toBe(true)
    expect(chain.edgeKeys.has(`${country.id}->${plant.id}`)).toBe(true)
  })

  it("a country has no ancestors, so its chain is just itself", () => {
    const country = dataset.domainEntities.find((e) => e.tier === "country")!
    const chain = index.get(country.id)!
    expect(chain.nodeIds).toEqual(new Set([country.id]))
    expect(chain.edgeKeys.size).toBe(0)
  })

  it("a sub-node's chain is its parent's chain plus itself, not a fresh walk", () => {
    const sub = dataset.subNodes[0]
    const parentChain = index.get(sub.parentId)!
    const subChain = index.get(sub.id)!
    expect(subChain.nodeIds.has(sub.id)).toBe(true)
    expect(subChain.nodeIds.has(sub.parentId)).toBe(true)
    expect(subChain.edgeKeys).toBe(parentChain.edgeKeys) // literally the same Set instance, reused rather than recomputed
  })

  it("an unknown id has no entry", () => {
    expect(index.get("not-a-real-id")).toBeUndefined()
  })
})
