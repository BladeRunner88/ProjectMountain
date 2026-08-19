import type { AxiosRequestConfig } from "axios"

import { ApiError, apiGet, isAccessRequiredError } from "@/lib/axios"

import {
  hierarchyResponseSchema,
  ontologyResponseSchema,
  operatorResponseSchema,
  sourceResponseSchema,
  stageResponseSchema,
} from "../schemas/world"
import type {
  AseWorld,
  WorldNode,
  WorldOperator,
  WorldSource,
  WorldStage,
} from "../types/world"

/** Everything below a plant is a machine or a sensor, and there are thousands. */
const HIERARCHY_LIMIT = 20000

/**
 * Fetch the slices the Control Room's world is made of.
 *
 * In parallel, deliberately: they are independent, and fetching them in
 * sequence would multiply the latency before anything renders.
 */
export async function fetchWorld(
  config?: AxiosRequestConfig
): Promise<AseWorld> {
  const [sources, stages, hierarchy, ontology, operators] = await Promise.all([
    apiGet<unknown>("/sources", config),
    apiGet<unknown>("/pipeline/stages", config),
    apiGet<unknown>(`/hierarchy?limit=${HIERARCHY_LIMIT}`, config),
    apiGet<unknown>("/ontology", config),
    apiGet<unknown>("/objects?type=Operator", config),
  ])

  return {
    sources: parseSources(sources),
    stages: parseStages(stages),
    nodes: parseNodes(hierarchy),
    operators: parseOperators(operators),
    ontology: parseOntology(ontology),
  }
}

function parseSources(data: unknown): WorldSource[] {
  const parsed = sourceResponseSchema.safeParse(data)
  if (!parsed.success) throw new ApiError(0, "Unexpected sources response")

  return parsed.data.map((source) => ({
    sourceFile: source.source_file,
    owner: source.owner,
    department: source.department,
    format: source.format,
    describes: source.describes,
    // A feed the pipeline has never seen reports no reliability at all, which
    // is not the same as a reliability of zero.
    reliability: source.reliability?.value ?? 0,
    records: source.reliability?.records ?? 0,
    failed: source.reliability?.failed ?? 0,
    degraded: source.reliability?.degraded ?? false,
    lastSyncAt: source.last_sync_at ?? null,
  }))
}

function parseStages(data: unknown): WorldStage[] {
  const parsed = stageResponseSchema.safeParse(data)
  if (!parsed.success)
    throw new ApiError(0, "Unexpected pipeline stages response")

  return parsed.data.map((stage) => ({
    order: stage.order,
    name: stage.name,
    description: stage.description,
    state: stage.state,
    lastRunAt: stage.last_run_at,
    durationSeconds: stage.duration_seconds,
    records: stage.records.value,
  }))
}

function parseNodes(data: unknown): WorldNode[] {
  const parsed = hierarchyResponseSchema.safeParse(data)
  if (!parsed.success) throw new ApiError(0, "Unexpected hierarchy response")

  return parsed.data.nodes.map((node) => ({
    id: node.id,
    tier: node.tier,
    label: node.label,
    parentId: node.parent_id,
    plant: node.plant,
    country: node.country,
    status: node.status,
    childCount: node.child_count,
    descendantMachines: node.descendant_machines,
  }))
}

function parseOntology(data: unknown): AseWorld["ontology"] {
  const parsed = ontologyResponseSchema.safeParse(data)
  if (!parsed.success) throw new ApiError(0, "Unexpected ontology response")

  return {
    objectTypes: parsed.data.object_types.map((type) => ({
      name: type.name,
      properties: type.properties,
      instanceCount: type.instance_count,
    })),
    relationshipTypes: parsed.data.relationship_types.map((relationship) => ({
      name: relationship.name,
      source: relationship.source,
      target: relationship.target,
      instanceCount: relationship.instance_count,
    })),
  }
}

function parseOperators(data: unknown): WorldOperator[] {
  const parsed = operatorResponseSchema.safeParse(data)
  if (!parsed.success) throw new ApiError(0, "Unexpected operators response")

  return parsed.data
    .filter((operator): operator is { id: string; name: string } =>
      Boolean(operator.name)
    )
    .map((operator) => ({ id: operator.id, name: operator.name }))
}

export function describeWorldError(error: unknown, fallback: string): string {
  if (isAccessRequiredError(error)) {
    return "Your access to Isildur has expired. Request access to continue."
  }
  if (error instanceof ApiError && error.message) return error.message
  if (error instanceof Error && error.message) return error.message
  return fallback
}
