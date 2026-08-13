import type { Metadata } from "next"
import { Suspense, type ReactElement } from "react"

import { LoadingState } from "@/components/ui/loading-state"
import { DemoWorkspace } from "@/features/demo/components/DemoWorkspace"

export const metadata: Metadata = {
  title: "Demo workspace — Isildur",
  description: "Expedition graph demo workspace.",
}

export default function DemoWorkspacePage(): ReactElement {
  return (
    <Suspense
      fallback={
        <div className="h-full min-h-svh bg-[#0B0E12]">
          <LoadingState label="Loading workspace" variant="dark" />
        </div>
      }
    >
      <DemoWorkspace />
    </Suspense>
  )
}
