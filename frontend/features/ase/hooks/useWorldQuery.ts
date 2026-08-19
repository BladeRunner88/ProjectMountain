"use client"

import {
  useQuery,
  type UseQueryOptions,
  type UseQueryResult,
} from "@tanstack/react-query"

import { fetchWorld } from "../services/world"
import type { AseWorld } from "../types/world"

export const worldQueryKey = ["ase", "world"] as const

/**
 * The Control Room's world.
 *
 * Deliberately never refetched on its own: the entities change only when the
 * pipeline runs, and re-fetching them under a live view would swap the graph
 * out from under whatever a person was looking at. Live movement comes from
 * the telemetry snapshot, which is a separate, cheap poll.
 */
export function worldQueryOptions(): UseQueryOptions<
  AseWorld,
  Error,
  AseWorld,
  typeof worldQueryKey
> {
  return {
    queryKey: worldQueryKey,
    queryFn: ({ signal }) => fetchWorld({ signal }),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  }
}

export function useWorldQuery(): UseQueryResult<AseWorld, Error> {
  return useQuery(worldQueryOptions())
}
