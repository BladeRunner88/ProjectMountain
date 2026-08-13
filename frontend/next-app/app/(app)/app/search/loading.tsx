import type { ReactElement } from "react"

import { LoadingState } from "@/components/ui/loading-state"

export default function SearchLoading(): ReactElement {
  return (
    <div className="h-full bg-app dark:bg-background">
      <LoadingState label="Loading search" />
    </div>
  )
}
