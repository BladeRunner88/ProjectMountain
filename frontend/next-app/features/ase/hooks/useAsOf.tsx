'use client'

import { useMemo, type ReactNode } from 'react'
import { asOf as buildAsOfView, changePoints as computeChangePoints, nowView, type EvidenceGraphView } from '../services/bitemporal'
import type { Instant } from '../services/traced'
import { useAsOfStore, type AsOfAt } from '../stores/asOfStore'
import { useDatasetStore } from '../stores/datasetStore'

export interface AsOfValue {
  at: AsOfAt
  view: EvidenceGraphView
  setAt: (at: AsOfAt) => void
  returnToLive: () => void
  /** Change points in the last 24h — what the scrubber marks on its track. Recomputed as the live tick adds more. */
  changePoints: Instant[]
}

/** Pass-through for drop-in replacement of the old React context provider. State lives in the Zustand store. */
export function AsOfProvider({ children }: { children: ReactNode }): ReactNode {
  return children
}

export function useAsOf(): AsOfValue {
  const at = useAsOfStore((s) => s.at)
  const setAt = useAsOfStore((s) => s.setAt)
  const returnToLive = useAsOfStore((s) => s.returnToLive)
  const tick = useDatasetStore((s) => s.tick)

  const view = useMemo((): EvidenceGraphView => (at === 'now' ? nowView() : buildAsOfView(at)), [at])
  const changePoints = useMemo((): Instant[] => {
    void tick
    return computeChangePoints(24)
  }, [tick])

  return { at, view, setAt, returnToLive, changePoints }
}
