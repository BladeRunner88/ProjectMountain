"use client"

import { useQuery, type UseQueryResult } from "@tanstack/react-query"

import { queryKeys } from "@/lib/query-keys"

import { search } from "../services/search"
import type { SearchResult } from "../types/search"

export function useSearchQuery(
  query: string
): UseQueryResult<SearchResult[], Error> {
  const q = query.trim()
  return useQuery({
    queryKey: queryKeys.search.q(q),
    queryFn: ({ signal }) => search(q, { signal }),
    enabled: q.length > 0,
  })
}
