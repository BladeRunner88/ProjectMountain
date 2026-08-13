'use client'

import { useEffect, useMemo, type ReactNode } from 'react'
import { tickOnce } from '../services/dataset'
import { Rng } from '../services/rng'
import { type DatasetValue, useDatasetStore } from '../stores/datasetStore'

const TICK_INTERVAL_MS = 5000
const LIVE_TICK_SEED = 20260804717

export type { AuditEntry, DatasetValue, RevisionEntry } from '../stores/datasetStore'

/**
 * Owns the live graph singleton and the 5s tick. Must wrap any tree that
 * calls `useDataset`. `buildDataset` is not pure (it `clearRegistry()`s), so
 * initialization is guarded the same way the old DatasetProvider used a ref:
 * once per JS realm, surviving StrictMode remounts because the store is
 * module-level.
 */
export function DatasetProvider({ children }: { children: ReactNode }): ReactNode {
  if (!useDatasetStore.getState().dataset) {
    useDatasetStore.getState().initialize()
  }
  const dataset = useDatasetStore((s) => s.dataset)

  useEffect(() => {
    if (!dataset) return undefined
    const rng = new Rng(LIVE_TICK_SEED)
    const interval = setInterval(() => {
      tickOnce(dataset, rng)
      useDatasetStore.getState().bumpTick()
    }, TICK_INTERVAL_MS)
    return (): void => clearInterval(interval)
  }, [dataset])

  return children
}

export function useDataset(): DatasetValue {
  const snapshot = useDatasetStore()
  return useMemo((): DatasetValue => {
    if (!snapshot.dataset) {
      throw new Error('useDataset must be used within DatasetProvider')
    }
    return {
      dataset: snapshot.dataset,
      tick: snapshot.tick,
      revisionLog: snapshot.revisionLog,
      logRevision: snapshot.logRevision,
      changeConflictPolicy: snapshot.changeConflictPolicy,
      openIncidents: snapshot.openIncidents,
      openIncident: snapshot.openIncident,
      auditLog: snapshot.auditLog,
      logAccess: snapshot.logAccess,
      auditRecord: snapshot.auditRecord,
      appendAuditRecordEntry: snapshot.appendAuditRecordEntry,
      extraQueueItems: snapshot.extraQueueItems,
      addQueueItem: snapshot.addQueueItem,
    }
  }, [snapshot])
}
