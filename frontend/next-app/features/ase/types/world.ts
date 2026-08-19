/**
 * The real world the Control Room describes, as the backend serves it.
 *
 * Every name, count and source in here is a fact from the warehouse. The
 * Control Room's analytics still derive a great deal on top of this — see
 * `services/dataset.ts` — but the entities those analytics are *about* come
 * from here rather than from a name pool.
 */

/** One vendor feed, with the reliability the pipeline actually measured. */
export interface WorldSource {
  sourceFile: string
  owner: string
  department: string
  format: string
  describes: string
  /** Rows parsed / rows offered on the last run. Measured, not rated. */
  reliability: number
  records: number
  failed: number
  degraded: boolean
  lastSyncAt: string | null
}

/** One pipeline stage, and what its last run actually did. */
export interface WorldStage {
  order: number
  name: string
  description: string
  state: string
  lastRunAt: string | null
  durationSeconds: number | null
  records: number | null
}

/** A node of the structural tree: country, plant, line, machine or sensor. */
export interface WorldNode {
  id: string
  tier: string
  label: string
  parentId: string | null
  plant: string | null
  country: string | null
  status: string
  childCount: number
  descendantMachines: number
}

/** How many instances of each declared type the warehouse holds. */
export interface WorldOntologyType {
  name: string
  properties: string[]
  instanceCount: number
}

export interface WorldOntology {
  objectTypes: WorldOntologyType[]
  relationshipTypes: {
    name: string
    source: string
    target: string
    instanceCount: number
  }[]
}

/** A named person the plant employs, as the asset register records them. */
export interface WorldOperator {
  id: string
  name: string
}

export interface AseWorld {
  sources: WorldSource[]
  stages: WorldStage[]
  nodes: WorldNode[]
  operators: WorldOperator[]
  ontology: WorldOntology
}

/** The tiers the hierarchy actually has. There is no "cell": no feed records one. */
export const WORLD_TIERS = [
  "country",
  "plant",
  "line",
  "machine",
  "sensor",
] as const

export type WorldTier = (typeof WORLD_TIERS)[number]

export function nodesOfTier(world: AseWorld, tier: WorldTier): WorldNode[] {
  return world.nodes.filter((node) => node.tier === tier)
}
