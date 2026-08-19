"use client"

import type { ReactElement } from "react"

import { ErrorState } from "@/components/ui/error-state"

export default function SearchError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}): ReactElement {
  return (
    <div className="h-full bg-app dark:bg-background">
      <ErrorState
        message={
          error.message || "This page could not be loaded. Please try again."
        }
        onRetry={reset}
      />
    </div>
  )
}
