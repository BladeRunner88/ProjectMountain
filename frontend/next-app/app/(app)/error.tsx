"use client"

import type { ReactElement } from "react"

import { ErrorState } from "@/components/ui/error-state"

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}): ReactElement {
  return (
    <ErrorState
      message={
        error.message || "This page could not be loaded. Please try again."
      }
      onRetry={reset}
    />
  )
}
