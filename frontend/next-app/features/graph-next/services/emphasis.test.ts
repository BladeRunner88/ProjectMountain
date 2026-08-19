import { describe, expect, it } from "vitest"
import { buildGraphDataset, GRAPH_SEED } from "./dataset"
import { buildHoverChainIndex } from "./hoverChain"
import {
  DIMMED_OPACITY,
  isFilterVisible,
  resolveEdgeOpacity,
  resolveOpacity,
  resolveSubNodeOpacity,
  type EmphasisContext,
} from "./emphasis"
import { graphTestWorld } from "@/features/graph-next/testing/graphWorld"

const EMPTY_CTX: EmphasisContext = {
  hoverChain: null,
  hoveredTier: null,
  focusChain: null,
  searchMatches: null,
}

describe("graph/emphasis (S8.8)", () => {
  const dataset = buildGraphDataset(graphTestWorld(), GRAPH_SEED)
  const index = buildHoverChainIndex(dataset)
  const machine = dataset.domainEntities.find((e) => e.tier === "machine")!
  const otherMachine = dataset.domainEntities.find(
    (e) => e.tier === "machine" && e.id !== machine.id
  )!
  const chain = index.get(machine.id)!

  it("resolveOpacity is full opacity with no active emphasis source", () => {
    expect(resolveOpacity(machine.id, "machine", EMPTY_CTX)).toBe(1)
  })

  it("a hover chain lights its own members, dims everything else to 8%", () => {
    const ctx: EmphasisContext = { ...EMPTY_CTX, hoverChain: chain }
    expect(resolveOpacity(machine.id, "machine", ctx)).toBe(1)
    expect(resolveOpacity(otherMachine.id, "machine", ctx)).toBe(DIMMED_OPACITY)
  })

  it("focus mode takes priority over hover chain", () => {
    const focusChain = {
      nodeIds: new Set([otherMachine.id]),
      edgeKeys: new Set<string>(),
    }
    const ctx: EmphasisContext = { ...EMPTY_CTX, hoverChain: chain, focusChain }
    // machine.id is in the hover chain but NOT the focus chain — focus wins, so it's dimmed
    expect(resolveOpacity(machine.id, "machine", ctx)).toBe(DIMMED_OPACITY)
    expect(resolveOpacity(otherMachine.id, "machine", ctx)).toBe(1)
  })

  it("search matches take priority over hover chain but not focus", () => {
    const ctx: EmphasisContext = {
      ...EMPTY_CTX,
      hoverChain: chain,
      searchMatches: new Set([otherMachine.id]),
    }
    expect(resolveOpacity(machine.id, "machine", ctx)).toBe(DIMMED_OPACITY)
    expect(resolveOpacity(otherMachine.id, "machine", ctx)).toBe(1)
  })

  it("hoveredTier dims every other tier when nothing higher-priority is active", () => {
    const ctx: EmphasisContext = { ...EMPTY_CTX, hoveredTier: "machine" }
    expect(resolveOpacity(machine.id, "machine", ctx)).toBe(1)
    const country = dataset.domainEntities.find((e) => e.tier === "country")!
    expect(resolveOpacity(country.id, "country", ctx)).toBe(DIMMED_OPACITY)
  })

  it("resolveEdgeOpacity follows the same priority chain, keyed on the edge and its target", () => {
    const key = [...chain.edgeKeys][0]
    const ctx: EmphasisContext = { ...EMPTY_CTX, hoverChain: chain }
    expect(resolveEdgeOpacity(key, machine.id, "machine", ctx)).toBe(1)
    expect(
      resolveEdgeOpacity("not-a-real-edge", machine.id, "machine", ctx)
    ).toBe(DIMMED_OPACITY)
  })

  describe("resolveSubNodeOpacity", () => {
    const sub = dataset.subNodes.find((s) => s.parentId === machine.id)!

    it("a sub-node stays lit when its OWN id is hovered directly", () => {
      const subChain = index.get(sub.id)!
      const ctx: EmphasisContext = { ...EMPTY_CTX, hoverChain: subChain }
      expect(resolveSubNodeOpacity(sub.id, sub.parentId, ctx)).toBe(1)
    })

    it("a sub-node stays lit when its PARENT is hovered — the entity's own attached records aren't \"everything else\"", () => {
      const ctx: EmphasisContext = { ...EMPTY_CTX, hoverChain: chain }
      expect(resolveSubNodeOpacity(sub.id, sub.parentId, ctx)).toBe(1)
    })

    it("a sub-node belonging to an unrelated entity dims", () => {
      const otherSub = dataset.subNodes.find(
        (s) => s.parentId === otherMachine.id
      )!
      const ctx: EmphasisContext = { ...EMPTY_CTX, hoverChain: chain }
      expect(resolveSubNodeOpacity(otherSub.id, otherSub.parentId, ctx)).toBe(
        DIMMED_OPACITY
      )
    })
  })

  describe("isFilterVisible", () => {
    it("null filter set means everything is visible", () => {
      expect(isFilterVisible(machine.id, null)).toBe(true)
    })
    it("a populated filter set only admits its own members", () => {
      const visible = new Set([machine.id])
      expect(isFilterVisible(machine.id, visible)).toBe(true)
      expect(isFilterVisible(otherMachine.id, visible)).toBe(false)
    })
  })
})
