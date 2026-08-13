"use client"

import type { ReactElement } from "react"

import { ErrorState } from "@/components/ui/error-state"

export default function FindingsError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}): ReactElement {
  return (
    <div className="h-full bg-app">
      <ErrorState
        message={
          error.message || "Findings could not be loaded. Please try again."
        }
        onRetry={reset}
      />
    </div>
  )
}
