import type { AxiosRequestConfig } from "axios"

import { apiGet, ApiError, isAccessRequiredError } from "@/lib/axios"

import type {
  Connection,
  FullGraphData,
  GraphLink,
  GraphObject,
  ObjectDetail,
  ResolvedFrom,
} from "../types/graph"

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function parseGraphObject(value: unknown): GraphObject {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.type !== "string"
  ) {
    throw new ApiError(0, "Unexpected object in list response")
  }
  const name = typeof value.name === "string" ? value.name : ""
  return { ...value, id: value.id, type: value.type, name }
}

function parseConnection(value: unknown): Connection {
  if (
    !isRecord(value) ||
    (value.direction !== "in" && value.direction !== "out") ||
    typeof value.rel_type !== "string" ||
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    !(value.type === null || typeof value.type === "string")
  ) {
    throw new ApiError(0, "Unexpected connection in object detail")
  }
  return {
    direction: value.direction,
    rel_type: value.rel_type,
    id: value.id,
    type: value.type,
    name: value.name,
  }
}

function parseResolvedFrom(value: unknown): ResolvedFrom {
  if (
    !isRecord(value) ||
    typeof value.source_table !== "string" ||
    typeof value.source_id !== "number" ||
    typeof value.raw_name !== "string"
  ) {
    throw new ApiError(0, "Unexpected resolved_from entry in object detail")
  }
  return {
    source_table: value.source_table,
    source_id: value.source_id,
    raw_name: value.raw_name,
  }
}

function parseProvenance(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined
  const provenance: Record<string, string> = {}
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string") {
      provenance[key] = entry
    }
  }
  return provenance
}

function parseObjectDetail(value: unknown): ObjectDetail {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.type !== "string" ||
    !isRecord(value.properties) ||
    !Array.isArray(value.connections) ||
    !Array.isArray(value.resolved_from)
  ) {
    throw new ApiError(0, "Unexpected object detail response")
  }
  return {
    id: value.id,
    type: value.type,
    properties: value.properties,
    connections: value.connections.map(parseConnection),
    resolved_from: value.resolved_from.map(parseResolvedFrom),
    provenance: parseProvenance(value.provenance),
  }
}

export async function getObjects(
  type?: string,
  config?: AxiosRequestConfig
): Promise<GraphObject[]> {
  const path = type ? `/objects?type=${encodeURIComponent(type)}` : "/objects"
  const data = await apiGet<unknown>(path, config)
  if (!Array.isArray(data)) {
    throw new ApiError(0, "Unexpected objects list response")
  }
  return data.map(parseGraphObject)
}

function parseGraphLink(value: unknown): GraphLink {
  if (
    !isRecord(value) ||
    typeof value.source !== "string" ||
    typeof value.target !== "string" ||
    typeof value.rel_type !== "string"
  ) {
    throw new ApiError(0, "Unexpected link in graph response")
  }
  return {
    source: value.source,
    target: value.target,
    rel_type: value.rel_type,
  }
}

/**
 * Objects and links in a single request. Replaces the old approach of listing
 * objects and then fetching every object's detail to discover its edges, which
 * issued one request per node and exhausted the browser's connection pool.
 */
export async function getFullGraph(
  type?: string,
  config?: AxiosRequestConfig
): Promise<FullGraphData> {
  const path = type ? `/graph?type=${encodeURIComponent(type)}` : "/graph"
  const data = await apiGet<unknown>(path, config)
  if (
    !isRecord(data) ||
    !Array.isArray(data.objects) ||
    !Array.isArray(data.links)
  ) {
    throw new ApiError(0, "Unexpected graph response")
  }
  return {
    objects: data.objects.map(parseGraphObject),
    links: data.links.map(parseGraphLink),
  }
}

export async function getObject(
  id: string,
  config?: AxiosRequestConfig
): Promise<ObjectDetail> {
  const data = await apiGet<unknown>(
    `/objects/${encodeURIComponent(id)}`,
    config
  )
  return parseObjectDetail(data)
}

export function linksFromDetails(details: ObjectDetail[]): GraphLink[] {
  const links: GraphLink[] = []
  for (const detail of details) {
    for (const connection of detail.connections) {
      if (connection.direction === "out") {
        links.push({
          source: detail.id,
          target: connection.id,
          rel_type: connection.rel_type,
        })
      }
    }
  }
  return links
}

export function describeGraphError(error: unknown, fallback: string): string {
  if (isAccessRequiredError(error)) {
    return "Your access to Isildur has expired. Request access to continue."
  }
  if (error instanceof ApiError) {
    if (error.status === 404) return "This object could not be found."
    if (error.message) return error.message
  }
  if (error instanceof Error && error.message) return error.message
  return fallback
}
