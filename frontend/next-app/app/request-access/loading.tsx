import type { ReactElement } from "react"

import { LoadingState } from "@/components/ui/loading-state"

import { AccessPageChrome } from "@/features/access/components/AccessPageChrome"

export default function RequestAccessLoading(): ReactElement {
  return (
    <AccessPageChrome>
      <div className="min-h-[40vh]">
        <LoadingState label="Loading" />
      </div>
    </AccessPageChrome>
  )
}
