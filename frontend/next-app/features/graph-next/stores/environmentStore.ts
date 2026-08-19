"use client"

// S8.4b: THE ENVIRONMENT NODE'S live data. Fourteen readings, ALL ticking
// simultaneously — unlike readingsStore's one-active-person-at-a-time
// buffers, every plant's environment node is "never static and never
// collapses", so this tracks all 14 continuously while NETWORK is
// mounted, not just whichever one is hovered. Owns the ONE timer this
// needs; NetworkView calls start()/stop(), nothing here is a
// component-level interval — same shape as readingsStore.ts (S8.9): a
// seeded BASELINE (dataset.ts) walked forward by ordinary Math.random()
// once live, since only the starting point needs to be reproducible.

import {
  ENVIRONMENT_CYCLE_TIME_BREACH_S,
  ENVIRONMENT_SPINDLE_TEMP_BREACH_C,
  ENVIRONMENT_OEE_BREACH_PCT,
  ENVIRONMENT_VIBRATION_BREACH_MM_S,
} from "../services/dataset"
import { CHANNEL, fetchSnapshot, type Snapshot } from "@/features/telemetry"

import type { DomainDataset, EnvironmentNode } from "../types/domain"
import type { GraphId } from "../types/graph"

/** Matches the backend's tick grid — polling faster returns the same frame. */
const TICK_MS = 5000

export interface EnvironmentReading {
  vibrationMmS: number
  spindleTempC: number
  oeePct: number
  cycleTimeS: number
  breached: boolean
}

export interface EnvironmentSnapshot {
  readings: ReadonlyMap<GraphId, EnvironmentReading>
}

export const ENVIRONMENT_SSR_SNAPSHOT: EnvironmentSnapshot = {
  readings: new Map(),
}

export interface EnvironmentStore {
  getSnapshot(): EnvironmentSnapshot
  getServerSnapshot(): EnvironmentSnapshot
  subscribe(cb: () => void): () => void
  start(dataset: DomainDataset): void
  stop(): void
}

/** The SAME thresholds dataset.ts seeds the baseline `breached` flag from — a live reading and the dataset's own starting value can never disagree about what "breached" means. */
function computeBreach(r: Omit<EnvironmentReading, "breached">): boolean {
  return (
    r.vibrationMmS > ENVIRONMENT_VIBRATION_BREACH_MM_S ||
    r.spindleTempC < ENVIRONMENT_SPINDLE_TEMP_BREACH_C ||
    r.oeePct < ENVIRONMENT_OEE_BREACH_PCT ||
    r.cycleTimeS > ENVIRONMENT_CYCLE_TIME_BREACH_S
  )
}

function readingFromNode(node: EnvironmentNode): EnvironmentReading {
  return {
    vibrationMmS: node.vibrationMmS,
    spindleTempC: node.spindleTempC,
    oeePct: node.oeePct,
    cycleTimeS: node.cycleTimeS,
    breached: node.breached,
  }
}

export function createEnvironmentStore(): EnvironmentStore {
  let snapshot: EnvironmentSnapshot = { readings: new Map() }
  const listeners = new Set<() => void>()
  let intervalId: ReturnType<typeof setInterval> | null = null
  let inFlight: AbortController | null = null

  function emit(): void {
    for (const listener of listeners) listener()
  }

  /**
   * One reading per plant, aggregated from the machines standing on it.
   *
   * A plant does not have its own sensor — its condition is the condition of
   * what it contains, which is why this is a mean of real machine channels
   * rather than a figure of its own. It was a `Math.random()` walk.
   */
  async function poll(nodes: readonly EnvironmentNode[]): Promise<void> {
    inFlight?.abort()
    const controller = new AbortController()
    inFlight = controller

    try {
      const frame = await fetchSnapshot(
        { windowSeconds: 0, channels: WATCHED_CHANNELS, limit: 500 },
        { signal: controller.signal }
      )
      const byPlant = aggregateByPlant(frame)

      const readings = new Map<GraphId, EnvironmentReading>()
      for (const node of nodes) {
        const measured = byPlant.get(node.plantId) ?? readingFromNode(node)
        readings.set(node.id, {
          ...measured,
          breached: computeBreach(measured),
        })
      }
      snapshot = { readings }
      emit()
    } catch {
      // Keep the last good frame; the next tick retries.
    }
  }

  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => ENVIRONMENT_SSR_SNAPSHOT,
    subscribe(callback) {
      listeners.add(callback)
      return () => listeners.delete(callback)
    },
    start(dataset) {
      if (intervalId !== null) return
      void poll(dataset.environmentNodes)
      intervalId = setInterval(
        () => void poll(dataset.environmentNodes),
        TICK_MS
      )
    },
    stop() {
      if (intervalId !== null) {
        clearInterval(intervalId)
        intervalId = null
      }
      inFlight?.abort()
      inFlight = null
    },
  }
}

const WATCHED_CHANNELS = [
  CHANNEL.vibration,
  CHANNEL.spindleTemp,
  CHANNEL.oee,
  CHANNEL.cycleTime,
]

/** Mean of each channel across every machine reporting, keyed by machine id prefix. */
function aggregateByPlant(
  frame: Snapshot
): Map<string, Omit<EnvironmentReading, "breached">> {
  const sums = new Map<string, { channel: Map<string, number[]> }>()
  for (const reading of frame.readings) {
    if (!reading.machineId) continue
    const entry = sums.get(reading.machineId) ?? {
      channel: new Map<string, number[]>(),
    }
    const values = entry.channel.get(reading.channel) ?? []
    values.push(reading.value)
    entry.channel.set(reading.channel, values)
    sums.set(reading.machineId, entry)
  }

  const out = new Map<string, Omit<EnvironmentReading, "breached">>()
  for (const [machineId, entry] of sums) {
    out.set(machineId, {
      vibrationMmS: mean(entry.channel.get(CHANNEL.vibration)),
      spindleTempC: mean(entry.channel.get(CHANNEL.spindleTemp)),
      oeePct: mean(entry.channel.get(CHANNEL.oee)),
      cycleTimeS: mean(entry.channel.get(CHANNEL.cycleTime)),
    })
  }
  return out
}

function mean(values: number[] | undefined): number {
  if (!values || values.length === 0) return 0
  return values.reduce((total, value) => total + value, 0) / values.length
}

/** S8.2-rule-1-style singleton, same as graphStore/readingsStore — one store, not a per-mount instance. */
export const environmentStore = createEnvironmentStore()
