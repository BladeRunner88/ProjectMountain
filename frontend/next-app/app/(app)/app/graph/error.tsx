"use client"

import type { ReactElement } from "react"

import { ErrorState } from "@/components/ui/error-state"

export default function GraphError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}): ReactElement {
  return (
    <div className="h-full bg-canvas">
      <ErrorState
        variant="dark"
        message={
          error.message || "This page could not be loaded. Please try again."
        }
        onRetry={reset}
      />
    </div>
  )
}
