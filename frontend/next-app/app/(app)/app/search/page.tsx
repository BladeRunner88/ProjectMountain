import { HydrationBoundary, dehydrate } from "@tanstack/react-query"
import type { Metadata } from "next"
import type { ReactElement } from "react"

import { SearchView } from "@/features/search/components/SearchView"
import {
  createServerQueryClient,
  firstSearchParam,
  prefetchSearch,
} from "@/lib/server/query"

export const metadata: Metadata = {
  title: "Search — Isildur",
  description: "Search resolved entities, aliases, and relationships.",
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}): Promise<ReactElement> {
  const q = firstSearchParam((await searchParams).q) ?? ""
  const queryClient = createServerQueryClient()
  await prefetchSearch(queryClient, q)

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <SearchView />
    </HydrationBoundary>
  )
}
