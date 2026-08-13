import type { ReactElement } from "react"

import { LoadingState } from "@/components/ui/loading-state"

export default function DashboardLoading(): ReactElement {
  return (
    <div className="min-h-svh bg-black">
      <LoadingState label="Loading dashboard" variant="dark" />
    </div>
  )
}
