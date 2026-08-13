"use client"

import type { ReactElement } from "react"

import { ErrorState } from "@/components/ui/error-state"
import { AccessPageChrome } from "@/features/access/components/AccessPageChrome"

export default function RequestAccessError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}): ReactElement {
  return (
    <AccessPageChrome>
      <div className="min-h-[40vh]">
        <ErrorState
          message={
            error.message || "This page could not be loaded. Please try again."
          }
          onRetry={reset}
        />
      </div>
    </AccessPageChrome>
  )
}
