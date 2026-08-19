import { HydrationBoundary, dehydrate } from "@tanstack/react-query"
import type { Metadata } from "next"
import type { ReactElement } from "react"

import { GraphView } from "@/features/graph/components/GraphView"
import {
  createServerQueryClient,
  firstSearchParam,
  prefetchGraph,
} from "@/lib/server/query"

export const metadata: Metadata = {
  title: "Graph — Isildur",
  description: "Force-directed view of resolved objects and relationships.",
}

export default async function GraphPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}): Promise<ReactElement> {
  const focusId = firstSearchParam((await searchParams).focus)
  const queryClient = createServerQueryClient()
  await prefetchGraph(queryClient, focusId)

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <GraphView />
    </HydrationBoundary>
  )
}
