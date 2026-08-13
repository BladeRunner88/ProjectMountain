'use client'

import { create } from 'zustand'
import { dependents } from '../services/folds'
import type { TracedId } from '../services/traced'

export interface HoverValue {
  hoveredIds: ReadonlySet<TracedId> | null
  /** null when nothing is hovered — everything renders at full opacity. Otherwise the hovered ids plus everything that depends on any of them. */
  cone: ReadonlySet<TracedId> | null
  setHovered: (ids: TracedId | TracedId[] | null) => void
}

interface HoverStoreState {
  hoveredIds: ReadonlySet<TracedId> | null
  cone: ReadonlySet<TracedId> | null
  setHovered: (ids: TracedId | TracedId[] | null) => void
}

export const useHoverStore = create<HoverStoreState>((set) => ({
  hoveredIds: null,
  cone: null,
  setHovered: (ids: TracedId | TracedId[] | null): void => {
    if (ids === null) {
      set({ hoveredIds: null, cone: null })
      return
    }
    const hoveredIds: ReadonlySet<TracedId> = new Set(Array.isArray(ids) ? ids : [ids])
    const cone = new Set<TracedId>(hoveredIds)
    for (const rootId of hoveredIds) {
      for (const depId of dependents(rootId)) cone.add(depId)
    }
    set({ hoveredIds, cone })
  },
}))

/** True if `id` should render dimmed right now — outside the active hover cone. Always false when nothing is hovered. */
export function isDimmed(cone: ReadonlySet<TracedId> | null, id: TracedId): boolean {
  return cone !== null && !cone.has(id)
}
