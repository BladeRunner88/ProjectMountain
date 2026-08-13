"use client"

import { useQuery, type UseQueryResult } from "@tanstack/react-query"

import { queryKeys } from "@/api/query-keys"

import { getObjects } from "../services/objects"
import type { GraphObject } from "../types/graph"

export function useObjectsQuery(): UseQueryResult<GraphObject[], Error> {
  return useQuery({
    queryKey: queryKeys.objects.all,
    queryFn: ({ signal }) => getObjects(undefined, { signal }),
  })
}
