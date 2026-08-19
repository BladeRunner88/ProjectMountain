"use client"

import {
  useQuery,
  type UseQueryOptions,
  type UseQueryResult,
} from "@tanstack/react-query"

import { queryKeys } from "@/lib/query-keys"

import { search } from "../services/search"
import type { SearchResult } from "../types/search"

/**
 * Shared shape for the search query. The key comes from `queryKeys` so it
 * cannot drift from the server prefetch in `lib/server/query.ts`.
 */
export function searchQueryOptions(
  query: string
): UseQueryOptions<
  SearchResult[],
  Error,
  SearchResult[],
  readonly ["search", string]
> {
  const q = query.trim()
  return {
    queryKey: queryKeys.search.q(q),
    queryFn: ({ signal }) => search(q, { signal }),
    enabled: q.length > 0,
  }
}

export function useSearchQuery(
  query: string
): UseQueryResult<SearchResult[], Error> {
  return useQuery(searchQueryOptions(query))
}
