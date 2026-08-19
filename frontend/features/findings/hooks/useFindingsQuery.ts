"use client"

import {
  useQuery,
  type UseQueryOptions,
  type UseQueryResult,
} from "@tanstack/react-query"

import { queryKeys } from "@/lib/query-keys"

import { listFindings } from "../services/findings"
import type { Finding } from "../types/finding"

export function findingsQueryOptions(): UseQueryOptions<
  Finding[],
  Error,
  Finding[],
  readonly ["findings"]
> {
  return {
    queryKey: queryKeys.findings.all,
    queryFn: ({ signal }) => listFindings({ signal }),
  }
}

export function useFindingsQuery(): UseQueryResult<Finding[], Error> {
  return useQuery(findingsQueryOptions())
}
