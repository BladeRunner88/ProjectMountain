import type { ReactElement } from 'react'
import { LoadingState } from '@/components/ui/loading-state'
import { CANVAS } from '@/features/ase/tokens'

export default function GraphNextLoading(): ReactElement {
  return (
    <div className="h-full w-full" style={{ background: CANVAS }}>
      <LoadingState label="Loading graph" variant="dark" />
    </div>
  )
}
