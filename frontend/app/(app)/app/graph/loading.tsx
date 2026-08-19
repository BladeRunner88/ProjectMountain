import type { ReactElement } from "react"

import { LoadingState } from "@/components/ui/loading-state"

export default function GraphLoading(): ReactElement {
  return (
    <div className="h-full bg-canvas">
      <LoadingState variant="dark" label="Loading graph" />
    </div>
  )
}
