'use client'

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

export interface SectionHeaderSlotValue {
  right: ReactNode
  setRight: (node: ReactNode) => void
}

const SectionHeaderSlotCtx = createContext<SectionHeaderSlotValue | null>(null)

export function SectionHeaderSlotProvider({ children }: { children: ReactNode }): ReactNode {
  const [right, setRightState] = useState<ReactNode>(null)
  const setRight = useCallback((node: ReactNode): void => {
    setRightState(node)
  }, [])
  const value = useMemo<SectionHeaderSlotValue>(() => ({ right, setRight }), [right, setRight])
  return <SectionHeaderSlotCtx.Provider value={value}>{children}</SectionHeaderSlotCtx.Provider>
}

export function useSectionHeaderSlot(): SectionHeaderSlotValue {
  const ctx = useContext(SectionHeaderSlotCtx)
  if (!ctx) {
    throw new Error('useSectionHeaderSlot must be used within the Control Room shell')
  }
  return ctx
}
