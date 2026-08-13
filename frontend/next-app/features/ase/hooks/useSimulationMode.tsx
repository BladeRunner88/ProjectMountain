'use client'

import type { ReactNode } from 'react'
import { type SimulationModeValue, useSimulationModeStore } from '../stores/simulationModeStore'

export type { SimulationModeValue } from '../stores/simulationModeStore'

/** Pass-through for drop-in replacement of the old React context provider. State lives in the Zustand store. */
export function SimulationModeProvider({ children }: { children: ReactNode }): ReactNode {
  return children
}

export function useSimulationMode(): SimulationModeValue {
  const sourceId = useSimulationModeStore((s) => s.sourceId)
  const sourceName = useSimulationModeStore((s) => s.sourceName)
  const start = useSimulationModeStore((s) => s.start)
  const stop = useSimulationModeStore((s) => s.stop)
  return {
    active: sourceId !== null,
    sourceId,
    sourceName,
    start,
    stop,
  }
}
