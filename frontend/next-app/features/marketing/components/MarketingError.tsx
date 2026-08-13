"use client"

import type { ReactElement } from "react"

import { ErrorState } from "@/components/ui/error-state"

import { MarketingShell } from "./MarketingShell"

export function MarketingError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}): ReactElement {
  return (
    <MarketingShell>
      <div className="min-h-[40vh] py-24">
        <ErrorState
          message={
            error.message || "This page could not be loaded. Please try again."
          }
          onRetry={reset}
        />
      </div>
    </MarketingShell>
  )
}
