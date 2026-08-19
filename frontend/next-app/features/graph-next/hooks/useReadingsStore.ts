'use client'

import { useSyncExternalStore } from 'react'
import { readingsStore, type ReadingsSnapshot, type ReadingsStore } from '../stores/readingsStore'

export function useReadingsSnapshot(): ReadingsSnapshot {
  return useSyncExternalStore(readingsStore.subscribe, readingsStore.getSnapshot, readingsStore.getServerSnapshot)
}

export function useReadingsStore(): ReadingsStore {
  return readingsStore
}
