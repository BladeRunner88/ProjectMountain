"use client"

import type { ReactElement } from "react"

import { ErrorState } from "@/components/ui/error-state"

export default function DemoEnterError({
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
          error.message || "This demo could not be loaded. Please try again."
        }
        onRetry={reset}
      />
    </div>
  )
}
