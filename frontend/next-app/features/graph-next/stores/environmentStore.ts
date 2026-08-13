'use client'

// S8.4b: THE ENVIRONMENT NODE'S live data. Fourteen readings, ALL ticking
// simultaneously — unlike vitalsStore's one-active-person-at-a-time
// buffers, every region's environment node is "never static and never
// collapses", so this tracks all 14 continuously while NETWORK is
// mounted, not just whichever one is hovered. Owns the ONE timer this
// needs; NetworkView calls start()/stop(), nothing here is a
// component-level interval — same shape as vitalsStore.ts (S8.9): a
// seeded BASELINE (dataset.ts) walked forward by ordinary Math.random()
// once live, since only the starting point needs to be reproducible.

import { ENVIRONMENT_FREEZING_BREACH_M, ENVIRONMENT_TEMP_BREACH_C, ENVIRONMENT_VISIBILITY_BREACH_KM, ENVIRONMENT_WIND_BREACH_KPH } from '../services/dataset'
import type { DomainDataset, EnvironmentNode } from '../types/domain'
import type { GraphId } from '../types/graph'

const TICK_MS = 2200

export interface EnvironmentReading {
  windKph: number
  temperatureC: number
  visibilityKm: number
  freezingLevelM: number
  breached: boolean
}

export interface EnvironmentSnapshot {
  readings: ReadonlyMap<GraphId, EnvironmentReading>
}

export const ENVIRONMENT_SSR_SNAPSHOT: EnvironmentSnapshot = { readings: new Map() }

export interface EnvironmentStore {
  getSnapshot(): EnvironmentSnapshot
  getServerSnapshot(): EnvironmentSnapshot
  subscribe(cb: () => void): () => void
  start(dataset: DomainDataset): void
  stop(): void
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

/** The SAME thresholds dataset.ts seeds the baseline `breached` flag from — a live reading and the dataset's own starting value can never disagree about what "breached" means. */
function computeBreach(r: Omit<EnvironmentReading, 'breached'>): boolean {
  return (
    r.windKph > ENVIRONMENT_WIND_BREACH_KPH ||
    r.temperatureC < ENVIRONMENT_TEMP_BREACH_C ||
    r.visibilityKm < ENVIRONMENT_VISIBILITY_BREACH_KM ||
    r.freezingLevelM > ENVIRONMENT_FREEZING_BREACH_M
  )
}

function readingFromNode(node: EnvironmentNode): EnvironmentReading {
  return {
    windKph: node.windKph,
    temperatureC: node.temperatureC,
    visibilityKm: node.visibilityKm,
    freezingLevelM: node.freezingLevelM,
    breached: node.breached,
  }
}

export function createEnvironmentStore(): EnvironmentStore {
  let snapshot: EnvironmentSnapshot = { readings: new Map() }
  const listeners = new Set<() => void>()
  let intervalId: ReturnType<typeof setInterval> | null = null

  function emit() {
    for (const l of listeners) l()
  }

  function tick(nodes: readonly EnvironmentNode[]) {
    const readings = new Map<GraphId, EnvironmentReading>()
    for (const node of nodes) {
      const base = snapshot.readings.get(node.id) ?? readingFromNode(node)
      const next = {
        windKph: clamp(base.windKph + (Math.random() - 0.5) * 4, 5, 110),
        temperatureC: clamp(base.temperatureC + (Math.random() - 0.5) * 1.5, -45, 5),
        visibilityKm: clamp(base.visibilityKm + (Math.random() - 0.5) * 0.6, 0.2, 25),
        freezingLevelM: clamp(base.freezingLevelM + (Math.random() - 0.5) * 40, 3200, 6000),
      }
      readings.set(node.id, { ...next, breached: computeBreach(next) })
    }
    snapshot = { readings }
    emit()
  }

  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => ENVIRONMENT_SSR_SNAPSHOT,
    subscribe(cb) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    start(dataset) {
      if (intervalId !== null) return
      tick(dataset.environmentNodes)
      intervalId = setInterval(() => tick(dataset.environmentNodes), TICK_MS)
    },
    stop() {
      if (intervalId !== null) {
        clearInterval(intervalId)
        intervalId = null
      }
    },
  }
}

/** S8.2-rule-1-style singleton, same as graphStore/vitalsStore — one store, not a per-mount instance. */
export const environmentStore = createEnvironmentStore()
