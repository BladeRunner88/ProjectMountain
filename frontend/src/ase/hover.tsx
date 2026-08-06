import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { dependents } from './folds'
import type { TracedId } from './traced'

// S1f interconnection rule 2: hovering anything computes dependents() and
// dims everything outside its cone to 12%, across the whole viewport. This
// is why Metric — not each tab — owns the dim check: any Metric anywhere
// that's currently mounted reads the same cone, so a tab never has to know
// about any other tab's content to cooperate with this rule.
//
// The hovered target is a *set* of root ids, not one: a source chip on
// Overview represents several independent observation chains (reliability,
// last-sync-age, ...) that don't derive from each other, so "hovering the
// chip" has to union their dependents — a single root id would only catch
// whichever one chain that id happened to belong to.
interface HoverContextValue {
  hoveredIds: ReadonlySet<TracedId> | null
  /** null when nothing is hovered — everything renders at full opacity. Otherwise the hovered ids plus everything that depends on any of them. */
  cone: ReadonlySet<TracedId> | null
  setHovered: (ids: TracedId | TracedId[] | null) => void
}

const HoverCtx = createContext<HoverContextValue | null>(null)

export function HoverProvider({ children }: { children: ReactNode }) {
  const [hoveredIds, setHoveredIds] = useState<ReadonlySet<TracedId> | null>(null)

  const cone = useMemo(() => {
    if (!hoveredIds) return null
    const set = new Set<TracedId>(hoveredIds)
    for (const rootId of hoveredIds) {
      for (const depId of dependents(rootId)) set.add(depId)
    }
    return set
  }, [hoveredIds])

  const setHovered = useCallback((ids: TracedId | TracedId[] | null) => {
    if (ids === null) {
      setHoveredIds(null)
    } else {
      setHoveredIds(new Set(Array.isArray(ids) ? ids : [ids]))
    }
  }, [])

  const value = useMemo(() => ({ hoveredIds, cone, setHovered }), [hoveredIds, cone, setHovered])

  return <HoverCtx.Provider value={value}>{children}</HoverCtx.Provider>
}

export function useHover(): HoverContextValue {
  const ctx = useContext(HoverCtx)
  if (!ctx) throw new Error('useHover must be used within HoverProvider')
  return ctx
}

/** True if `id` should render dimmed right now — outside the active hover cone. Always false when nothing is hovered. */
export function isDimmed(cone: ReadonlySet<TracedId> | null, id: TracedId): boolean {
  return cone !== null && !cone.has(id)
}
