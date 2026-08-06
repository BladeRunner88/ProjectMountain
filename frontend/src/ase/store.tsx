import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Rng } from '../mock/rng'
import { applyConflictPolicy, CONFLICT_STRATEGY_LABEL, type Conflict, type ConflictPolicy } from './conflict'
import { buildDataset, tickOnce, type Dataset } from './dataset'
import { instant, type Instant } from './traced'

// The one place a tab is allowed to get data from (S1f acceptance c: "no tab
// component imports a data generator"). `dataset.ts` is never imported
// outside this file and its own test — every tab reads through `useDataset`.

const TICK_INTERVAL_MS = 5000
const LIVE_TICK_SEED = 20260804717

// S9.4: a record of every CHANGE POLICY action taken this session — what
// Revision reads to show "corrections a person has made." Session-only, not
// baked into buildDataset(), because it's the live consequence of a human
// acting in the running app, not a fact the dataset was seeded with.
export interface RevisionEntry {
  id: string
  at: Instant
  sentence: string
}

// S9.5b: every access to a sealed ante-mortem record, with who/when/why —
// the audit chain 9.11 will formalise, minimally stood up now so this
// block's own acceptance ("every access appears in the audit chain") is
// genuinely true rather than a forward reference to nothing.
export interface AuditEntry {
  id: string
  at: Instant
  who: string
  what: string
  why: string
}

interface DatasetContextValue {
  dataset: Dataset
  /** Bumps on every live tick so a component reading a value through `latest()` knows to re-render, even though the TracedValue reference it originally captured didn't itself change. */
  tick: number
  revisionLog: RevisionEntry[]
  /** The one path anything in the Control Room writes a human action to Revision through — CHANGE POLICY uses it, and so does S9.5's WIDEN THE MODEL / FLAG THE SOURCE (a model-level action has no TracedValue to supersede, just a sentence someone should see recorded). */
  logRevision: (sentence: string) => void
  /** The CHANGE POLICY action: re-resolves `conflict` under `newPolicy` in the real graph, appends what happened to `revisionLog`, and bumps `tick` so every reader (the conflict panel, the activity lane, Revision itself) picks it up. */
  changeConflictPolicy: (conflict: Conflict, newPolicy: ConflictPolicy) => void
  /** climberIds with an incident open right now — the manual "a coordinator opens an incident" unseal path (the automatic path is the climber's own anomaly state, checked separately). */
  openIncidents: Set<string>
  openIncident: (climberId: string, climberLabel: string) => void
  auditLog: AuditEntry[]
  logAccess: (who: string, what: string, why: string) => void
}

const DatasetCtx = createContext<DatasetContextValue | null>(null)

export function DatasetProvider({ children }: { children: ReactNode }) {
  // Not useMemo: `buildDataset` isn't pure — it calls `clearRegistry()` and
  // populates the module-level graph as a side effect. StrictMode's dev-only
  // double-invocation of useMemo initializers would run it twice, and the
  // second call's clearRegistry() would wipe out every TracedId the first
  // call's returned Dataset still references — exactly the "dangling
  // TracedId" crash this ref-guard exists to prevent. A ref only ever set
  // once survives StrictMode's double render correctly.
  const datasetRef = useRef<Dataset | null>(null)
  if (datasetRef.current === null) {
    datasetRef.current = buildDataset()
  }
  const dataset = datasetRef.current
  const [tick, setTick] = useState(0)
  const [revisionLog, setRevisionLog] = useState<RevisionEntry[]>([])
  const [openIncidents, setOpenIncidents] = useState<Set<string>>(new Set())
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([])

  useEffect(() => {
    const rng = new Rng(LIVE_TICK_SEED)
    const interval = setInterval(() => {
      tickOnce(dataset, rng)
      setTick((t) => t + 1)
    }, TICK_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [dataset])

  const logRevision = useCallback((sentence: string) => {
    setRevisionLog((log) => [{ id: `revision-${log.length + 1}`, at: instant(new Date().toISOString()), sentence }, ...log])
    setTick((t) => t + 1)
  }, [])

  const changeConflictPolicy = useCallback(
    (conflict: Conflict, newPolicy: ConflictPolicy) => {
      const fromLabel = CONFLICT_STRATEGY_LABEL[conflict.policy.strategy]
      const toLabel = CONFLICT_STRATEGY_LABEL[newPolicy.strategy]
      applyConflictPolicy(conflict, newPolicy)
      logRevision(`${conflict.propertyLabel} policy for ${conflict.entityLabel} changed from ${fromLabel} to ${toLabel}.`)
    },
    [logRevision]
  )

  const logAccess = useCallback((who: string, what: string, why: string) => {
    setAuditLog((log) => [{ id: `audit-${log.length + 1}`, at: instant(new Date().toISOString()), who, what, why }, ...log])
  }, [])

  const openIncident = useCallback(
    (climberId: string, climberLabel: string) => {
      setOpenIncidents((prev) => {
        if (prev.has(climberId)) return prev
        const next = new Set(prev)
        next.add(climberId)
        return next
      })
      logAccess('Coordinator', `Opened an incident for ${climberLabel}`, 'Manual incident open — unseals the ante-mortem record.')
    },
    [logAccess]
  )

  const value = useMemo(
    () => ({ dataset, tick, revisionLog, logRevision, changeConflictPolicy, openIncidents, openIncident, auditLog, logAccess }),
    [dataset, tick, revisionLog, logRevision, changeConflictPolicy, openIncidents, openIncident, auditLog, logAccess]
  )

  return <DatasetCtx.Provider value={value}>{children}</DatasetCtx.Provider>
}

export function useDataset(): DatasetContextValue {
  const ctx = useContext(DatasetCtx)
  if (!ctx) throw new Error('useDataset must be used within DatasetProvider')
  return ctx
}
