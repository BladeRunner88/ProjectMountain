import type { Metadata } from "next"
import type { ReactElement } from "react"

import { GraphView } from "@/features/graph/components/GraphView"

export const metadata: Metadata = {
  title: "Graph — Isildur",
  description: "Force-directed view of resolved objects and relationships.",
}

export default function GraphPage(): ReactElement {
  return <GraphView />
}
