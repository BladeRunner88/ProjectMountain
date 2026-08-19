'use client'

import { useSyncExternalStore } from 'react'
import { environmentStore, type EnvironmentSnapshot, type EnvironmentStore } from '../stores/environmentStore'

export function useEnvironmentSnapshot(): EnvironmentSnapshot {
  return useSyncExternalStore(environmentStore.subscribe, environmentStore.getSnapshot, environmentStore.getServerSnapshot)
}

export function useEnvironmentStore(): EnvironmentStore {
  return environmentStore
}
