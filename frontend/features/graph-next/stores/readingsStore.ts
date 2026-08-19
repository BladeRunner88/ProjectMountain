"use client"

// S8.9: LIVE — effectiveness and vibration as big numerals with 40-point
// sparklines. This owns the ONE timer this ticking data needs.
//
// The readings come from the backend's telemetry snapshot, which reconstructs
// every sensor from its seeded profile and the instant asked for. They used to
// be a `Math.random()` walk seeded from the machine id: live-looking, but no
// two viewers ever saw the same number and nothing could be checked against
// anything. The snapshot is quantised to a five-second grid, so everyone
// looking at the same moment sees the same reading.

import { fetchSnapshot } from "@/features/telemetry"
import { CHANNEL, readingsByChannel } from "@/features/telemetry"

import type { GraphId } from "../types/graph"

export const BUFFER_SIZE = 40
/** Matches the backend's own tick grid — polling faster returns the same frame. */
const TICK_MS = 5000
/** 40 points at one point per tick. */
const WINDOW_SECONDS = BUFFER_SIZE * (TICK_MS / 1000)

export type ReadingsTrend = "nominal" | "watch" | "anomaly"

export interface ReadingsSnapshot {
  machineId: GraphId | null
  oee: readonly number[]
  vibration: readonly number[]
  oeeBaseline: number
  hrBaseline: number
  supplyBar: number
  returnBar: number
  fixAgeMinutes: number
  /** False until the first frame arrives, so a panel can say so. */
  loaded: boolean
}

const EMPTY_SNAPSHOT: ReadingsSnapshot = {
  machineId: null,
  oee: [],
  vibration: [],
  oeeBaseline: 0,
  hrBaseline: 0,
  supplyBar: 0,
  returnBar: 0,
  fixAgeMinutes: 0,
  loaded: false,
}

export interface ReadingsStore {
  getSnapshot(): ReadingsSnapshot
  getServerSnapshot(): ReadingsSnapshot
  subscribe(cb: () => void): () => void
  /** Starts polling for `id`; `id: null` stops it. Called on mount, selection change and unmount. */
  setActiveMachine(id: GraphId | null, trend: ReadingsTrend): void
}

const WATCHED_CHANNELS = [
  CHANNEL.oee,
  CHANNEL.vibration,
  CHANNEL.supplyPressure,
  CHANNEL.returnPressure,
]

export function createReadingsStore(): ReadingsStore {
  let snapshot: ReadingsSnapshot = EMPTY_SNAPSHOT
  const listeners = new Set<() => void>()
  let intervalId: ReturnType<typeof setInterval> | null = null
  let inFlight: AbortController | null = null

  function emit(): void {
    for (const listener of listeners) listener()
  }

  function stop(): void {
    if (intervalId !== null) {
      clearInterval(intervalId)
      intervalId = null
    }
    inFlight?.abort()
    inFlight = null
  }

  async function poll(machineId: GraphId): Promise<void> {
    inFlight?.abort()
    const controller = new AbortController()
    inFlight = controller

    try {
      const frame = await fetchSnapshot(
        {
          windowSeconds: WINDOW_SECONDS,
          channels: WATCHED_CHANNELS,
          limit: 500,
        },
        { signal: controller.signal }
      )
      // A selection change while this was in flight wins.
      if (snapshot.machineId !== machineId) return

      const byChannel = readingsByChannel(frame, machineId)
      const oee = byChannel.get(CHANNEL.oee)
      const vibration = byChannel.get(CHANNEL.vibration)
      const supply = byChannel.get(CHANNEL.supplyPressure)
      const returnLine = byChannel.get(CHANNEL.returnPressure)

      snapshot = {
        machineId,
        oee: oee?.series.map((point) => point.v) ?? [],
        vibration: vibration?.series.map((point) => point.v) ?? [],
        oeeBaseline: Math.round(oee?.baseline ?? 0),
        hrBaseline: Math.round(vibration?.baseline ?? 0),
        supplyBar: Number((supply?.value ?? 0).toFixed(2)),
        returnBar: Number((returnLine?.value ?? 0).toFixed(2)),
        // How stale the feed behind these readings is, in minutes.
        fixAgeMinutes: ageMinutes(
          frame.sources.find((s) => s.sourceFile.includes("scada"))
        ),
        loaded: true,
      }
      emit()
    } catch {
      // A failed poll leaves the last good frame on screen rather than
      // blanking the panel; the next tick retries.
    }
  }

  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => EMPTY_SNAPSHOT,
    subscribe(callback) {
      listeners.add(callback)
      return () => listeners.delete(callback)
    },
    setActiveMachine(id) {
      stop()
      if (!id) {
        snapshot = EMPTY_SNAPSHOT
        emit()
        return
      }
      snapshot = { ...EMPTY_SNAPSHOT, machineId: id }
      emit()
      void poll(id)
      intervalId = setInterval(() => void poll(id), TICK_MS)
    },
  }
}

function ageMinutes(source: { ageSeconds: number | null } | undefined): number {
  if (!source?.ageSeconds) return 0
  return Number((source.ageSeconds / 60).toFixed(1))
}

/** One store, not a per-panel instance, so a StrictMode remount cannot race two polls. */
export const readingsStore = createReadingsStore()
