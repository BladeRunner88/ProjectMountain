import { createContext, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { asOf as buildAsOfView, changePoints as computeChangePoints, nowView } from './bitemporal'
import type { EvidenceGraphView } from './bitemporal'
import { useDataset } from './store'
import type { Instant } from './traced'

// S3: one shared as-of setting the whole shell reads — every tab, the nav
// bar's colour, the section header's note. A single `EvidenceGraphView`
// computed here is what `resolve()` calls throughout the app should read
// facts through instead of always reaching for "latest".
interface AsOfContextValue {
  at: 'now' | Instant
  view: EvidenceGraphView
  setAt: (at: 'now' | Instant) => void
  returnToLive: () => void
  /** Change points in the last 24h — what the scrubber marks on its track. Recomputed as the live tick adds more. */
  changePoints: Instant[]
}

const AsOfCtx = createContext<AsOfContextValue | null>(null)

export function AsOfProvider({ children }: { children: ReactNode }) {
  const { tick } = useDataset()
  const [at, setAt] = useState<'now' | Instant>('now')

  const view = useMemo(() => (at === 'now' ? nowView() : buildAsOfView(at)), [at])
  // Keyed on `tick`, not `at` — this recomputes as the live feed adds new
  // change points over the session, independent of where the scrubber sits.
  // `tick` itself isn't read; it's the graph-changed signal that makes the
  // recompute happen at all, not an input to what gets computed.
  const points = useMemo(() => {
    void tick
    return computeChangePoints(24)
  }, [tick])

  const returnToLive = () => setAt('now')

  const value = useMemo(
    () => ({ at, view, setAt, returnToLive, changePoints: points }),
    [at, view, points]
  )

  return <AsOfCtx.Provider value={value}>{children}</AsOfCtx.Provider>
}

export function useAsOf(): AsOfContextValue {
  const ctx = useContext(AsOfCtx)
  if (!ctx) throw new Error('useAsOf must be used within AsOfProvider')
  return ctx
}
