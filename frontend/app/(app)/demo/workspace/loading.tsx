import type { ReactElement } from "react"

import { LoadingState } from "@/components/ui/loading-state"

export default function DemoWorkspaceLoading(): ReactElement {
  return (
    <div className="h-full min-h-svh bg-[#0B0E12]">
      <LoadingState label="Loading workspace" variant="dark" />
    </div>
  )
}
