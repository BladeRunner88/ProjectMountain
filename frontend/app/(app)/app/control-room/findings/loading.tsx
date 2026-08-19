import type { ReactElement } from "react"

import { LoadingState } from "@/components/ui/loading-state"

export default function FindingsLoading(): ReactElement {
  return (
    <div className="h-full bg-app">
      <LoadingState label="Loading findings" />
    </div>
  )
}
