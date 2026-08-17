import type { ReactElement } from "react"

import { LoadingState } from "@/components/ui/loading-state"
import { MarketingShell } from "@/features/marketing/components/MarketingShell"

export default function DocumentationLoading(): ReactElement {
  return (
    <MarketingShell>
      <div className="min-h-[40vh] py-24">
        <LoadingState label="Loading" />
      </div>
    </MarketingShell>
  )
}
