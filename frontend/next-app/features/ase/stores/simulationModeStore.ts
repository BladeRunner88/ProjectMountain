'use client'

import { create } from 'zustand'
import type { SourceId } from '../services/traced'

export interface SimulationModeValue {
  active: boolean
  sourceId: SourceId | null
  sourceName: string | null
  start: (sourceId: SourceId, sourceName: string) => void
  stop: () => void
}

interface SimulationModeStoreState {
  sourceId: SourceId | null
  sourceName: string | null
  start: (sourceId: SourceId, sourceName: string) => void
  stop: () => void
}

export const useSimulationModeStore = create<SimulationModeStoreState>((set) => ({
  sourceId: null,
  sourceName: null,
  start: (sourceId: SourceId, sourceName: string): void => {
    set({ sourceId, sourceName })
  },
  stop: (): void => {
    set({ sourceId: null, sourceName: null })
  },
}))
