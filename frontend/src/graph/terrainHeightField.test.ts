import { beforeEach, describe, expect, it } from 'vitest'
import { buildGraphDataset, GRAPH_SEED } from './dataset'
import { buildRouteProfiles } from './terrainProfile'
import { computeHeightField, POINT_COUNT, resetHeightFieldCache } from './terrainHeightField'
import { WORLD_HALF_WIDTH_UNITS, WORLD_LENGTH_UNITS } from './terrainWorld'

describe('terrainHeightField (S8.7)', () => {
  const dataset = buildGraphDataset(GRAPH_SEED)
  const profiles = buildRouteProfiles(dataset)
  const profile = [...profiles.values()][0]

  beforeEach(() => resetHeightFieldCache())

  it('generates a point cloud in the 12,000-20,000 band S8.7 asks for', () => {
    const field = computeHeightField(profile, [])
    expect(field.count).toBe(POINT_COUNT)
    expect(field.count).toBeGreaterThanOrEqual(12000)
    expect(field.count).toBeLessThanOrEqual(20000)
  })

  it('every point stays within the route corridor world bounds', () => {
    const field = computeHeightField(profile, [])
    for (let i = 0; i < field.count; i++) {
      expect(field.x[i]).toBeGreaterThanOrEqual(0)
      expect(field.x[i]).toBeLessThanOrEqual(WORLD_LENGTH_UNITS)
      expect(field.z[i]).toBeGreaterThanOrEqual(-WORLD_HALF_WIDTH_UNITS)
      expect(field.z[i]).toBeLessThanOrEqual(WORLD_HALF_WIDTH_UNITS)
    }
  })

  it("the surface tracks the route's own altitude range, not an arbitrary one", () => {
    const field = computeHeightField(profile, [])
    let min = Infinity
    let max = -Infinity
    for (let i = 0; i < field.count; i++) {
      if (field.y[i] < min) min = field.y[i]
      if (field.y[i] > max) max = field.y[i]
    }
    const range = profile.exitAltitudeM - profile.entryAltitudeM
    expect(min).toBeGreaterThan(profile.entryAltitudeM - range * 0.3)
    expect(max).toBeLessThan(profile.exitAltitudeM + range * 0.1)
  })

  it('is deterministic — same route, same profile, same field on every build', () => {
    const a = computeHeightField(profile, [])
    resetHeightFieldCache()
    const b = computeHeightField(profile, [])
    expect(Array.from(a.x)).toEqual(Array.from(b.x))
    expect(Array.from(a.y)).toEqual(Array.from(b.y))
    expect(Array.from(a.z)).toEqual(Array.from(b.z))
  })

  it('memoises per route — a second call for the same route returns the same object', () => {
    const a = computeHeightField(profile, [])
    const b = computeHeightField(profile, [])
    expect(a).toBe(b)
  })

  it('marks points red near a supplied anomaly, and none red with no anomaly', () => {
    const withoutAnomaly = computeHeightField(profile, [])
    const anomalyCount = Array.from(withoutAnomaly.anomaly).reduce((a, b) => a + b, 0)
    expect(anomalyCount).toBe(0)

    resetHeightFieldCache()
    const withAnomaly = computeHeightField(profile, [{ progress: 0.5, lateral: 0 }])
    const flagged = Array.from(withAnomaly.anomaly).reduce((a, b) => a + b, 0)
    expect(flagged).toBeGreaterThan(0)
  })

  it('flags only a minority of points as ridge lines (the "occasionally 1.5px" points)', () => {
    const field = computeHeightField(profile, [])
    const ridgeCount = Array.from(field.ridge).reduce((a, b) => a + b, 0)
    expect(ridgeCount).toBeGreaterThan(0)
    expect(ridgeCount).toBeLessThan(field.count * 0.25)
  })
})
