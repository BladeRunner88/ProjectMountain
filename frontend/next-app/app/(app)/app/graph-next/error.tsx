'use client'

import type { ReactElement } from 'react'
import { ErrorState } from '@/components/ui/error-state'
import { CANVAS } from '@/features/ase/tokens'

export default function GraphNextError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}): ReactElement {
  return (
    <div className="h-full w-full" style={{ background: CANVAS }}>
      <ErrorState
        variant="dark"
        title="Graph failed to load"
        message={error.message || 'This view could not be loaded. Please try again.'}
        onRetry={reset}
      />
    </div>
  )
}
