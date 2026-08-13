'use client'

import { create } from 'zustand'
import type { Conflict } from '../services/conflict'
import type { TracedValue } from '../services/traced'

export type Selection =
  | { kind: 'value'; traced: TracedValue<unknown>; label: string; whatThisIs?: string }
  | { kind: 'conflict'; conflict: Conflict }
  | { kind: 'identity'; climberId: string }
  | { kind: 'ruleFiring'; ruleLabel: string; entities: { climberId?: string; label: string; serial?: string }[] }

export interface SelectionValue {
  selection: Selection | null
  select: (selection: Selection | null) => void
}

interface SelectionStoreState {
  selection: Selection | null
  select: (selection: Selection | null) => void
}

export const useSelectionStore = create<SelectionStoreState>((set) => ({
  selection: null,
  select: (selection: Selection | null): void => {
    set({ selection })
  },
}))
