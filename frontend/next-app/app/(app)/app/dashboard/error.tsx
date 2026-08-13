"use client"

import type { ReactElement } from "react"

import { ErrorState } from "@/components/ui/error-state"

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}): ReactElement {
  return (
    <div className="min-h-svh bg-black">
      <ErrorState
        variant="dark"
        message={
          error.message || "This dashboard could not be loaded. Please try again."
        }
        onRetry={reset}
      />
    </div>
  )
}
