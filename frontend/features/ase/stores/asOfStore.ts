'use client'

import { create } from 'zustand'
import type { Instant } from '../services/traced'

export type AsOfAt = 'now' | Instant

interface AsOfStoreState {
  at: AsOfAt
  setAt: (at: AsOfAt) => void
  returnToLive: () => void
}

export const useAsOfStore = create<AsOfStoreState>((set) => ({
  at: 'now',
  setAt: (at: AsOfAt): void => {
    set({ at })
  },
  returnToLive: (): void => {
    set({ at: 'now' })
  },
}))
