import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createGraphStore } from './graphStore'
import { withLayoutSafety } from './layoutSafety'
import { buildDriftParams, computeOffsets } from './offsets'
import { createRafLoop } from './rafLoop'
import { assertFinitePoint, resetNanGuard } from './nanGuard'
import type { DomainDataset } from './domain'
import type { GraphDataset } from './types'

function makeDomainDataset(version: number): DomainDataset {
  const entities: DomainDataset['domainEntities'] = [
    { id: 'a', tier: 'country', label: 'A', parentId: null, countryId: 'a', status: 'nominal' },
    { id: 'b', tier: 'country', label: 'B', parentId: null, countryId: 'b', status: 'nominal' },
  ]
  return {
    version,
    entities,
    domainEntities: entities,
    subNodes: [],
    environmentNodes: [],
    historyLinks: [],
    edges: [],
    pointCount: 0,
    anomalyClimberIds: [],
    anomalySensorIds: [],
  }
}

// rAF/cAF don't exist in vitest's default node environment — polyfilled
// here as setTimeout/clearTimeout under fake timers, exactly so tests can
// deterministically "pump frames" rather than racing a real clock. Product
// code (rafLoop.ts) stays unguarded, as it should for real browser use.
beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('requestAnimationFrame', ((cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 16) as unknown as number) as typeof requestAnimationFrame)
  vi.stubGlobal('cancelAnimationFrame', ((id: number) => clearTimeout(id)) as typeof cancelAnimationFrame)
  resetNanGuard()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const dataset2: GraphDataset = { version: 1, entities: [{ id: 'a' }, { id: 'b' }] }

describe('withLayoutSafety (S8.2 rule 2)', () => {
  it('memoises: the exact same Map reference comes back for an unchanged (dataset, size), and compute runs only once', () => {
    const compute = vi.fn((ds: GraphDataset) => new Map(ds.entities.map((e, i) => [e.id, { x: i, y: i }])))
    const layout = withLayoutSafety(compute, 'test')
    const size = { width: 100, height: 100 }
    const r1 = layout(dataset2, size)
    const r2 = layout(dataset2, size)
    expect(r2).toBe(r1)
    expect(compute).toHaveBeenCalledTimes(1)
  })

  it('recomputes when the dataset version changes', () => {
    const compute = vi.fn((ds: GraphDataset) => new Map(ds.entities.map((e, i) => [e.id, { x: i, y: i }])))
    const layout = withLayoutSafety(compute, 'test')
    const size = { width: 100, height: 100 }
    layout(dataset2, size)
    layout({ ...dataset2, version: 2 }, size)
    expect(compute).toHaveBeenCalledTimes(2)
  })

  it('recomputes when size changes', () => {
    const compute = vi.fn((ds: GraphDataset) => new Map(ds.entities.map((e, i) => [e.id, { x: i, y: i }])))
    const layout = withLayoutSafety(compute, 'test')
    layout(dataset2, { width: 100, height: 100 })
    layout(dataset2, { width: 200, height: 100 })
    expect(compute).toHaveBeenCalledTimes(2)
  })

  it('a degenerate size (zero, or non-finite) returns the PREVIOUS layout unchanged, never an empty one, and never calls compute', () => {
    const compute = vi.fn((ds: GraphDataset) => new Map(ds.entities.map((e, i) => [e.id, { x: i, y: i }])))
    const layout = withLayoutSafety(compute, 'test')
    const good = layout(dataset2, { width: 100, height: 100 })
    expect(good.size).toBe(2)
    const afterZero = layout(dataset2, { width: 0, height: 100 })
    expect(afterZero).toBe(good)
    const afterNaN = layout(dataset2, { width: Number.NaN, height: 100 })
    expect(afterNaN).toBe(good)
    expect(compute).toHaveBeenCalledTimes(1)
  })

  it('the very first call, before any good layout has ever existed, returns an empty map rather than throwing on a degenerate size', () => {
    const compute = vi.fn(() => new Map())
    const layout = withLayoutSafety(compute, 'test')
    const r = layout(dataset2, { width: 0, height: 0 })
    expect(r.size).toBe(0)
    expect(compute).not.toHaveBeenCalled()
  })
})

describe('computeOffsets (S8.2 rule 3)', () => {
  it('is a pure function of absolute time: the same nowMs always produces identical offsets, called any number of times', () => {
    const params = buildDriftParams(dataset2)
    const o1 = [...computeOffsets(params, 12345).entries()]
    const o2 = [...computeOffsets(params, 12345).entries()]
    const o3 = [...computeOffsets(params, 12345).entries()]
    expect(o1).toEqual(o2)
    expect(o2).toEqual(o3)
  })

  it('never accumulates: a huge time jump (simulating a tab backgrounded for minutes) still produces an offset bounded by the seeded amplitude, not a runaway value', () => {
    const params = buildDriftParams(dataset2)
    const farFuture = computeOffsets(params, 1000 + 10 * 60 * 1000)
    for (const p of farFuture.values()) {
      expect(Math.abs(p.x)).toBeLessThanOrEqual(4.0001)
      expect(Math.abs(p.y)).toBeLessThanOrEqual(4.0001)
    }
  })
})

describe('assertFinitePoint (S8.2 rule 5)', () => {
  it('passes a finite point through unchanged', () => {
    expect(assertFinitePoint('x', { x: 5, y: 6 }, 'test', {})).toEqual({ x: 5, y: 6 })
  })

  it('replaces a non-finite point with the last known good value for that same id', () => {
    assertFinitePoint('y', { x: 1, y: 2 }, 'test', {})
    const bad = assertFinitePoint('y', { x: Number.NaN, y: 2 }, 'test', {})
    expect(bad).toEqual({ x: 1, y: 2 })
  })

  it('falls back to the origin when there is no prior good value at all for that id', () => {
    const bad = assertFinitePoint('never-seen-before', { x: Number.POSITIVE_INFINITY, y: 0 }, 'test', {})
    expect(bad).toEqual({ x: 0, y: 0 })
  })
})

describe('createRafLoop (S8.2 rule 4)', () => {
  it('start() runs frames; stop() cancels them and no more fire afterward', () => {
    let frames = 0
    const loop = createRafLoop(() => frames++)
    loop.start()
    vi.advanceTimersByTime(16 * 5)
    expect(frames).toBeGreaterThanOrEqual(4)
    expect(loop.isRunning()).toBe(true)

    const framesAtStop = frames
    loop.stop()
    vi.advanceTimersByTime(200)
    expect(frames).toBe(framesAtStop)
    expect(loop.isRunning()).toBe(false)
  })

  it('start() called twice never stacks a second loop — frame count matches ONE loop, and a dev assert fires', () => {
    const assertSpy = vi.spyOn(console, 'assert').mockImplementation(() => {})
    let frames = 0
    const loop = createRafLoop(() => frames++)
    loop.start()
    loop.start() // must be a no-op
    vi.advanceTimersByTime(16 * 3)
    loop.stop()
    // a stacked second loop would produce roughly double the frames for the
    // same elapsed time; a single loop produces ~3
    expect(frames).toBeLessThanOrEqual(4)
    expect(assertSpy).toHaveBeenCalled()
    assertSpy.mockRestore()
  })

  it('is safe under StrictMode\'s mount -> cleanup -> mount (start, stop, start again) — ends up running with no leaked loop', () => {
    let frames = 0
    const loop = createRafLoop(() => frames++)
    loop.start()
    loop.stop()
    loop.start()
    expect(loop.isRunning()).toBe(true)
    vi.advanceTimersByTime(16 * 3)
    expect(frames).toBeGreaterThan(0)
  })
})

describe('createGraphStore (S8.2 rule 1)', () => {
  const domainDataset2 = makeDomainDataset(1)

  it('a degenerate setSize never clears an already-good layout', () => {
    const store = createGraphStore()
    store.setDataset(domainDataset2)
    store.setSize({ width: 200, height: 200 })
    const before = store.getSnapshot().layout
    expect(before.size).toBe(2)
    store.setSize({ width: 0, height: 0 })
    expect(store.getSnapshot().layout).toBe(before)
  })

  it('drift actually moves nodes once a dataset and a real size are set — regression test for the version-check-after-mutation bug: setDataset/setSize must build real driftParams, not leave them empty forever', () => {
    const store = createGraphStore()
    store.setDataset(domainDataset2)
    store.setSize({ width: 200, height: 200 })
    store.start()

    // advance real time so the sine-based offset formula produces a
    // non-trivial phase difference, then read what a frame subscriber
    // would actually receive
    let latestOffsets: ReadonlyMap<string, { x: number; y: number }> | null = null
    const unsub = store.subscribeFrame((offsets) => {
      latestOffsets = offsets
    })
    vi.advanceTimersByTime(5000)
    unsub()
    store.stop()

    expect(latestOffsets).not.toBeNull()
    expect(latestOffsets!.size).toBe(domainDataset2.entities.length)
    // at least one entity's offset must be non-zero — an empty driftParams
    // map (the bug) produces an offsets map with no entries at all for any
    // id, which downstream renderers silently skip forever
    const anyNonZero = [...latestOffsets!.values()].some((p) => p.x !== 0 || p.y !== 0)
    expect(anyNonZero).toBe(true)
  })

  it('start()/stop() are idempotent and isRunning() reflects the real state', () => {
    const store = createGraphStore()
    expect(store.isRunning()).toBe(false)
    store.start()
    expect(store.isRunning()).toBe(true)
    store.start()
    expect(store.isRunning()).toBe(true)
    store.stop()
    expect(store.isRunning()).toBe(false)
  })

  it('structural changes (selection) notify subscribers; nothing about offsets is part of that snapshot', () => {
    const store = createGraphStore()
    let calls = 0
    store.subscribe(() => calls++)
    store.setSelection('node-1')
    expect(calls).toBe(1)
    expect(store.getSnapshot().selection).toBe('node-1')
    expect('offsets' in store.getSnapshot()).toBe(false)
  })

  it('ids stay stable across a setDataset with the same version: mutating a live value never regenerates the layout keys', () => {
    const store = createGraphStore()
    store.setDataset(domainDataset2)
    store.setSize({ width: 100, height: 100 })
    const keysBefore = [...store.getSnapshot().layout.keys()].sort()
    // same version, same entities — a legitimate "nothing changed" re-call
    store.setDataset(domainDataset2)
    const keysAfter = [...store.getSnapshot().layout.keys()].sort()
    expect(keysAfter).toEqual(keysBefore)
  })

  it('S8.10 dev assertion: setSelection with an id that resolves in the current dataset stays silent', () => {
    const store = createGraphStore()
    store.setDataset(domainDataset2)
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    store.setSelection(domainDataset2.entities[0].id)
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('S8.10 dev assertion: setSelection with an id that does NOT resolve logs a dev error but still applies the selection (never throws, never blocks it)', () => {
    const store = createGraphStore()
    store.setDataset(domainDataset2)
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => store.setSelection('not-a-real-id')).not.toThrow()
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('does not resolve'))
    expect(store.getSnapshot().selection).toBe('not-a-real-id')
    spy.mockRestore()
  })

  it('setDriftAmplitudeFn changes the amplitude used the next time drift params are built, including immediately if a dataset is already loaded', () => {
    const store = createGraphStore()
    store.setDataset(domainDataset2)
    store.setSize({ width: 200, height: 200 })
    store.setDriftAmplitudeFn(() => 50) // deliberately large so it's unmistakable
    store.start()
    let latestOffsets: ReadonlyMap<string, { x: number; y: number }> | null = null
    const unsub = store.subscribeFrame((offsets) => {
      latestOffsets = offsets
    })
    vi.advanceTimersByTime(3000)
    unsub()
    store.stop()
    const anyLarge = [...latestOffsets!.values()].some((p) => Math.abs(p.x) > 10 || Math.abs(p.y) > 10)
    expect(anyLarge).toBe(true)
  })
})
