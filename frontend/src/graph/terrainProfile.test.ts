import { describe, expect, it } from 'vitest'
import { buildGraphDataset, GRAPH_SEED } from './dataset'
import { altitudeAt, buildClimberPlacements, buildRouteConditions, buildRouteProfiles, defaultRouteId, summarizeRouteClimbers } from './terrainProfile'

describe('terrainProfile (S8.7)', () => {
  const dataset = buildGraphDataset(GRAPH_SEED)
  const profiles = buildRouteProfiles(dataset)

  it('builds one profile per route, deterministically', () => {
    expect(profiles.size).toBe(14)
    const again = buildRouteProfiles(dataset)
    for (const [id, p] of profiles) expect(again.get(id)).toEqual(p)
  })

  it('every profile has a real ascent: entry < crux and crux is between entry and exit', () => {
    for (const p of profiles.values()) {
      expect(p.entryAltitudeM).toBeLessThan(p.exitAltitudeM)
      expect(p.cruxAltitudeM).toBeGreaterThan(p.entryAltitudeM)
      expect(p.cruxAltitudeM).toBeLessThan(p.exitAltitudeM)
      expect(p.cruxProgress).toBeGreaterThan(0)
      expect(p.cruxProgress).toBeLessThan(1)
    }
  })

  it('altitudeAt reproduces entry/crux/exit exactly at their own progress values', () => {
    const p = [...profiles.values()][0]
    expect(altitudeAt(p, 0)).toBeCloseTo(p.entryAltitudeM, 5)
    expect(altitudeAt(p, p.cruxProgress)).toBeCloseTo(p.cruxAltitudeM, 5)
    expect(altitudeAt(p, 1)).toBeCloseTo(p.exitAltitudeM, 5)
  })

  it('conditions are deterministic and within instrument-plausible ranges', () => {
    const routeId = [...profiles.keys()][0]
    const a = buildRouteConditions(routeId)
    const b = buildRouteConditions(routeId)
    expect(a).toEqual(b)
    expect(a.windKph).toBeGreaterThanOrEqual(12)
    expect(a.tempC).toBeLessThan(0)
    expect(a.visibilityKm).toBeGreaterThan(0)
  })

  describe('climber placement', () => {
    const placements = buildClimberPlacements(dataset, profiles)

    it('places every one of the 50 climbers on some route', () => {
      expect(placements.size).toBe(50)
      for (const p of placements.values()) {
        expect(profiles.has(p.routeId)).toBe(true)
        expect(p.progress).toBeGreaterThanOrEqual(0)
        expect(p.progress).toBeLessThanOrEqual(1)
        expect(p.lateral).toBeGreaterThanOrEqual(-1)
        expect(p.lateral).toBeLessThanOrEqual(1)
      }
    })

    it("the trail's last point is exactly the climber's current position", () => {
      for (const p of placements.values()) {
        const last = p.trail[p.trail.length - 1]
        expect(last.progress).toBeCloseTo(p.progress, 5)
        expect(last.lateral).toBeCloseTo(p.lateral, 5)
      }
    })

    it('an anomalous climber is never also flagged "watch" — anomaly overrides, it does not stack with it', () => {
      for (const climberId of dataset.anomalyClimberIds) {
        expect(placements.get(climberId)?.watch).toBe(false)
      }
    })

    it('defaultRouteId opens on a route that actually has an anomaly on it', () => {
      const routeId = defaultRouteId(dataset, placements)
      const summary = summarizeRouteClimbers(dataset, placements, routeId)
      expect(summary.anomalyCount).toBeGreaterThan(0)
    })

    it("summarizeRouteClimbers' per-camp counts sum to the route total", () => {
      const routeId = defaultRouteId(dataset, placements)
      const summary = summarizeRouteClimbers(dataset, placements, routeId)
      const sum = summary.byCamp.reduce((acc, c) => acc + c.count, 0)
      expect(sum).toBe(summary.totalOnRoute)
    })
  })
})
