'use client'

import type { ReactNode } from 'react'
import { isDimmed, type HoverValue, useHoverStore } from '../stores/hoverStore'

export type { HoverValue } from '../stores/hoverStore'
export { isDimmed }

/** Pass-through for drop-in replacement of the old React context provider. State lives in the Zustand store. */
export function HoverProvider({ children }: { children: ReactNode }): ReactNode {
  return children
}

export function useHover(): HoverValue {
  const hoveredIds = useHoverStore((s) => s.hoveredIds)
  const cone = useHoverStore((s) => s.cone)
  const setHovered = useHoverStore((s) => s.setHovered)
  return { hoveredIds, cone, setHovered }
}
