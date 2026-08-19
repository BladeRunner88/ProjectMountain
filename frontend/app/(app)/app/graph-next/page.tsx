import type { Metadata } from 'next'
import type { ReactElement } from 'react'
import { GraphNext } from '@/features/graph-next/components/GraphNext'

export const metadata: Metadata = {
  title: 'Graph — Isildur',
  description: 'Network, strata, and terrain views of the campaign graph.',
}

export default function GraphNextPage(): ReactElement {
  return (
    <div className="h-full w-full">
      <GraphNext />
    </div>
  )
}
