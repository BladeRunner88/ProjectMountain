import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  clampElevation,
  depthKey,
  depthRangeForWorld,
  ELEVATION_MAX_DEG,
  ELEVATION_MIN_DEG,
  ISO_COS30,
  ISO_SIN30,
  isValidCamera,
  loadPersistedCamera,
  projectPoint,
  rubberBandElevation,
  savePersistedCamera,
  type Camera,
} from "./terrainCamera"

function camera(overrides: Partial<Camera> = {}): Camera {
  return {
    azimuthRad: 0,
    elevationDeg: 52,
    scale: 5,
    verticalScale: 0.1,
    ...overrides,
  }
}

describe("terrainCamera (S8.7)", () => {
  it("at azimuth 0, screenX matches S8.7's own formula exactly: (x - z) * cos(30deg) * scale", () => {
    const cam = camera({ azimuthRad: 0, scale: 4 })
    const { sx } = projectPoint(10, 500, 3, cam)
    expect(sx).toBeCloseTo((10 - 3) * ISO_COS30 * 4, 6)
  })

  it("at elevation 90deg (looking straight down), load contributes nothing to screenY", () => {
    const cam = camera({ azimuthRad: 0, elevationDeg: 90 })
    const low = projectPoint(10, 100, 3, cam)
    const high = projectPoint(10, 9000, 3, cam)
    expect(low.sy).toBeCloseTo(high.sy, 4)
    expect(low.sy).toBeCloseTo((10 + 3) * ISO_SIN30 * cam.scale, 4)
  })

  it("at elevation 0deg (side-on), screenY is pure -height * verticalScale", () => {
    const cam = camera({ azimuthRad: 0, elevationDeg: 0 })
    const { sy } = projectPoint(10, 500, 3, cam)
    expect(sy).toBeCloseTo(-500 * cam.verticalScale, 4)
  })

  it("depthKey matches the (xr + zr) term used inside the projection", () => {
    const cam = camera({ azimuthRad: 0.4 })
    const cosA = Math.cos(cam.azimuthRad)
    const sinA = Math.sin(cam.azimuthRad)
    const x = 12
    const z = -4
    const expected = x * cosA - z * sinA + (x * sinA + z * cosA)
    expect(depthKey(x, z, cam)).toBeCloseTo(expected, 6)
  })

  it("depthRangeForWorld's extremes land exactly on the world rectangle's corners at azimuth 0", () => {
    const cam = camera({ azimuthRad: 0 })
    const [min, max] = depthRangeForWorld(cam, 100, 26)
    // depth(x, z) = x + z at azimuth 0 — min at (0, -26), max at (100, 26)
    expect(min).toBeCloseTo(-26, 6)
    expect(max).toBeCloseTo(126, 6)
  })

  it("clampElevation holds elevation inside the hard limits", () => {
    expect(clampElevation(ELEVATION_MIN_DEG - 40)).toBe(ELEVATION_MIN_DEG)
    expect(clampElevation(ELEVATION_MAX_DEG + 40)).toBe(ELEVATION_MAX_DEG)
    expect(clampElevation(50)).toBe(50)
  })

  it("rubberBandElevation gives resistance past the limits without ever reaching a hard wall", () => {
    const pastMin = rubberBandElevation(ELEVATION_MIN_DEG - 5)
    expect(pastMin).toBeLessThan(ELEVATION_MIN_DEG)
    expect(pastMin).toBeGreaterThan(ELEVATION_MIN_DEG - 5)

    const pastMax = rubberBandElevation(ELEVATION_MAX_DEG + 5)
    expect(pastMax).toBeGreaterThan(ELEVATION_MAX_DEG)
    expect(pastMax).toBeLessThan(ELEVATION_MAX_DEG + 5)

    expect(rubberBandElevation(50)).toBe(50)
  })

  describe('camera persistence — S8.8 "scale, pan and rotation persist" + validation', () => {
    const STORAGE_KEY = "isildur_graph_terrain_camera"
    const defaultCam = camera({ azimuthRad: -0.5 })

    // Plain-Node vitest environment here (no jsdom/happy-dom installed) —
    // stand up a minimal in-memory localStorage for the duration of each
    // test rather than assuming a browser global exists.
    beforeEach(() => {
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
    })
    afterEach(() => {
      // @ts-expect-error test-only teardown of the stand-in installed above
      delete globalThis.localStorage
    })

    it("accepts a well-formed camera", () => {
      expect(isValidCamera(camera(), 2, 14)).toBe(true)
    })
    it("rejects NaN in any field", () => {
      expect(isValidCamera({ ...camera(), scale: NaN }, 2, 14)).toBe(false)
    })
    it("rejects an elevation far outside even the rubber-band range", () => {
      expect(isValidCamera({ ...camera(), elevationDeg: 9999 }, 2, 14)).toBe(
        false
      )
    })
    it("rejects a non-positive verticalScale", () => {
      expect(isValidCamera({ ...camera(), verticalScale: 0 }, 2, 14)).toBe(
        false
      )
    })
    it("rejects a wrong shape entirely, not just bad numbers", () => {
      expect(isValidCamera(null, 2, 14)).toBe(false)
      expect(isValidCamera("camera", 2, 14)).toBe(false)
    })

    it("with nothing stored, loadPersistedCamera returns the given default", () => {
      expect(loadPersistedCamera(defaultCam, 2, 14)).toEqual(defaultCam)
    })
    it("saves and restores a valid camera", () => {
      const cam = camera({ azimuthRad: 1.2, elevationDeg: 40, scale: 6 })
      savePersistedCamera(cam)
      expect(loadPersistedCamera(defaultCam, 2, 14)).toEqual(cam)
    })
    it('a corrupted stored camera falls back to the default rather than being applied — "this is where a restored viewport killed the canvas before"', () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ ...camera(), scale: NaN })
      )
      expect(loadPersistedCamera(defaultCam, 2, 14)).toEqual(defaultCam)
    })
    it("malformed JSON in storage falls back to the default, not a throw", () => {
      localStorage.setItem(STORAGE_KEY, "{not json")
      expect(() => loadPersistedCamera(defaultCam, 2, 14)).not.toThrow()
      expect(loadPersistedCamera(defaultCam, 2, 14)).toEqual(defaultCam)
    })
  })
})
