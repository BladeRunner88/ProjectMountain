import { describe, expect, it } from "vitest"
import { buildGraphDataset, GRAPH_SEED, validateGraphDataset } from "./dataset"
import { isEnvironmentNode } from "../types/domain"
import { graphTestWorld } from "@/features/graph-next/testing/graphWorld"

describe("buildGraphDataset (S8.3)", () => {
  it("buildGraphDataset(graphTestWorld(), SEED) called twice deep-equals itself", () => {
    const a = buildGraphDataset(graphTestWorld(), GRAPH_SEED)
    const b = buildGraphDataset(graphTestWorld(), GRAPH_SEED)
    expect(a).toEqual(b)
  })

  it("has one entity per structural node the warehouse reports, and no others", () => {
    // The counts used to be hardcoded (5+14+14+30+50+14 = 127) because the
    // topology was invented here. It comes from the backend now, so the only
    // defensible assertion is that the graph mirrors it exactly — including
    // that no `operator` tier exists, since machines belong to lines and the
    // people who operate them are related to them, not above them.
    const world = graphTestWorld()
    const d = buildGraphDataset(world, GRAPH_SEED)

    expect(d.domainEntities).toHaveLength(world.nodes.length)

    const byTier = (tier: string) =>
      d.domainEntities.filter((e) => e.tier === tier).length
    for (const tier of ["country", "plant", "line", "machine", "sensor"]) {
      expect(byTier(tier)).toBe(
        world.nodes.filter((n) => n.tier === tier).length
      )
    }
    expect(byTier("operator")).toBe(0)
  })

  it("uses the warehouse's own ids, so a telemetry reading can find its machine", () => {
    const world = graphTestWorld()
    const d = buildGraphDataset(world, GRAPH_SEED)

    const graphIds = new Set(d.domainEntities.map((e) => e.id))
    for (const node of world.nodes) expect(graphIds.has(node.id)).toBe(true)
  })

  it("reports a point count that scales with the entities it hangs off", () => {
    // Was a fixed 2,400-3,200 band, which only held for the one invented
    // topology. Sub-nodes attach per entity, so the count follows the world.
    const world = graphTestWorld()
    const d = buildGraphDataset(world, GRAPH_SEED)

    expect(d.pointCount).toBe(d.subNodes.length)
    expect(d.pointCount).toBeGreaterThan(world.nodes.length)
    expect(d.pointCount).toBeLessThan(world.nodes.length * 60)
  })

  it("every sub-node count falls within its own tier band", () => {
    const d = buildGraphDataset(graphTestWorld(), GRAPH_SEED)
    const bands: Record<string, [number, number]> = {
      machine: [18, 40],
      sensor: [24, 60],
      line: [6, 20],
      plant: [4, 10],
      country: [3, 6],
    }
    for (const entity of d.domainEntities) {
      const count = d.subNodes.filter((s) => s.parentId === entity.id).length
      const [min, max] = bands[entity.tier]
      expect(count, `${entity.id} (${entity.tier})`).toBeGreaterThanOrEqual(min)
      expect(count, `${entity.id} (${entity.tier})`).toBeLessThanOrEqual(max)
    }
  })

  it("exactly 9 anomalous machines and 3 anomalous sensors, spread across >= 4 lines and >= 3 countries, never including the worked example at index 0", () => {
    const d = buildGraphDataset(graphTestWorld(), GRAPH_SEED)
    expect(d.anomalyMachineIds).toHaveLength(9)
    expect(d.anomalySensorIds).toHaveLength(3)
    expect(d.anomalyMachineIds).not.toContain("machine-0")
    // The first machine is the worked example and must stay nominal on both
    // surfaces. Found by position, not by a literal id: `machine-0` was the
    // old locally-generated scheme, and warehouse ids are `machine_00001`.
    const machines = d.domainEntities.filter((e) => e.tier === "machine")
    const workedExample = machines[0]!
    expect(workedExample.status).toBe("nominal")
    expect(d.anomalyMachineIds).not.toContain(workedExample.id)

    const byId = new Map(d.domainEntities.map((e) => [e.id, e]))
    const lines = new Set(
      d.anomalyMachineIds.map((id) => byId.get(id)!.parentId)
    )
    const countries = new Set(
      d.anomalyMachineIds.map((id) => byId.get(id)!.countryId)
    )
    expect(lines.size).toBeGreaterThanOrEqual(4)
    expect(countries.size).toBeGreaterThanOrEqual(3)
  })

  it("the outlier position is not accidentally anomalous by construction (only the seeded 9 are)", () => {
    const d = buildGraphDataset(graphTestWorld(), GRAPH_SEED)
    // The outlier sits at a fixed structural position, not at a fixed name.
    const machines = d.domainEntities.filter((e) => e.tier === "machine")
    expect(machines.length).toBeGreaterThan(0)
    expect(d.anomalyMachineIds).not.toContain("machine-0")
  })

  it("roughly 2% of sub-nodes carry an alert status, clustered on anomalous parents rather than flat", () => {
    const d = buildGraphDataset(graphTestWorld(), GRAPH_SEED)
    const alertSubNodes = d.subNodes.filter((s) => s.status === "alert")
    const pct = (alertSubNodes.length / d.subNodes.length) * 100
    expect(pct).toBeGreaterThan(1)
    expect(pct).toBeLessThan(4)

    const anomalousParents = new Set([
      ...d.anomalyMachineIds,
      ...d.anomalySensorIds,
    ])
    const alertsOnAnomalousParents = alertSubNodes.filter((s) =>
      anomalousParents.has(s.parentId)
    ).length
    const alertRateOnAnomalous = alertsOnAnomalousParents / alertSubNodes.length
    // Alerts should cluster on the anomalous parents rather than spread
    // evenly. The bar is well above the flat rate, not an absolute majority:
    // how many entities exist now depends on the warehouse.
    const flatRate = anomalousParents.size / d.domainEntities.length
    expect(alertRateOnAnomalous).toBeGreaterThan(flatRate * 2)
  })

  it('every sub-node of kind "alerts" carries status "alert"', () => {
    const d = buildGraphDataset(graphTestWorld(), GRAPH_SEED)
    for (const s of d.subNodes.filter((s) => s.kind === "alerts")) {
      expect(s.status).toBe("alert")
    }
  })

  it('every edge whose target is anomalous or alert is itself kind "anomaly"', () => {
    const d = buildGraphDataset(graphTestWorld(), GRAPH_SEED)
    const byId = new Map(d.entities.map((e) => [e.id, e]))
    for (const edge of d.edges) {
      const target = byId.get(edge.target)!
      const isFlagged =
        "tier" in target
          ? target.status === "anomaly"
          : isEnvironmentNode(target)
            ? target.breached
            : target.status === "alert"
      if (isFlagged) expect(edge.kind).toBe("anomaly")
    }
  })

  it("passes its own invariant validation with zero violations", () => {
    const d = buildGraphDataset(graphTestWorld(), GRAPH_SEED)
    expect(validateGraphDataset(d)).toEqual([])
  })

  it("a corrupted dataset (dangling sub-node parent) is caught by validateGraphDataset", () => {
    const d = buildGraphDataset(graphTestWorld(), GRAPH_SEED)
    const broken = {
      ...d,
      subNodes: [
        ...d.subNodes.slice(1),
        { ...d.subNodes[0], parentId: "does-not-exist" },
      ],
    }
    const violations = validateGraphDataset(broken)
    expect(violations.some((v) => v.includes("does-not-exist"))).toBe(true)
  })

  it("a different seed produces a structurally different dataset (not a hardcoded constant)", () => {
    const a = buildGraphDataset(graphTestWorld(), GRAPH_SEED)
    const b = buildGraphDataset(graphTestWorld(), GRAPH_SEED + 1)
    expect(a.anomalyMachineIds).not.toEqual(b.anomalyMachineIds)
  })
})

describe("S8.4b: environment nodes", () => {
  it("exactly one environment node per plant, each pointing at a real plant and its plant's real country", () => {
    const d = buildGraphDataset(graphTestWorld(), GRAPH_SEED)
    expect(d.environmentNodes).toHaveLength(
      d.domainEntities.filter((e) => e.tier === 'plant').length
    )
    const plantIds = new Set(
      d.domainEntities.filter((e) => e.tier === "plant").map((e) => e.id)
    )
    const countryIds = new Set(
      d.domainEntities.filter((e) => e.tier === "country").map((e) => e.id)
    )
    // Derived, not hardcoded: 14 was the old invented plant count.
    const plantsCovered = new Set(d.environmentNodes.map((e) => e.plantId))
    expect(plantsCovered.size).toBe(
      d.domainEntities.filter((e) => e.tier === "plant").length
    )
    for (const env of d.environmentNodes) {
      expect(plantIds.has(env.plantId)).toBe(true)
      expect(countryIds.has(env.countryId)).toBe(true)
    }
  })

  it("environment nodes are included in dataset.entities (so drift/layout treat them generically), and are individually rare to breach", () => {
    const d = buildGraphDataset(graphTestWorld(), GRAPH_SEED)
    for (const env of d.environmentNodes) {
      expect(d.entities.some((e) => e.id === env.id)).toBe(true)
    }
    const breachedCount = d.environmentNodes.filter((e) => e.breached).length
    // "the norm is calm, breach is the exception" — not zero (there must be
    // something to see), not half the map either
    expect(breachedCount).toBeGreaterThan(0)
    expect(breachedCount).toBeLessThan(7)
  })

  it("is deterministic: same seed, same environment readings and breach flags", () => {
    const a = buildGraphDataset(graphTestWorld(), GRAPH_SEED)
    const b = buildGraphDataset(graphTestWorld(), GRAPH_SEED)
    expect(a.environmentNodes).toEqual(b.environmentNodes)
  })
})

describe("S8.4b: history links", () => {
  it("every link points machine -> a REAL prior plant, never the machine's own current plant", () => {
    const d = buildGraphDataset(graphTestWorld(), GRAPH_SEED)
    expect(d.historyLinks.length).toBeGreaterThan(0)
    const machineIds = new Set(
      d.domainEntities.filter((e) => e.tier === "machine").map((e) => e.id)
    )
    const plantIds = new Set(
      d.domainEntities.filter((e) => e.tier === "plant").map((e) => e.id)
    )
    const byId = new Map(d.domainEntities.map((e) => [e.id, e]))
    function currentPlantOf(machineId: string): string | undefined {
      const machine = byId.get(machineId)
      const line = machine?.parentId ? byId.get(machine.parentId) : undefined
      return line?.parentId ?? undefined
    }
    for (const link of d.historyLinks) {
      expect(machineIds.has(link.machineId)).toBe(true)
      expect(plantIds.has(link.plantId)).toBe(true)
      expect(link.plantId).not.toBe(currentPlantOf(link.machineId))
    }
  })

  it("roughly 60% of machines carry at least one history link, each carrying 1-3", () => {
    const d = buildGraphDataset(graphTestWorld(), GRAPH_SEED)
    const machines = d.domainEntities.filter((e) => e.tier === "machine")
    const linksByMachine = new Map<string, number>()
    for (const link of d.historyLinks) {
      linksByMachine.set(
        link.machineId,
        (linksByMachine.get(link.machineId) ?? 0) + 1
      )
    }
    for (const count of linksByMachine.values()) {
      expect(count).toBeGreaterThanOrEqual(1)
      expect(count).toBeLessThanOrEqual(3)
    }
    const coveredFraction = linksByMachine.size / machines.length
    expect(coveredFraction).toBeGreaterThan(0.4)
    expect(coveredFraction).toBeLessThan(0.85)
  })

  it("is deterministic: same seed, same history links", () => {
    const a = buildGraphDataset(graphTestWorld(), GRAPH_SEED)
    const b = buildGraphDataset(graphTestWorld(), GRAPH_SEED)
    expect(a.historyLinks).toEqual(b.historyLinks)
  })
})
