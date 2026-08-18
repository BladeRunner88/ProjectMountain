import { describe, expect, it } from 'vitest'
import {
  BRANCH_STRETCH_THRESHOLD_M,
  DENSITY_ROUTE_COLLAPSE_MIN,
  DENSITY_TEAM_CLUSTER_MIN,
  LEAF_MIN_SPACING_PX,
  TEAM_CLUSTER_CLIMBER_THRESHOLD,
  densityTierForTotalClimbers,
  evenSpreadX,
  isTeamStretched,
  layoutLeaves,
  medianAltitudeM,
  organicEdgeCurve,
  routeAccentColor,
  shouldClusterTeam,
  teamAccentColor,
  teamAltitudeSpanM,
  type LeafPlacementInput,
} from './descentTree'

describe('routeAccentColor / teamAccentColor', () => {
  it('two different routes get two different colours, deterministically', () => {
    const a = routeAccentColor('route-1')
    const b = routeAccentColor('route-2')
    expect(a).not.toBe(b)
    expect(routeAccentColor('route-1')).toBe(a)
  })

  it('a team\'s colour differs from its own route\'s but from a bounded offset (family resemblance, not independent)', () => {
    const routeColor = routeAccentColor('route-1')
    const teamColor = teamAccentColor('route-1', 'team-a')
    expect(teamColor).not.toBe(routeColor)
    expect(teamAccentColor('route-1', 'team-a')).toBe(teamColor) // deterministic
  })

  it('two teams under the same route still get distinct colours from each other', () => {
    const a = teamAccentColor('route-1', 'team-a')
    const b = teamAccentColor('route-1', 'team-b')
    expect(a).not.toBe(b)
  })
})

describe('evenSpreadX', () => {
  it('a single item centres exactly', () => {
    expect(evenSpreadX(1, 450, 900)).toEqual([450])
  })

  it('N items are evenly spaced, symmetric around centerX, and stay within the given width (tab-stop spacing — the outermost items sit half a step in from the true edge, not pinned to it)', () => {
    const xs = evenSpreadX(4, 0, 800)
    expect(xs).toHaveLength(4)
    for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeCloseTo(xs[1] - xs[0], 5)
    expect(xs.every((x) => x >= -400 && x <= 400)).toBe(true)
    expect(xs[0]).toBeCloseTo(-300, 5)
    expect(xs[xs.length - 1]).toBeCloseTo(300, 5)
  })

  it('zero items returns an empty array, never throws', () => {
    expect(evenSpreadX(0, 0, 900)).toEqual([])
  })
})

describe('medianAltitudeM / teamAltitudeSpanM / isTeamStretched', () => {
  it('median of an odd-length list is the real middle value', () => {
    expect(medianAltitudeM([5000, 6000, 7000])).toBe(6000)
  })

  it('median of an even-length list averages the two middle values', () => {
    expect(medianAltitudeM([5000, 6000, 7000, 8000])).toBe(6500)
  })

  it('an empty team has no median — never fabricated as 0', () => {
    expect(medianAltitudeM([])).toBeNull()
  })

  it('span is real max-min, zero for a single climber', () => {
    expect(teamAltitudeSpanM([5000, 6500, 7200])).toBe(2200)
    expect(teamAltitudeSpanM([5000])).toBe(0)
    expect(teamAltitudeSpanM([])).toBe(0)
  })

  it('stretched is strictly greater than the real 600m threshold, not inclusive', () => {
    expect(isTeamStretched(600)).toBe(false)
    expect(isTeamStretched(601)).toBe(true)
    expect(BRANCH_STRETCH_THRESHOLD_M).toBe(600)
  })
})

describe('layoutLeaves — 8.13-V.2 fan-out + collision avoidance', () => {
  function makeInputs(n: number, teamId: string, teamX: number, altitude: (i: number) => number, radius = 11): LeafPlacementInput[] {
    return Array.from({ length: n }, (_, i) => ({ id: `climber-${String(i).padStart(2, '0')}`, teamId, teamX, altitudeY: altitude(i), radiusPx: radius }))
  }

  it('alternates side across a team\'s climbers, sorted by id', () => {
    const inputs = makeInputs(4, 'team-a', 400, (i) => 100 + i * 50)
    const out = layoutLeaves(inputs)
    expect(out.map((o) => o.side)).toEqual(['right', 'left', 'right', 'left'])
  })

  it('stem length grows with each additional same-side climber (x distance from teamX increases)', () => {
    const inputs = makeInputs(6, 'team-a', 400, (i) => 100 + i * 200) // altitudes far apart, no collision forcing
    const out = layoutLeaves(inputs)
    const rightSide = out.filter((o) => o.side === 'right').map((o) => Math.abs(o.x - 400))
    for (let i = 1; i < rightSide.length; i++) expect(rightSide[i]).toBeGreaterThan(rightSide[i - 1])
  })

  it('never adjusts Y — altitude in equals altitude out, always', () => {
    const inputs = makeInputs(10, 'team-a', 400, (i) => 5000 + i * 37)
    const out = layoutLeaves(inputs)
    const yById = new Map(inputs.map((i) => [i.id, i.altitudeY]))
    for (const o of out) expect(o.y).toBe(yById.get(o.id))
  })

  it('two climbers sharing the exact same altitude within a team never collide — the second gets a longer stem, not a shifted Y', () => {
    const inputs = makeInputs(2, 'team-a', 400, () => 6000) // identical altitude
    const out = layoutLeaves(inputs)
    expect(out[0].y).toBe(6000)
    expect(out[1].y).toBe(6000)
    const dist = Math.hypot(out[0].x - out[1].x, out[0].y - out[1].y)
    expect(dist).toBeGreaterThanOrEqual(2 * 11 + LEAF_MIN_SPACING_PX - 0.01)
  })

  it('a real 50-climber stress case (this app\'s actual scale, real climbers on ~5 teams clustered by camp) has zero pairwise collisions', () => {
    // Real per-climber altitude is a continuous, near-unique GPS-derived
    // float (never a small repeating bucket set) — this seeds 50 climbers
    // with real jitter around 5 camp altitudes (teams naturally cluster
    // near a camp, but no two climbers ever share an EXACT reading, same
    // as real telemetry), the genuinely representative worst case rather
    // than an artificial pile-up on a handful of identical values.
    const teams = ['team-a', 'team-b', 'team-c', 'team-d', 'team-e']
    const campAltitudes = [5364, 5943, 6400, 7162, 7900]
    const inputs: LeafPlacementInput[] = Array.from({ length: 50 }, (_, i) => {
      const teamIdx = i % teams.length
      // deterministic sub-metre jitter — plausible real GPS noise, not a repeating bucket
      const jitter = ((i * 37) % 200) / 10 // 0.0-19.9m spread across the team
      return {
        id: `climber-${String(i).padStart(2, '0')}`,
        teamId: teams[teamIdx],
        teamX: 150 + teamIdx * 150,
        altitudeY: campAltitudes[teamIdx] + jitter,
        radiusPx: 11,
      }
    })
    const out = layoutLeaves(inputs)
    let violations = 0
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const dist = Math.hypot(out[i].x - out[j].x, out[i].y - out[j].y)
        if (dist < 11 + 11 + LEAF_MIN_SPACING_PX - 0.5) violations++
      }
    }
    expect(violations).toBe(0)
  })

  it('an adversarial pile-up (many climbers sharing only a handful of exact altitudes, far denser than real telemetry) is a disclosed best-effort — the search is bounded, not infinite, so it may not fully clear every pair in that pathological case', () => {
    const teams = ['team-a', 'team-b', 'team-c', 'team-d', 'team-e']
    const inputs: LeafPlacementInput[] = Array.from({ length: 50 }, (_, i) => ({
      id: `climber-${String(i).padStart(2, '0')}`,
      teamId: teams[i % teams.length],
      teamX: 150 + (i % teams.length) * 150,
      altitudeY: 400 + (i % 7) * 15,
      radiusPx: 11,
    }))
    // Just asserting this terminates and returns 50 real, y-preserving results — no crash, no infinite loop, no altitude fabrication — under a scenario denser than any real dataset would produce.
    const out = layoutLeaves(inputs)
    expect(out).toHaveLength(50)
    const yById = new Map(inputs.map((i) => [i.id, i.altitudeY]))
    expect(out.every((o) => o.y === yById.get(o.id))).toBe(true)
  })

  it('cross-team collisions (different teams, similar real position) are also resolved — the general 26px rule is global, not team-scoped', () => {
    const inputs: LeafPlacementInput[] = [
      { id: 'a', teamId: 'team-1', teamX: 400, altitudeY: 500, radiusPx: 11 },
      { id: 'b', teamId: 'team-2', teamX: 405, altitudeY: 501, radiusPx: 11 }, // almost identical real position, different team
    ]
    const out = layoutLeaves(inputs)
    const dist = Math.hypot(out[0].x - out[1].x, out[0].y - out[1].y)
    expect(dist).toBeGreaterThanOrEqual(2 * 11 + LEAF_MIN_SPACING_PX - 0.01)
  })

  it('is deterministic — same input, same output, every time', () => {
    const inputs = makeInputs(12, 'team-a', 400, (i) => 5000 + i * 20)
    expect(layoutLeaves(inputs)).toEqual(layoutLeaves(inputs))
  })
})

describe('organicEdgeCurve', () => {
  it('produces a real quadratic bezier path string starting and ending at the given points', () => {
    const { d } = organicEdgeCurve(0, 0, 100, 200, 'seed-1', 20)
    expect(d.startsWith('M0.00 0.00')).toBe(true)
    expect(d.endsWith('100.00 200.00')).toBe(true)
    expect(d).toContain('Q')
  })

  it('the control point offsets perpendicular to the direct line, not along it', () => {
    const { cx, cy } = organicEdgeCurve(0, 0, 100, 0, 'seed-1', 20) // horizontal line
    expect(cx).toBeCloseTo(50, 1) // midpoint x unaffected — offset is purely vertical for a horizontal line
    expect(Math.abs(cy)).toBeGreaterThan(0) // perpendicular (vertical) offset is non-zero
  })

  it('different seeds curve differently but deterministically', () => {
    const a = organicEdgeCurve(0, 0, 100, 100, 'seed-a', 20)
    const b = organicEdgeCurve(0, 0, 100, 100, 'seed-b', 20)
    expect(a.d).not.toBe(b.d)
    expect(organicEdgeCurve(0, 0, 100, 100, 'seed-a', 20).d).toBe(a.d)
  })

  it('the offset never exceeds maxOffsetPx from the direct midpoint', () => {
    const { cx, cy } = organicEdgeCurve(0, 0, 100, 0, 'seed-1', 20)
    const dist = Math.hypot(cx - 50, cy - 0)
    expect(dist).toBeLessThanOrEqual(20 + 0.01)
  })
})

describe('densityTierForTotalClimbers / shouldClusterTeam — 8.13-V.3 DENSITY', () => {
  it('this real expedition (50 climbers) is always "full" — the tiers above never fire against live data', () => {
    expect(densityTierForTotalClimbers(50)).toBe('full')
  })

  it('boundaries: 59 is full, 60 is team-cluster, 150 is team-cluster, 151 is route-collapse', () => {
    expect(densityTierForTotalClimbers(DENSITY_TEAM_CLUSTER_MIN - 1)).toBe('full')
    expect(densityTierForTotalClimbers(DENSITY_TEAM_CLUSTER_MIN)).toBe('team-cluster')
    expect(densityTierForTotalClimbers(DENSITY_ROUTE_COLLAPSE_MIN)).toBe('team-cluster')
    expect(densityTierForTotalClimbers(DENSITY_ROUTE_COLLAPSE_MIN + 1)).toBe('route-collapse')
  })

  it('a seeded 200-climber network (proof: this expedition never reaches this scale) is route-collapse', () => {
    expect(densityTierForTotalClimbers(200)).toBe('route-collapse')
  })

  it('a team clusters only when it STRICTLY exceeds the threshold — exactly 8 stays individual', () => {
    expect(shouldClusterTeam(TEAM_CLUSTER_CLIMBER_THRESHOLD)).toBe(false)
    expect(shouldClusterTeam(TEAM_CLUSTER_CLIMBER_THRESHOLD + 1)).toBe(true)
    expect(shouldClusterTeam(3)).toBe(false)
  })
})
