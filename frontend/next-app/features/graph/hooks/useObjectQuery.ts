"use client"

import { useQuery, type UseQueryResult } from "@tanstack/react-query"

import { queryKeys } from "@/lib/query-keys"

import { getObject } from "../services/objects"
import type { ObjectDetail } from "../types/graph"

export function useObjectQuery(
  id: string | null
): UseQueryResult<ObjectDetail, Error> {
  return useQuery({
    queryKey: queryKeys.objects.detail(id ?? ""),
    queryFn: ({ signal }) => getObject(id ?? "", { signal }),
    enabled: Boolean(id),
  })
}
