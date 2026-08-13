import { z } from "zod"

import type { SearchResult } from "../types/search"

export const searchQuerySchema = z.string().trim()

export const searchResultSchema: z.ZodType<SearchResult> = z.object({
  id: z.string(),
  type: z.string(),
  name: z.string(),
  connections: z.number(),
  matched_alias: z.string().nullable(),
})

export const searchResultsSchema = z.array(searchResultSchema)
