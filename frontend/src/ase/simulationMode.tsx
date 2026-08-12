// S9.12: a real, global "simulation mode" — entering Exposure's Simulation
// panel and choosing a source to take offline visually changes the WHOLE
// Control Room's nav bar, not just the Exposure tab's own content, so a
// simulated outage can never be mistaken for the present (the same "a
// historical view can never be mistaken for the present" discipline
// `asOfContext.tsx` already established, reused here for a second kind of
// "not the present" state). Exitable in one click from anywhere in the
// shell, not just from the panel that started it.

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import type { SourceId } from './traced'

interface SimulationModeValue {
  active: boolean
  sourceId: SourceId | null
  sourceName: string | null
  start: (sourceId: SourceId, sourceName: string) => void
  stop: () => void
}

const SimulationModeCtx = createContext<SimulationModeValue | null>(null)

export function SimulationModeProvider({ children }: { children: ReactNode }) {
  const [sim, setSim] = useState<{ sourceId: SourceId; sourceName: string } | null>(null)

  const value = useMemo<SimulationModeValue>(
    () => ({
      active: sim !== null,
      sourceId: sim?.sourceId ?? null,
      sourceName: sim?.sourceName ?? null,
      start: (sourceId, sourceName) => setSim({ sourceId, sourceName }),
      stop: () => setSim(null),
    }),
    [sim]
  )

  return <SimulationModeCtx.Provider value={value}>{children}</SimulationModeCtx.Provider>
}

export function useSimulationMode(): SimulationModeValue {
  const ctx = useContext(SimulationModeCtx)
  if (!ctx) throw new Error('useSimulationMode must be used within SimulationModeProvider')
  return ctx
}
