import type { AxiosRequestConfig } from "axios"

import { apiGet, ApiError, isAccessRequiredError } from "@/lib/axios"

import { searchQuerySchema, searchResultsSchema } from "../schemas/search"
import type { SearchResult } from "../types/search"

export async function search(
  q: string,
  config?: AxiosRequestConfig
): Promise<SearchResult[]> {
  const parsedQuery = searchQuerySchema.parse(q)
  const data = await apiGet<unknown>(
    `/search?q=${encodeURIComponent(parsedQuery)}`,
    config
  )
  const parsed = searchResultsSchema.safeParse(data)
  if (!parsed.success) {
    throw new ApiError(0, "Unexpected search response")
  }
  return parsed.data
}

export function describeSearchError(error: unknown, fallback: string): string {
  if (isAccessRequiredError(error)) {
    return "Your access to Isildur has expired. Request access to continue."
  }
  if (error instanceof ApiError && error.message) return error.message
  if (error instanceof Error && error.message) return error.message
  return fallback
}
