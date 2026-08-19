'use client'

import { useChromeStore } from '../stores/chromeStore'

export interface InspectorChromeValue {
  collapsed: boolean
  toggleCollapsed: () => void
}

export function useInspectorChrome(): InspectorChromeValue {
  const collapsed = useChromeStore((s) => s.inspectorCollapsed)
  const toggleCollapsed = useChromeStore((s) => s.toggleInspectorCollapsed)
  return { collapsed, toggleCollapsed }
}
