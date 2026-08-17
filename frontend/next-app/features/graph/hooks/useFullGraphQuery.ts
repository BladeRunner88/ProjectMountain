"use client"

import { useQueries } from "@tanstack/react-query"

import { queryKeys } from "@/lib/query-keys"

import { getObject, linksFromDetails } from "../services/objects"
import type { FullGraphData } from "../types/graph"
import { useObjectsQuery } from "./useObjectsQuery"

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
      queryKey: queryKeys.objects.detail(object.id),
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        getObject(object.id, { signal }),
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
    data: detailsReady ? { objects, links: linksFromDetails(details) } : undefined,
    isPending: objectsQuery.isPending || detailsPending,
    isError: objectsQuery.isError || firstDetailError !== null,
    error: objectsQuery.error ?? firstDetailError,
    refetch,
  }
}
