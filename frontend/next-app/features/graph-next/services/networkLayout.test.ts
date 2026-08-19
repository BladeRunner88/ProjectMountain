import { beforeEach, describe, expect, it } from "vitest"
import { buildGraphDataset, GRAPH_SEED } from "./dataset"
import { networkLayout, resetNetworkLayoutCache } from "./networkLayout"
import { graphTestWorld } from "@/features/graph-next/testing/graphWorld"

const SIZE = { width: 1000, height: 800 }

describe("networkLayout (S8.4/8.5)", () => {
  beforeEach(() => resetNetworkLayoutCache())

  it("produces a finite position for every node in the dataset, no NaN", () => {
    const d = buildGraphDataset(graphTestWorld(), GRAPH_SEED)
    const positions = networkLayout(d, SIZE)
    expect(positions.size).toBe(d.entities.length)
    for (const p of positions.values()) {
      expect(Number.isFinite(p.x)).toBe(true)
      expect(Number.isFinite(p.y)).toBe(true)
    }
  })

  it("is deterministic: the same dataset and size always produce the same positions", () => {
    const d = buildGraphDataset(graphTestWorld(), GRAPH_SEED)
    const a = networkLayout(d, SIZE)
    resetNetworkLayoutCache()
    const b = networkLayout(d, SIZE)
    for (const [id, p] of a) {
      expect(b.get(id)).toEqual(p)
    }
  })

  it("reads as dendritic: countries sit near the centre, machines further out", () => {
    const d = buildGraphDataset(graphTestWorld(), GRAPH_SEED)
    const positions = networkLayout(d, SIZE)
    const cx = SIZE.width / 2
    const cy = SIZE.height / 2
    function radiusOf(id: string) {
      const p = positions.get(id)!
      return Math.hypot(p.x - cx, p.y - cy)
    }
    const countryRadii = d.domainEntities
      .filter((e) => e.tier === "country")
      .map((e) => radiusOf(e.id))
    const machineRadii = d.domainEntities
      .filter((e) => e.tier === "machine")
      .map((e) => radiusOf(e.id))
    const subNodeRadii = d.subNodes.slice(0, 200).map((s) => radiusOf(s.id))

    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
    expect(avg(countryRadii)).toBeLessThan(avg(machineRadii))

    // Deliberately NOT `avg(machineRadii) < avg(subNodeRadii)`. A sub-node
    // radiates from its own parent, so a country's sub-node sits well inside
    // a machine — the global averages only happened to order correctly for
    // one set of ids, and stopped when the ids changed. The invariant that
    // actually holds is per-parent, and the next test asserts it.
    expect(subNodeRadii.length).toBeGreaterThan(0)
  })

  it("a sub-node sits further from the centre than its own parent (radiates outward from the entity, not from the graph centre)", () => {
    const d = buildGraphDataset(graphTestWorld(), GRAPH_SEED)
    const positions = networkLayout(d, SIZE)
    const cx = SIZE.width / 2
    const cy = SIZE.height / 2
    const dist = (id: string) => {
      const p = positions.get(id)!
      return Math.hypot(p.x - cx, p.y - cy)
    }
    for (const sub of d.subNodes.slice(0, 50)) {
      expect(dist(sub.id)).toBeGreaterThan(dist(sub.parentId))
    }
  })

  it("memoises: an unchanged (dataset, size) pair returns the exact same Map reference", () => {
    const d = buildGraphDataset(graphTestWorld(), GRAPH_SEED)
    const a = networkLayout(d, SIZE)
    const b = networkLayout(d, SIZE)
    expect(b).toBe(a)
  })

  it("a degenerate size returns the previous layout rather than an empty one", () => {
    const d = buildGraphDataset(graphTestWorld(), GRAPH_SEED)
    const good = networkLayout(d, SIZE)
    const after = networkLayout(d, { width: 0, height: 0 })
    expect(after).toBe(good)
  })

  it("S8.4b: every environment node gets a position, offset sideways from its plant rather than sitting on top of it", () => {
    const d = buildGraphDataset(graphTestWorld(), GRAPH_SEED)
    const positions = networkLayout(d, SIZE)
    expect(d.environmentNodes.length).toBeGreaterThan(0)
    for (const env of d.environmentNodes) {
      const envPos = positions.get(env.id)
      const plantPos = positions.get(env.plantId)
      expect(envPos).toBeDefined()
      expect(plantPos).toBeDefined()
      const dist = Math.hypot(envPos!.x - plantPos!.x, envPos!.y - plantPos!.y)
      // the offset is a fixed 90px local displacement, so the resolved
      // distance from its own plant should land close to that regardless
      // of where the plant itself ended up on the ring
      expect(dist).toBeGreaterThan(80)
      expect(dist).toBeLessThan(100)
    }
  })

  it("S8.4b: is deterministic across repeated builds, same as every other node", () => {
    const d = buildGraphDataset(graphTestWorld(), GRAPH_SEED)
    const a = networkLayout(d, SIZE)
    resetNetworkLayoutCache()
    const b = networkLayout(d, SIZE)
    for (const env of d.environmentNodes) {
      expect(b.get(env.id)).toEqual(a.get(env.id))
    }
  })
})
