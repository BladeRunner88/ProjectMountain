"use client"

import type { ReactElement } from "react"

import { ErrorState } from "@/components/ui/error-state"

export default function DemoError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}): ReactElement {
  return (
    <div className="min-h-svh bg-[#0B0E12]">
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
