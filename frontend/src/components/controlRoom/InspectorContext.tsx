import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

// Only the inspector's own chrome state lives here — which selection is
// active now lives in ase/selection.tsx, since Metric (an engine-layer
// component, not a Control-Room-specific one) needs to write to it too.
interface InspectorChromeContextValue {
  collapsed: boolean
  toggleCollapsed: () => void
}

const InspectorChromeCtx = createContext<InspectorChromeContextValue | null>(null)

const COLLAPSED_KEY = 'controlRoom.inspector.collapsed'

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

export function InspectorProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(readCollapsed)

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0')
      } catch {
        // best-effort persistence only — a private-browsing tab without
        // localStorage still gets a working, just non-persisted, toggle
      }
      return next
    })
  }, [])

  const value = useMemo(() => ({ collapsed, toggleCollapsed }), [collapsed, toggleCollapsed])

  return <InspectorChromeCtx.Provider value={value}>{children}</InspectorChromeCtx.Provider>
}

export function useInspectorChrome(): InspectorChromeContextValue {
  const ctx = useContext(InspectorChromeCtx)
  if (!ctx) throw new Error('useInspectorChrome must be used within InspectorProvider')
  return ctx
}
