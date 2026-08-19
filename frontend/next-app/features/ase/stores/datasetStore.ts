"use client"

import { create } from "zustand"
import {
  applyConflictPolicy,
  CONFLICT_STRATEGY_LABEL,
  type Conflict,
  type ConflictPolicy,
} from "../services/conflict"
import { buildDataset, type Dataset } from "../services/dataset"
import type { AseWorld } from "../types/world"
import {
  computeSeal,
  type AuditRecordEntry,
  type QueueItem,
} from "../services/revision"
import { instant, type Instant } from "../services/traced"

export interface RevisionEntry {
  id: string
  at: Instant
  sentence: string
}

export interface AuditEntry {
  id: string
  at: Instant
  who: string
  what: string
  why: string
}

export interface DatasetValue {
  dataset: Dataset
  /** Bumps on every live tick so a component reading a value through `latest()` knows to re-render, even though the TracedValue reference it originally captured didn't itself change. */
  tick: number
  revisionLog: RevisionEntry[]
  /** The one path anything in the Control Room writes a human action to Revision through — CHANGE POLICY uses it, and so does S9.5's WIDEN THE MODEL / FLAG THE SOURCE (a model-level action has no TracedValue to supersede, just a sentence someone should see recorded). */
  logRevision: (sentence: string) => void
  /** The CHANGE POLICY action: re-resolves `conflict` under `newPolicy` in the real graph, appends what happened to `revisionLog`, and bumps `tick` so every reader (the conflict panel, the activity lane, Revision itself) picks it up. */
  changeConflictPolicy: (conflict: Conflict, newPolicy: ConflictPolicy) => void
  /** machineIds with an incident open right now — the manual "a coordinator opens an incident" unseal path (the automatic path is the machine's own anomaly state, checked separately). */
  openIncidents: Set<string>
  openIncident: (machineId: string, machineLabel: string) => void
  auditLog: AuditEntry[]
  logAccess: (who: string, what: string, why: string) => void
  /** S9.11's real seal-chained audit chain — seeded from `dataset.revision.auditSeed`, then genuinely extended (each new entry's seal chained to the previous) by every action Revision's Queue takes. This is what Record actually reads; `auditLog` above stays as the lighter S9.5b access log it always was. */
  auditRecord: AuditRecordEntry[]
  appendAuditRecordEntry: (
    entry: Omit<AuditRecordEntry, "id" | "at" | "seal">
  ) => void
  /** S9.13: "Trust feeds Revision" — a challenged decision, a security finding, a coverage drop or a budget violation genuinely lands here, merged into RevisionQueue's own rendering, not just logged as a toast. Session-only, the same way `extraQueueItems` mirrors `auditRecord`'s live-append pattern. */
  extraQueueItems: QueueItem[]
  addQueueItem: (item: QueueItem) => void
}

interface DatasetStoreState {
  dataset: Dataset | null
  /** The entities, sources and stages the backend reported. */
  world: AseWorld | null
  tick: number
  revisionLog: RevisionEntry[]
  openIncidents: Set<string>
  auditLog: AuditEntry[]
  auditRecord: AuditRecordEntry[]
  extraQueueItems: QueueItem[]
  /** Seeds the graph from the world the backend serves. Idempotent. */
  initialize: (world: AseWorld) => void
  bumpTick: () => void
  logRevision: (sentence: string) => void
  changeConflictPolicy: (conflict: Conflict, newPolicy: ConflictPolicy) => void
  logAccess: (who: string, what: string, why: string) => void
  appendAuditRecordEntry: (
    entry: Omit<AuditRecordEntry, "id" | "at" | "seal">
  ) => void
  addQueueItem: (item: QueueItem) => void
  openIncident: (machineId: string, machineLabel: string) => void
}

export const useDatasetStore = create<DatasetStoreState>((set, get) => ({
  dataset: null,
  world: null,
  tick: 0,
  revisionLog: [],
  openIncidents: new Set<string>(),
  auditLog: [],
  auditRecord: [],
  extraQueueItems: [],
  initialize: (world: AseWorld): void => {
    if (get().dataset) return
    // `buildDataset` is not pure — it clears a module registry — so this is
    // guarded rather than re-run. The store is module-level, so the guard
    // survives a StrictMode remount.
    const dataset = buildDataset(world)
    set({ dataset, world, auditRecord: dataset.revision.auditSeed })
  },
  bumpTick: (): void => {
    set((s) => ({ tick: s.tick + 1 }))
  },
  logRevision: (sentence: string): void => {
    set((s) => ({
      revisionLog: [
        {
          id: `revision-${s.revisionLog.length + 1}`,
          at: instant(new Date().toISOString()),
          sentence,
        },
        ...s.revisionLog,
      ],
      tick: s.tick + 1,
    }))
  },
  changeConflictPolicy: (
    conflict: Conflict,
    newPolicy: ConflictPolicy
  ): void => {
    const fromLabel = CONFLICT_STRATEGY_LABEL[conflict.policy.strategy]
    const toLabel = CONFLICT_STRATEGY_LABEL[newPolicy.strategy]
    applyConflictPolicy(conflict, newPolicy)
    get().logRevision(
      `${conflict.propertyLabel} policy for ${conflict.entityLabel} changed from ${fromLabel} to ${toLabel}.`
    )
  },
  logAccess: (who: string, what: string, why: string): void => {
    set((s) => ({
      auditLog: [
        {
          id: `audit-${s.auditLog.length + 1}`,
          at: instant(new Date().toISOString()),
          who,
          what,
          why,
        },
        ...s.auditLog,
      ],
    }))
  },
  appendAuditRecordEntry: (
    entry: Omit<AuditRecordEntry, "id" | "at" | "seal">
  ): void => {
    set((s) => {
      const withoutSeal = {
        ...entry,
        id: `audit-live-${s.auditRecord.length + 1}`,
        at: instant(new Date().toISOString()),
      }
      const previousSeal =
        s.auditRecord.length > 0
          ? s.auditRecord[s.auditRecord.length - 1].seal
          : "genesis"
      const seal = computeSeal(withoutSeal, previousSeal)
      return {
        auditRecord: [...s.auditRecord, { ...withoutSeal, seal }],
        tick: s.tick + 1,
      }
    })
  },
  addQueueItem: (item: QueueItem): void => {
    set((s) => ({
      extraQueueItems: s.extraQueueItems.some((i) => i.id === item.id)
        ? s.extraQueueItems
        : [...s.extraQueueItems, item],
      tick: s.tick + 1,
    }))
  },
  openIncident: (machineId: string, machineLabel: string): void => {
    set((s) => {
      if (s.openIncidents.has(machineId)) return s
      const openIncidents = new Set(s.openIncidents)
      openIncidents.add(machineId)
      return { openIncidents }
    })
    get().logAccess(
      "Coordinator",
      `Opened an incident for ${machineLabel}`,
      "Manual incident open — unseals the service dossier record."
    )
  },
}))
