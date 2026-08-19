import { z } from "zod"

import type { AseWorld } from "../types/world"

const reliabilitySchema = z.object({
  value: z.number(),
  records: z.number(),
  failed: z.number(),
  degraded: z.boolean(),
})

/** `/sources` — the vendor manifest joined to what the last run observed. */
export const sourceResponseSchema = z.array(
  z.object({
    source_file: z.string(),
    owner: z.string(),
    department: z.string(),
    format: z.string(),
    describes: z.string(),
    last_sync_at: z.string().nullable().optional(),
    reliability: reliabilitySchema.nullable().optional(),
  })
)

/** `/pipeline/stages` — the four stages that run, and what each last did. */
export const stageResponseSchema = z.array(
  z.object({
    order: z.number(),
    name: z.string(),
    description: z.string(),
    state: z.string(),
    last_run_at: z.string().nullable(),
    duration_seconds: z.number().nullable(),
    records: z.object({ value: z.number().nullable() }),
  })
)

/** `/hierarchy` — the structural tree. */
export const hierarchyResponseSchema = z.object({
  nodes: z.array(
    z.object({
      id: z.string(),
      tier: z.string(),
      label: z.string(),
      parent_id: z.string().nullable(),
      plant: z.string().nullable(),
      country: z.string().nullable(),
      status: z.string(),
      child_count: z.number(),
      descendant_machines: z.number(),
    })
  ),
  tiers: z.array(z.string()),
  truncated: z.boolean(),
})

/** `/ontology` — the declared schema with live instance counts. */
export const ontologyResponseSchema = z.object({
  object_types: z.array(
    z.object({
      name: z.string(),
      properties: z.array(z.string()),
      instance_count: z.number(),
    })
  ),
  relationship_types: z.array(
    z.object({
      name: z.string(),
      source: z.string(),
      target: z.string(),
      instance_count: z.number(),
    })
  ),
})

/** `/objects?type=Operator` — the people named by the asset register. */
export const operatorResponseSchema = z.array(
  z.looseObject({ id: z.string(), name: z.string().nullable() })
)

export type OperatorResponse = z.infer<typeof operatorResponseSchema>
export type SourceResponse = z.infer<typeof sourceResponseSchema>
export type StageResponse = z.infer<typeof stageResponseSchema>
export type HierarchyResponse = z.infer<typeof hierarchyResponseSchema>
export type OntologyResponse = z.infer<typeof ontologyResponseSchema>

/** Narrows the assembled payload, so a caller cannot forget a slice. */
export function isCompleteWorld(world: Partial<AseWorld>): world is AseWorld {
  return Boolean(world.sources && world.stages && world.nodes && world.ontology)
}
