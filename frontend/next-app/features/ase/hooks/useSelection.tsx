'use client'

import type { ReactNode } from 'react'
import { type SelectionValue, useSelectionStore } from '../stores/selectionStore'

export type { Selection, SelectionValue } from '../stores/selectionStore'

/** Pass-through for drop-in replacement of the old React context provider. State lives in the Zustand store. */
export function SelectionProvider({ children }: { children: ReactNode }): ReactNode {
  return children
}

export function useSelection(): SelectionValue {
  const selection = useSelectionStore((s) => s.selection)
  const select = useSelectionStore((s) => s.select)
  return { selection, select }
}
