'use client'

import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'

import type { Density } from '../types/density'

const INSPECTOR_KEY = 'controlRoom.inspector.collapsed'
const DENSITY_KEY = 'controlRoom.density'
const ACTIVITY_KEY = 'controlRoom.activityLane.expanded'
const BUNDLE_KEY = 'controlRoom.chrome'

export interface ChromePersisted {
  inspectorCollapsed: boolean
  density: Density
  activityLaneExpanded: boolean
}

export interface ChromeState extends ChromePersisted {
  toggleInspectorCollapsed: () => void
  setInspectorCollapsed: (collapsed: boolean) => void
  toggleDensity: () => void
  setDensity: (density: Density) => void
  toggleActivityLaneExpanded: () => void
  setActivityLaneExpanded: (expanded: boolean) => void
}

function readLegacy(): ChromePersisted {
  if (typeof window === 'undefined') {
    return { inspectorCollapsed: false, density: 'comfortable', activityLaneExpanded: false }
  }
  try {
    return {
      inspectorCollapsed: localStorage.getItem(INSPECTOR_KEY) === '1',
      density: localStorage.getItem(DENSITY_KEY) === 'compact' ? 'compact' : 'comfortable',
      activityLaneExpanded: localStorage.getItem(ACTIVITY_KEY) === '1',
    }
  } catch {
    return { inspectorCollapsed: false, density: 'comfortable', activityLaneExpanded: false }
  }
}

function writeLegacy(state: ChromePersisted): void {
  try {
    localStorage.setItem(INSPECTOR_KEY, state.inspectorCollapsed ? '1' : '0')
    localStorage.setItem(DENSITY_KEY, state.density === 'compact' ? 'compact' : 'comfortable')
    localStorage.setItem(ACTIVITY_KEY, state.activityLaneExpanded ? '1' : '0')
  } catch {
    // best-effort persistence only
  }
}

const storage: StateStorage = {
  getItem: (name): string | null => {
    try {
      const bundled = localStorage.getItem(name)
      if (bundled) return bundled
      return JSON.stringify({ state: readLegacy(), version: 0 })
    } catch {
      return null
    }
  },
  setItem: (name, value): void => {
    try {
      localStorage.setItem(name, value)
      const parsed = JSON.parse(value) as { state?: Partial<ChromePersisted> }
      const state = parsed.state
      if (!state) return
      writeLegacy({
        inspectorCollapsed: Boolean(state.inspectorCollapsed),
        density: state.density === 'compact' ? 'compact' : 'comfortable',
        activityLaneExpanded: Boolean(state.activityLaneExpanded),
      })
    } catch {
      // best-effort persistence only
    }
  },
  removeItem: (name): void => {
    try {
      localStorage.removeItem(name)
      localStorage.removeItem(INSPECTOR_KEY)
      localStorage.removeItem(DENSITY_KEY)
      localStorage.removeItem(ACTIVITY_KEY)
    } catch {
      // best-effort persistence only
    }
  },
}

const initial = readLegacy()

export const useChromeStore = create<ChromeState>()(
  persist(
    (set) => ({
      inspectorCollapsed: initial.inspectorCollapsed,
      density: initial.density,
      activityLaneExpanded: initial.activityLaneExpanded,
      toggleInspectorCollapsed: (): void => {
        set((s) => ({ inspectorCollapsed: !s.inspectorCollapsed }))
      },
      setInspectorCollapsed: (collapsed: boolean): void => {
        set({ inspectorCollapsed: collapsed })
      },
      toggleDensity: (): void => {
        set((s) => ({ density: s.density === 'compact' ? 'comfortable' : 'compact' }))
      },
      setDensity: (density: Density): void => {
        set({ density })
      },
      toggleActivityLaneExpanded: (): void => {
        set((s) => ({ activityLaneExpanded: !s.activityLaneExpanded }))
      },
      setActivityLaneExpanded: (expanded: boolean): void => {
        set({ activityLaneExpanded: expanded })
      },
    }),
    {
      name: BUNDLE_KEY,
      storage: createJSONStorage(() => storage),
      partialize: (s): ChromePersisted => ({
        inspectorCollapsed: s.inspectorCollapsed,
        density: s.density,
        activityLaneExpanded: s.activityLaneExpanded,
      }),
    }
  )
)
