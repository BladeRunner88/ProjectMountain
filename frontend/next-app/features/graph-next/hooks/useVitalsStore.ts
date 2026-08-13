'use client'

import { useSyncExternalStore } from 'react'
import { vitalsStore, type VitalsSnapshot, type VitalsStore } from '../stores/vitalsStore'

export function useVitalsSnapshot(): VitalsSnapshot {
  return useSyncExternalStore(vitalsStore.subscribe, vitalsStore.getSnapshot, vitalsStore.getServerSnapshot)
}

export function useVitalsStore(): VitalsStore {
  return vitalsStore
}
