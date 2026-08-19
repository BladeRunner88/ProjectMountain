'use client'

import { useSyncExternalStore } from 'react'
import { graphStore, type GraphSnapshot, type GraphStore } from '../stores/graphStore'

export function useGraphSnapshot(): GraphSnapshot {
  return useSyncExternalStore(graphStore.subscribe, graphStore.getSnapshot, graphStore.getServerSnapshot)
}

/** The module singleton — mutations stay on the store, not in React state. */
export function useGraphStore(): GraphStore {
  return graphStore
}
