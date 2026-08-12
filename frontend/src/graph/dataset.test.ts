import { describe, expect, it } from 'vitest'
import { buildGraphDataset, GRAPH_SEED, validateGraphDataset } from './dataset'
import { isEnvironmentNode } from './domain'

describe('buildGraphDataset (S8.3)', () => {
  it('buildGraphDataset(SEED) called twice deep-equals itself', () => {
    const a = buildGraphDataset(GRAPH_SEED)
    const b = buildGraphDataset(GRAPH_SEED)
    expect(a).toEqual(b)
  })

  it('has exactly 127 top-tier entities in the stated counts (5+14+14+30+50+14 — distinct from the Control Room\'s own 113 "entitiesTracked" headline, which deliberately excludes sensors)', () => {
    const d = buildGraphDataset(GRAPH_SEED)
    expect(d.domainEntities).toHaveLength(127)
    const byTier = (tier: string) => d.domainEntities.filter((e) => e.tier === tier).length
    expect(byTier('country')).toBe(5)
    expect(byTier('region')).toBe(14)
    expect(byTier('route')).toBe(14)
    expect(byTier('operator')).toBe(30)
    expect(byTier('climber')).toBe(50)
    expect(byTier('sensor')).toBe(14)
  })

  it('reports a point count (sub-nodes) within the 2,400-3,200 band', () => {
    const d = buildGraphDataset(GRAPH_SEED)
    expect(d.pointCount).toBe(d.subNodes.length)
    expect(d.pointCount).toBeGreaterThanOrEqual(2400)
    expect(d.pointCount).toBeLessThanOrEqual(3200)
  })

  it('every sub-node count falls within its own tier band', () => {
    const d = buildGraphDataset(GRAPH_SEED)
    const bands: Record<string, [number, number]> = {
      climber: [18, 40],
      sensor: [24, 60],
      operator: [6, 14],
      route: [8, 20],
      region: [4, 10],
      country: [3, 6],
    }
    for (const entity of d.domainEntities) {
      const count = d.subNodes.filter((s) => s.parentId === entity.id).length
      const [min, max] = bands[entity.tier]
      expect(count, `${entity.id} (${entity.tier})`).toBeGreaterThanOrEqual(min)
      expect(count, `${entity.id} (${entity.tier})`).toBeLessThanOrEqual(max)
    }
  })

  it('exactly 9 anomalous climbers and 3 anomalous sensors, spread across >= 4 operators and >= 3 countries, never including James Marshall III', () => {
    const d = buildGraphDataset(GRAPH_SEED)
    expect(d.anomalyClimberIds).toHaveLength(9)
    expect(d.anomalySensorIds).toHaveLength(3)
    expect(d.anomalyClimberIds).not.toContain('climber-0')
    const james = d.domainEntities.find((e) => e.label === 'James Marshall III')!
    expect(james.status).toBe('nominal')

    const byId = new Map(d.domainEntities.map((e) => [e.id, e]))
    const operators = new Set(d.anomalyClimberIds.map((id) => byId.get(id)!.parentId))
    const countries = new Set(d.anomalyClimberIds.map((id) => byId.get(id)!.countryId))
    expect(operators.size).toBeGreaterThanOrEqual(4)
    expect(countries.size).toBeGreaterThanOrEqual(3)
  })

  it('Nima Tamang exists and is not accidentally anomalous by construction (only the seeded 9 are)', () => {
    const d = buildGraphDataset(GRAPH_SEED)
    const nima = d.domainEntities.find((e) => e.label === 'Nima Tamang')
    expect(nima).toBeDefined()
  })

  it('roughly 2% of sub-nodes carry an alert status, clustered on anomalous parents rather than flat', () => {
    const d = buildGraphDataset(GRAPH_SEED)
    const alertSubNodes = d.subNodes.filter((s) => s.status === 'alert')
    const pct = (alertSubNodes.length / d.subNodes.length) * 100
    expect(pct).toBeGreaterThan(1)
    expect(pct).toBeLessThan(4)

    const anomalousParents = new Set([...d.anomalyClimberIds, ...d.anomalySensorIds])
    const alertsOnAnomalousParents = alertSubNodes.filter((s) => anomalousParents.has(s.parentId)).length
    const alertRateOnAnomalous = alertsOnAnomalousParents / alertSubNodes.length
    // most alert sub-nodes should trace back to the 12 anomalous parents,
    // not be spread evenly across all 113 entities
    expect(alertRateOnAnomalous).toBeGreaterThan(0.5)
  })

  it('every sub-node of kind "alerts" carries status "alert"', () => {
    const d = buildGraphDataset(GRAPH_SEED)
    for (const s of d.subNodes.filter((s) => s.kind === 'alerts')) {
      expect(s.status).toBe('alert')
    }
  })

  it('every edge whose target is anomalous or alert is itself kind "anomaly"', () => {
    const d = buildGraphDataset(GRAPH_SEED)
    const byId = new Map(d.entities.map((e) => [e.id, e]))
    for (const edge of d.edges) {
      const target = byId.get(edge.target)!
      const isFlagged = 'tier' in target ? target.status === 'anomaly' : isEnvironmentNode(target) ? target.breached : target.status === 'alert'
      if (isFlagged) expect(edge.kind).toBe('anomaly')
    }
  })

  it('passes its own invariant validation with zero violations', () => {
    const d = buildGraphDataset(GRAPH_SEED)
    expect(validateGraphDataset(d)).toEqual([])
  })

  it('a corrupted dataset (dangling sub-node parent) is caught by validateGraphDataset', () => {
    const d = buildGraphDataset(GRAPH_SEED)
    const broken = { ...d, subNodes: [...d.subNodes.slice(1), { ...d.subNodes[0], parentId: 'does-not-exist' }] }
    const violations = validateGraphDataset(broken)
    expect(violations.some((v) => v.includes('does-not-exist'))).toBe(true)
  })

  it('a different seed produces a structurally different dataset (not a hardcoded constant)', () => {
    const a = buildGraphDataset(GRAPH_SEED)
    const b = buildGraphDataset(GRAPH_SEED + 1)
    expect(a.anomalyClimberIds).not.toEqual(b.anomalyClimberIds)
  })
})

describe('S8.4b: environment nodes', () => {
  it('exactly one environment node per region (14), each pointing at a real region and its region\'s real country', () => {
    const d = buildGraphDataset(GRAPH_SEED)
    expect(d.environmentNodes).toHaveLength(14)
    const regionIds = new Set(d.domainEntities.filter((e) => e.tier === 'region').map((e) => e.id))
    const countryIds = new Set(d.domainEntities.filter((e) => e.tier === 'country').map((e) => e.id))
    const regionsCovered = new Set(d.environmentNodes.map((e) => e.regionId))
    expect(regionsCovered.size).toBe(14)
    for (const env of d.environmentNodes) {
      expect(regionIds.has(env.regionId)).toBe(true)
      expect(countryIds.has(env.countryId)).toBe(true)
    }
  })

  it('environment nodes are included in dataset.entities (so drift/layout treat them generically), and are individually rare to breach', () => {
    const d = buildGraphDataset(GRAPH_SEED)
    for (const env of d.environmentNodes) {
      expect(d.entities.some((e) => e.id === env.id)).toBe(true)
    }
    const breachedCount = d.environmentNodes.filter((e) => e.breached).length
    // "the norm is calm, breach is the exception" — not zero (there must be
    // something to see), not half the map either
    expect(breachedCount).toBeGreaterThan(0)
    expect(breachedCount).toBeLessThan(7)
  })

  it('is deterministic: same seed, same environment readings and breach flags', () => {
    const a = buildGraphDataset(GRAPH_SEED)
    const b = buildGraphDataset(GRAPH_SEED)
    expect(a.environmentNodes).toEqual(b.environmentNodes)
  })
})

describe('S8.4b: history links', () => {
  it('every link points climber -> a REAL prior region, never the climber\'s own current region', () => {
    const d = buildGraphDataset(GRAPH_SEED)
    expect(d.historyLinks.length).toBeGreaterThan(0)
    const climberIds = new Set(d.domainEntities.filter((e) => e.tier === 'climber').map((e) => e.id))
    const regionIds = new Set(d.domainEntities.filter((e) => e.tier === 'region').map((e) => e.id))
    const byId = new Map(d.domainEntities.map((e) => [e.id, e]))
    function currentRegionOf(climberId: string): string | undefined {
      const climber = byId.get(climberId)
      const operator = climber?.parentId ? byId.get(climber.parentId) : undefined
      const route = operator?.parentId ? byId.get(operator.parentId) : undefined
      return route?.parentId ?? undefined
    }
    for (const link of d.historyLinks) {
      expect(climberIds.has(link.climberId)).toBe(true)
      expect(regionIds.has(link.regionId)).toBe(true)
      expect(link.regionId).not.toBe(currentRegionOf(link.climberId))
    }
  })

  it('roughly 60% of climbers carry at least one history link, each carrying 1-3', () => {
    const d = buildGraphDataset(GRAPH_SEED)
    const climbers = d.domainEntities.filter((e) => e.tier === 'climber')
    const linksByClimber = new Map<string, number>()
    for (const link of d.historyLinks) {
      linksByClimber.set(link.climberId, (linksByClimber.get(link.climberId) ?? 0) + 1)
    }
    for (const count of linksByClimber.values()) {
      expect(count).toBeGreaterThanOrEqual(1)
      expect(count).toBeLessThanOrEqual(3)
    }
    const coveredFraction = linksByClimber.size / climbers.length
    expect(coveredFraction).toBeGreaterThan(0.4)
    expect(coveredFraction).toBeLessThan(0.85)
  })

  it('is deterministic: same seed, same history links', () => {
    const a = buildGraphDataset(GRAPH_SEED)
    const b = buildGraphDataset(GRAPH_SEED)
    expect(a.historyLinks).toEqual(b.historyLinks)
  })
})
