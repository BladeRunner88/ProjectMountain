import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { clampZoom, DEFAULT_VIEWPORT, isValidViewport, loadPersistedViewport, NETWORK_ZOOM_MAX, NETWORK_ZOOM_MIN, savePersistedViewport, zoomAt } from './viewport'

const STORAGE_KEY = 'isildur_graph_network_viewport'

// This suite's vitest environment is plain Node (no jsdom/happy-dom
// installed) — `localStorage` isn't a global here the way it is in a
// browser, so the persistence tests below stand up a minimal in-memory
// stand-in for the duration of each test rather than assuming one exists.
function installMemoryLocalStorage(): void {
  const store = new Map<string, string>()
  globalThis.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v)
    },
    removeItem: (k: string) => {
      store.delete(k)
    },
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size
    },
  } as Storage
}

describe('graph/viewport (S8.8)', () => {
  beforeEach(() => installMemoryLocalStorage())
  afterEach(() => {
    // @ts-expect-error test-only teardown of the stand-in installed above
    delete globalThis.localStorage
  })

  it('clampZoom holds zoom inside the 0.3x-4x band', () => {
    expect(clampZoom(0.05)).toBe(NETWORK_ZOOM_MIN)
    expect(clampZoom(10)).toBe(NETWORK_ZOOM_MAX)
    expect(clampZoom(1.5)).toBe(1.5)
  })

  it('zoomAt keeps the world point under the cursor fixed on screen', () => {
    const viewport = { cx: 10, cy: 20, zoom: 1 }
    const cursorX = 100
    const cursorY = 150
    const worldXBefore = (cursorX - viewport.cx) / viewport.zoom
    const worldYBefore = (cursorY - viewport.cy) / viewport.zoom

    const next = zoomAt(viewport, cursorX, cursorY, 2)
    const worldXAfter = (cursorX - next.cx) / next.zoom
    const worldYAfter = (cursorY - next.cy) / next.zoom

    expect(worldXAfter).toBeCloseTo(worldXBefore, 6)
    expect(worldYAfter).toBeCloseTo(worldYBefore, 6)
    expect(next.zoom).toBe(2)
  })

  it('zoomAt clamps the resulting zoom to the same band', () => {
    const viewport = { cx: 0, cy: 0, zoom: 3.9 }
    const next = zoomAt(viewport, 0, 0, 2)
    expect(next.zoom).toBe(NETWORK_ZOOM_MAX)
  })

  describe('isValidViewport — "this is where a restored viewport killed the canvas before"', () => {
    it('accepts a well-formed viewport', () => {
      expect(isValidViewport({ cx: 10, cy: -20, zoom: 1.5 })).toBe(true)
    })
    it('rejects NaN in any field', () => {
      expect(isValidViewport({ cx: NaN, cy: 0, zoom: 1 })).toBe(false)
      expect(isValidViewport({ cx: 0, cy: 0, zoom: NaN })).toBe(false)
    })
    it('rejects a zoom outside the clamp band', () => {
      expect(isValidViewport({ cx: 0, cy: 0, zoom: 0.01 })).toBe(false)
      expect(isValidViewport({ cx: 0, cy: 0, zoom: 100 })).toBe(false)
    })
    it('rejects a pan wildly beyond sane bounds', () => {
      expect(isValidViewport({ cx: 999999, cy: 0, zoom: 1 })).toBe(false)
    })
    it('rejects a missing field or wrong shape entirely', () => {
      expect(isValidViewport({ cx: 0, zoom: 1 })).toBe(false)
      expect(isValidViewport(null)).toBe(false)
      expect(isValidViewport('not an object')).toBe(false)
    })
  })

  describe('persistence round-trip', () => {
    it('loadPersistedViewport with nothing stored returns the default', () => {
      expect(loadPersistedViewport()).toEqual(DEFAULT_VIEWPORT)
    })
    it('saves and restores a valid viewport', () => {
      const v = { cx: 42, cy: -7, zoom: 2.2 }
      savePersistedViewport(v)
      expect(loadPersistedViewport()).toEqual(v)
    })
    it('a corrupted stored value falls back to the default rather than being applied', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ cx: NaN, cy: 0, zoom: 1 }))
      expect(loadPersistedViewport()).toEqual(DEFAULT_VIEWPORT)
    })
    it('malformed JSON in storage falls back to the default, not a throw', () => {
      localStorage.setItem(STORAGE_KEY, '{not json')
      expect(() => loadPersistedViewport()).not.toThrow()
      expect(loadPersistedViewport()).toEqual(DEFAULT_VIEWPORT)
    })
  })
})
