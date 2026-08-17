"use client"

import type { ReactElement } from "react"

import { ErrorState } from "@/components/ui/error-state"

export default function TrustError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}): ReactElement {
  return (
    <ErrorState
      variant="dark"
      message={
        error.message || "This tab could not be loaded. Please try again."
      }
      onRetry={reset}
    />
  )
}
