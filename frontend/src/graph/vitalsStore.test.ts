import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BUFFER_SIZE, createVitalsStore } from './vitalsStore'

describe('graph/vitalsStore (S8.9)', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('starts empty — nothing tracked, nothing to render', () => {
    const store = createVitalsStore()
    expect(store.getSnapshot().climberId).toBeNull()
    expect(store.getSnapshot().spo2).toEqual([])
  })

  it('setActiveClimber seeds a full 40-point buffer immediately, synchronously — no waiting on the first tick', () => {
    const store = createVitalsStore()
    store.setActiveClimber('climber-1', 'nominal')
    const snap = store.getSnapshot()
    expect(snap.climberId).toBe('climber-1')
    expect(snap.spo2).toHaveLength(BUFFER_SIZE)
    expect(snap.hr).toHaveLength(BUFFER_SIZE)
  })

  it('is deterministic per climber id — same id, same seeded buffer', () => {
    const a = createVitalsStore()
    a.setActiveClimber('climber-7', 'watch')
    const snapA = a.getSnapshot()

    const b = createVitalsStore()
    b.setActiveClimber('climber-7', 'watch')
    const snapB = b.getSnapshot()

    expect(snapA.spo2).toEqual(snapB.spo2)
    expect(snapA.hr).toEqual(snapB.hr)
    expect(snapA.spo2Baseline).toBe(snapB.spo2Baseline)
  })

  it('an anomalous trend seeds a visibly worse SpO2 baseline than a nominal one', () => {
    const store = createVitalsStore()
    store.setActiveClimber('climber-9', 'anomaly')
    const anomalyBaseline = store.getSnapshot().spo2Baseline
    store.setActiveClimber('climber-9-nominal-twin', 'nominal')
    const nominalBaseline = store.getSnapshot().spo2Baseline
    expect(anomalyBaseline).toBeLessThan(nominalBaseline)
  })

  it('switching climbers fully replaces the buffer — no leak from the previous person', () => {
    const store = createVitalsStore()
    store.setActiveClimber('climber-1', 'nominal')
    const first = store.getSnapshot().spo2
    store.setActiveClimber('climber-2', 'anomaly')
    const second = store.getSnapshot()
    expect(second.climberId).toBe('climber-2')
    expect(second.spo2).not.toEqual(first)
    expect(second.spo2).toHaveLength(BUFFER_SIZE)
  })

  it('setActiveClimber(null) clears the buffer and stops ticking', () => {
    const store = createVitalsStore()
    store.setActiveClimber('climber-1', 'nominal')
    store.setActiveClimber(null, 'nominal')
    expect(store.getSnapshot().climberId).toBeNull()
    expect(store.getSnapshot().spo2).toEqual([])
  })

  it('ticks on its own timer, appending one point and dropping the oldest — buffer length stays fixed', () => {
    const store = createVitalsStore()
    store.setActiveClimber('climber-1', 'nominal')
    const before = store.getSnapshot().spo2
    vi.advanceTimersByTime(1600)
    const after = store.getSnapshot().spo2
    expect(after).toHaveLength(BUFFER_SIZE)
    expect(after).not.toEqual(before) // the window shifted
    expect(after.slice(0, -1)).toEqual(before.slice(1)) // dropped oldest, kept the rest in order
  })

  it('fix age climbs on each tick', () => {
    const store = createVitalsStore()
    store.setActiveClimber('climber-1', 'nominal')
    const before = store.getSnapshot().fixAgeMinutes
    vi.advanceTimersByTime(1600 * 3)
    const after = store.getSnapshot().fixAgeMinutes
    expect(after).toBeGreaterThan(before)
  })

  it('stops ticking once deactivated — no dangling interval after null', () => {
    const store = createVitalsStore()
    store.setActiveClimber('climber-1', 'nominal')
    store.setActiveClimber(null, 'nominal')
    // if a dangling interval were still running, this would throw trying to touch a null-buffer's last element
    expect(() => vi.advanceTimersByTime(1600 * 5)).not.toThrow()
    expect(store.getSnapshot().spo2).toEqual([])
  })

  it('notifies subscribers on both seed and tick', () => {
    const store = createVitalsStore()
    let calls = 0
    const unsubscribe = store.subscribe(() => calls++)
    store.setActiveClimber('climber-1', 'nominal')
    expect(calls).toBe(1)
    vi.advanceTimersByTime(1600)
    expect(calls).toBe(2)
    unsubscribe()
  })
})
