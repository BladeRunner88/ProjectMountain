"use client"

import { useQuery, type UseQueryOptions } from "@tanstack/react-query"

import { queryKeys } from "@/lib/query-keys"

import { getFullGraph } from "../services/objects"
import type { FullGraphData } from "../types/graph"

/**
 * Shared shape for the whole-graph query. The key comes from `queryKeys` so it
 * cannot drift from the server prefetch in `lib/server/query.ts`.
 */
export function fullGraphQueryOptions(): UseQueryOptions<
  FullGraphData,
  Error,
  FullGraphData,
  readonly ["graph"]
> {
  return {
    queryKey: queryKeys.graph.all,
    queryFn: ({ signal }) => getFullGraph(undefined, { signal }),
  }
}

export function useFullGraphQuery(): {
  data: FullGraphData | undefined
  isPending: boolean
  isError: boolean
  error: Error | null
  refetch: () => void
} {
  const query = useQuery(fullGraphQueryOptions())

  return {
    data: query.data,
    isPending: query.isPending,
    isError: query.isError,
    error: query.error,
    refetch: (): void => {
      void query.refetch()
    },
  }
}
