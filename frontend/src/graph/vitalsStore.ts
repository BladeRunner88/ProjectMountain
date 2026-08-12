// S8.9: LIVE — "SpO2 and heart rate as big numerals with 40-point
// sparklines reading from the store's rolling buffers." This is that
// store. It owns the ONE timer this ticking data needs — deliberately NOT
// the panel's (S8.9: "the panel owns no timers") — started/stopped via
// `setActiveClimber`, the same start/stop-on-demand shape graphStore's own
// rAF drift loop uses. Switching climbers reseeds the buffers from
// scratch, so nothing from the previous person's readings can leak into
// the next person's sparkline.

import { mulberry32, seedFromString } from './rng'
import type { GraphId } from './types'

export const BUFFER_SIZE = 40
const TICK_MS = 1600
const FIX_AGE_STEP_MIN = 0.4

export type VitalsTrend = 'nominal' | 'watch' | 'anomaly'

export interface VitalsSnapshot {
  climberId: GraphId | null
  spo2: readonly number[]
  hr: readonly number[]
  spo2Baseline: number
  hrBaseline: number
  systolic: number
  diastolic: number
  fixAgeMinutes: number
}

const EMPTY_SNAPSHOT: VitalsSnapshot = {
  climberId: null,
  spo2: [],
  hr: [],
  spo2Baseline: 0,
  hrBaseline: 0,
  systolic: 0,
  diastolic: 0,
  fixAgeMinutes: 0,
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

function seedBuffer(rand: () => number, baseline: number, spread: number, trendPerStep: number): number[] {
  const out: number[] = []
  let v = baseline
  for (let i = 0; i < BUFFER_SIZE; i++) {
    v += (rand() - 0.5) * spread + trendPerStep
    out.push(v)
  }
  return out
}

export interface VitalsStore {
  getSnapshot(): VitalsSnapshot
  subscribe(cb: () => void): () => void
  /** Reseeds fresh buffers for `id` and (re)starts the tick loop; `id: null` stops it entirely — called on panel mount/selection-change/unmount, never by the panel's own timer since it has none. */
  setActiveClimber(id: GraphId | null, trend: VitalsTrend): void
}

export function createVitalsStore(): VitalsStore {
  let snapshot: VitalsSnapshot = EMPTY_SNAPSHOT
  const listeners = new Set<() => void>()
  let intervalId: ReturnType<typeof setInterval> | null = null

  function emit() {
    for (const l of listeners) l()
  }

  function stopInterval() {
    if (intervalId !== null) {
      clearInterval(intervalId)
      intervalId = null
    }
  }

  function tick() {
    const rand = Math.random
    const nextSpo2 = clamp(snapshot.spo2[snapshot.spo2.length - 1] + (rand() - 0.5) * 1.4, 55, 100)
    const nextHr = clamp(snapshot.hr[snapshot.hr.length - 1] + (rand() - 0.5) * 4, 40, 190)
    const spo2 = [...snapshot.spo2.slice(1), nextSpo2]
    const hr = [...snapshot.hr.slice(1), nextHr]
    snapshot = { ...snapshot, spo2, hr, fixAgeMinutes: snapshot.fixAgeMinutes + FIX_AGE_STEP_MIN }
    emit()
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(cb) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    setActiveClimber(id, trend) {
      stopInterval()
      if (!id) {
        snapshot = EMPTY_SNAPSHOT
        emit()
        return
      }
      const rand = mulberry32(seedFromString(id, 6200))
      const spo2Baseline = trend === 'anomaly' ? 78 + rand() * 8 : trend === 'watch' ? 88 + rand() * 5 : 93 + rand() * 5
      const hrBaseline = trend === 'anomaly' ? 105 + rand() * 25 : trend === 'watch' ? 85 + rand() * 15 : 62 + rand() * 20
      const spo2Trend = trend === 'anomaly' ? -0.12 : 0
      const hrTrend = trend === 'anomaly' ? 0.4 : 0
      snapshot = {
        climberId: id,
        spo2: seedBuffer(rand, spo2Baseline, 1.6, spo2Trend).map((v) => clamp(v, 55, 100)),
        hr: seedBuffer(rand, hrBaseline, 5, hrTrend).map((v) => clamp(v, 40, 190)),
        spo2Baseline: Math.round(spo2Baseline),
        hrBaseline: Math.round(hrBaseline),
        systolic: Math.round(108 + rand() * 30),
        diastolic: Math.round(66 + rand() * 20),
        fixAgeMinutes: rand() * 6,
      }
      emit()
      intervalId = setInterval(tick, TICK_MS)
    },
  }
}

/** S8.2-rule-1-style singleton — one store, not a per-panel instance, so a second mount (StrictMode) reseeds cleanly rather than racing two intervals. */
export const vitalsStore = createVitalsStore()
