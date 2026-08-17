import { QueryClient, type FetchQueryOptions } from "@tanstack/react-query"
import { z } from "zod"

import { queryKeys } from "@/lib/query-keys"
import { searchResultsSchema } from "@/features/search/schemas/search"
import type {
  GraphObject,
  ObjectDetail,
  ResolvedFrom,
} from "@/features/graph/types/graph"
import type { SearchResult } from "@/features/search/types/search"
import { createQueryClient } from "@/lib/query-client"

/**
 * Server-side data access for the two backend-backed routes (`/app/search`,
 * `/app/graph`).
 *
 * This module is deliberately independent of `lib/axios.ts`: that client is
 * browser-shaped (cookie credentials, 401 -> `window.location` redirect), so
 * server prefetching uses plain `fetch` instead. Query keys come from the same
 * `queryKeys` builders the client hooks use, so a server-prefetched entry
 * always lands on the cache key the hook reads back after hydration.
 */

const SERVER_FETCH_TIMEOUT_MS = 5_000

export function getServerApiBaseUrl(): string {
  return (
    process.env.API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:8010"
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

/**
 * The backend returns bare JSON. Older builds wrapped responses in a
 * `{ success, data }` envelope, so tolerate that shape rather than failing
 * against a stale deployment.
 */
function unwrapEnvelope(body: unknown): unknown {
  if (!isRecord(body)) return body
  if (body.success === true && "data" in body) return body.data
  if (body.success === false && "error" in body) {
    throw new Error("API returned an error envelope")
  }
  return body
}

async function fetchJson(path: string): Promise<unknown> {
  const response = await fetch(`${getServerApiBaseUrl()}${path}`, {
    // Never let a build-time or route-level cache freeze backend data into the
    // prerendered payload: these routes must fetch per request.
    cache: "no-store",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(SERVER_FETCH_TIMEOUT_MS),
  })
  if (!response.ok) {
    throw new Error(`GET ${path} failed with status ${response.status}`)
  }
  return unwrapEnvelope(await response.json())
}

const graphObjectSchema: z.ZodType<GraphObject> = z.looseObject({
  id: z.string(),
  type: z.string(),
  name: z.string().catch(""),
})

const graphObjectsSchema = z.array(graphObjectSchema)

const connectionSchema = z.object({
  direction: z.enum(["in", "out"]),
  rel_type: z.string(),
  id: z.string(),
  type: z.string().nullable(),
  name: z.string(),
})

const resolvedFromSchema: z.ZodType<ResolvedFrom> = z.object({
  source_table: z.string(),
  source_id: z.number(),
  raw_name: z.string(),
})

const objectDetailSchema: z.ZodType<ObjectDetail> = z.object({
  id: z.string(),
  type: z.string(),
  properties: z.record(z.string(), z.unknown()),
  connections: z.array(connectionSchema),
  resolved_from: z.array(resolvedFromSchema),
  provenance: z.record(z.string(), z.string()).optional(),
})

async function fetchObjects(): Promise<GraphObject[]> {
  return graphObjectsSchema.parse(await fetchJson("/objects"))
}

async function fetchObject(id: string): Promise<ObjectDetail> {
  return objectDetailSchema.parse(
    await fetchJson(`/objects/${encodeURIComponent(id)}`)
  )
}

async function fetchSearch(q: string): Promise<SearchResult[]> {
  return searchResultsSchema.parse(
    await fetchJson(`/search?q=${encodeURIComponent(q)}`)
  )
}

export function objectsQueryOptions(): FetchQueryOptions<
  GraphObject[],
  Error,
  GraphObject[],
  typeof queryKeys.objects.all
> {
  return {
    queryKey: queryKeys.objects.all,
    queryFn: fetchObjects,
  }
}

export function objectDetailQueryOptions(
  id: string
): FetchQueryOptions<
  ObjectDetail,
  Error,
  ObjectDetail,
  readonly ["objects", string]
> {
  return {
    queryKey: queryKeys.objects.detail(id),
    queryFn: () => fetchObject(id),
  }
}

export function serverSearchQueryOptions(
  query: string
): FetchQueryOptions<
  SearchResult[],
  Error,
  SearchResult[],
  readonly ["search", string]
> {
  const q = query.trim()
  return {
    queryKey: queryKeys.search.q(q),
    queryFn: () => fetchSearch(q),
  }
}

/**
 * Narrow one entry of a `searchParams` object to a single string. Repeated
 * params (`?q=a&q=b`) arrive as an array; take the first, like the client's
 * `URLSearchParams.get`.
 */
export function firstSearchParam(
  value: string | string[] | undefined
): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}

/**
 * A fresh client per request. A module-level singleton would leak one user's
 * data into another user's dehydrated payload.
 */
export function createServerQueryClient(): QueryClient {
  const client = createQueryClient()
  const defaults = client.getDefaultOptions()
  client.setDefaultOptions({
    ...defaults,
    // Retrying on the server only delays the response when the backend is
    // down; the client hook retries after hydration anyway.
    queries: { ...defaults.queries, retry: false },
  })
  return client
}

/**
 * Warm the graph route with the detail for `focusId` when the URL deep-links to
 * a node — that is the one panel rendered immediately, by `SidePanel`.
 *
 * Deliberately NOT the graph itself. `/graph` returns ~18k objects and ~44k
 * links; dehydrating that into the HTML produced a ~3MB document that the
 * client then had to parse and rebuild, which stalled hydration and left the
 * view stuck in its Suspense fallback. The client fetches it in one request
 * instead (see `useFullGraphQuery`).
 *
 * `prefetchQuery` never rejects, so a failed prefetch simply leaves the key out
 * of the dehydrated state and the client hook fetches it as before.
 */
export async function prefetchGraph(
  client: QueryClient,
  focusId?: string
): Promise<void> {
  if (!focusId) return
  await client.prefetchQuery(objectDetailQueryOptions(focusId))
}

/**
 * Warm a search result page. No-op for an empty query, matching the
 * `enabled: q.length > 0` guard in `useSearchQuery`.
 */
export async function prefetchSearch(
  client: QueryClient,
  query: string
): Promise<void> {
  const q = query.trim()
  if (q.length === 0) return
  await client.prefetchQuery(serverSearchQueryOptions(q))
}
