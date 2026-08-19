"use client"

import { useEffect, useMemo, type ReactElement, type ReactNode } from "react"

import { ErrorState } from "@/components/ui/error-state"
import { LoadingState } from "@/components/ui/loading-state"

import { tickOnce } from "../services/dataset"
import { Rng } from "../services/rng"
import { describeWorldError } from "../services/world"
import { type DatasetValue, useDatasetStore } from "../stores/datasetStore"
import { useWorldQuery } from "./useWorldQuery"

const TICK_INTERVAL_MS = 5000
const LIVE_TICK_SEED = 20260804717

export type {
  AuditEntry,
  DatasetValue,
  RevisionEntry,
} from "../stores/datasetStore"

/**
 * Owns the live graph singleton and the 5s tick.
 *
 * The world — every plant, line, machine, sensor, vendor feed and pipeline
 * stage — is fetched from the backend before anything is built. Nothing
 * renders against invented entities: until the world arrives there is a
 * loading state, and if it cannot be fetched there is an error rather than a
 * fabricated fallback.
 */
export function DatasetProvider({
  children,
}: {
  children: ReactNode
}): ReactElement {
  const { data: world, isPending, isError, error, refetch } = useWorldQuery()
  const dataset = useDatasetStore((s) => s.dataset)

  useEffect(() => {
    if (world) useDatasetStore.getState().initialize(world)
  }, [world])

  useEffect(() => {
    if (!dataset) return undefined
    const rng = new Rng(LIVE_TICK_SEED)
    const interval = setInterval(() => {
      tickOnce(dataset, rng)
      useDatasetStore.getState().bumpTick()
    }, TICK_INTERVAL_MS)
    return (): void => clearInterval(interval)
  }, [dataset])

  if (isError) {
    return (
      <ErrorState
        variant="dark"
        message={describeWorldError(
          error,
          "The Control Room could not load its world."
        )}
        onRetry={() => void refetch()}
      />
    )
  }
  if (isPending || !dataset) {
    return <LoadingState variant="dark" label="Loading the plant" />
  }
  return <>{children}</>
}

export function useDataset(): DatasetValue {
  const snapshot = useDatasetStore()
  return useMemo((): DatasetValue => {
    if (!snapshot.dataset) {
      throw new Error("useDataset must be used within DatasetProvider")
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
