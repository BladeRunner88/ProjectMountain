import { describe, expect, it } from "vitest"

import {
  hierarchyResponseSchema,
  ontologyResponseSchema,
  sourceResponseSchema,
  stageResponseSchema,
} from "../schemas/world"
import { nodesOfTier, WORLD_TIERS, type AseWorld } from "../types/world"

describe("world response schemas", () => {
  it("accepts a source that has never been ingested", () => {
    // A configured feed the pipeline has not seen yet still appears, with no
    // reliability at all — which is not the same as a reliability of zero.
    const parsed = sourceResponseSchema.safeParse([
      {
        source_file: "mes_platform.json",
        owner: "Plant MES",
        department: "Manufacturing execution",
        format: "json",
        describes: "asset register",
        last_sync_at: null,
        reliability: null,
      },
    ])

    expect(parsed.success).toBe(true)
  })

  it("accepts a measured reliability", () => {
    const parsed = sourceResponseSchema.safeParse([
      {
        source_file: "qc_lab.csv",
        owner: "Metrology lab",
        department: "Quality station B",
        format: "csv",
        describes: "batch dispositions",
        last_sync_at: "2026-08-18T09:33:03+00:00",
        reliability: {
          value: 0.9978,
          records: 8000,
          failed: 18,
          degraded: true,
        },
      },
    ])

    expect(parsed.success).toBe(true)
  })

  it("rejects a stage with no run record shape", () => {
    const parsed = stageResponseSchema.safeParse([
      { order: 1, name: "Generate", description: "x", state: "ok" },
    ])

    expect(parsed.success).toBe(false)
  })

  it("accepts a stage that has never run", () => {
    const parsed = stageResponseSchema.safeParse([
      {
        order: 1,
        name: "Generate",
        description: "x",
        state: "never-run",
        last_run_at: null,
        duration_seconds: null,
        records: { value: null },
      },
    ])

    expect(parsed.success).toBe(true)
  })

  it("accepts a hierarchy node with no parent", () => {
    const parsed = hierarchyResponseSchema.safeParse({
      nodes: [
        {
          id: "country:Germany",
          tier: "country",
          label: "Germany",
          parent_id: null,
          plant: null,
          country: "Germany",
          status: "nominal",
          child_count: 1,
          descendant_machines: 94,
        },
      ],
      tiers: ["country"],
      truncated: false,
    })

    expect(parsed.success).toBe(true)
  })

  it("rejects an ontology type with no instance count", () => {
    const parsed = ontologyResponseSchema.safeParse({
      object_types: [{ name: "Machine", properties: ["name"] }],
      relationship_types: [],
    })

    expect(parsed.success).toBe(false)
  })
})

describe("world tiers", () => {
  const world: AseWorld = {
    sources: [],
    stages: [],
    operators: [],
    ontology: { objectTypes: [], relationshipTypes: [] },
    nodes: [
      node("plant_01", "plant"),
      node("machine_00001", "machine"),
      node("machine_00002", "machine"),
    ],
  }

  it("declares only tiers the data actually has", () => {
    // There is no "cell" tier: no vendor feed records one, and adding a level
    // of hierarchy to fill a gap in a diagram would be inventing entities.
    expect(WORLD_TIERS).not.toContain("cell")
    expect(WORLD_TIERS).toEqual([
      "country",
      "plant",
      "line",
      "machine",
      "sensor",
    ])
  })

  it("selects the nodes of one tier", () => {
    expect(nodesOfTier(world, "machine").map((n) => n.id)).toEqual([
      "machine_00001",
      "machine_00002",
    ])
  })

  it("returns nothing for a tier with no nodes", () => {
    expect(nodesOfTier(world, "sensor")).toEqual([])
  })
})

function node(id: string, tier: string) {
  return {
    id,
    tier,
    label: id,
    parentId: null,
    plant: null,
    country: null,
    status: "nominal",
    childCount: 0,
    descendantMachines: 0,
  }
}
