"use client"

import { useQueries, type UseQueryOptions } from "@tanstack/react-query"

import { queryKeys } from "@/api/query-keys"

import { getObject, linksFromDetails } from "../services/objects"
import type { FullGraphData, ObjectDetail } from "../types/graph"
import { useObjectsQuery } from "./useObjectsQuery"

/**
 * Shared shape for a single object-detail query. The key comes from
 * `queryKeys` so it cannot drift from the server prefetch in
 * `lib/server/query.ts`.
 */
export function objectDetailQueryOptions(
  id: string
): UseQueryOptions<
  ObjectDetail,
  Error,
  ObjectDetail,
  readonly ["objects", string]
> {
  return {
    queryKey: queryKeys.objects.detail(id),
    queryFn: ({ signal }) => getObject(id, { signal }),
  }
}

export function useFullGraphQuery(): {
  data: FullGraphData | undefined
  isPending: boolean
  isError: boolean
  error: Error | null
  refetch: () => void
} {
  const objectsQuery = useObjectsQuery()
  const objects = objectsQuery.data ?? []

  const detailQueries = useQueries({
    queries: objects.map((object) => ({
      ...objectDetailQueryOptions(object.id),
      enabled: objectsQuery.isSuccess,
    })),
  })

  const firstDetailError =
    detailQueries.find((query) => query.error)?.error ?? null
  const detailsReady =
    objectsQuery.isSuccess &&
    (objects.length === 0 ||
      (detailQueries.length === objects.length &&
        detailQueries.every((query) => query.isSuccess && query.data)))
  const detailsPending =
    objectsQuery.isSuccess &&
    objects.length > 0 &&
    detailQueries.some((query) => query.isPending)

  const details = detailsReady
    ? detailQueries.flatMap((query) => (query.data ? [query.data] : []))
    : []

  const refetch = (): void => {
    void objectsQuery.refetch()
    for (const query of detailQueries) {
      void query.refetch()
    }
  }

  return {
    data: detailsReady
      ? { objects, links: linksFromDetails(details) }
      : undefined,
    isPending: objectsQuery.isPending || detailsPending,
    isError: objectsQuery.isError || firstDetailError !== null,
    error: objectsQuery.error ?? firstDetailError,
    refetch,
  }
}
