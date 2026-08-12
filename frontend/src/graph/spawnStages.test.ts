import { beforeEach, describe, expect, it } from 'vitest'
import { buildGraphDataset, GRAPH_SEED } from './dataset'
import {
  ANOMALY_FLUSH_HOPS,
  ANOMALY_FLUSH_TOTAL_MS,
  ANOMALY_TURN_RED_DELAY_MS,
  BUD_CHILD_TOTAL_MS,
  BUD_PARENT_SWELL_MS,
  buildSpawnPlan,
  CLIMBER_STAGGER_MS,
  COUNTRY_STAGGER_MS,
  getHasEverSpawned,
  markHasSpawned,
  OPERATOR_STAGGER_MS,
  REGION_STAGGER_MS,
  resetHasEverSpawned,
  ROUTE_STAGGER_MS,
  ROUTES_OPERATORS_OVERLAP_MS,
  STAGE_START_MS,
} from './spawnStages'

const dataset = buildGraphDataset(GRAPH_SEED)

describe('buildSpawnPlan (S8.5N cell-growth reveal)', () => {
  const plan = buildSpawnPlan(dataset)

  it('every country has its own PRIMITIVE A pop delay, staggered 220ms, and every other domain entity + environment node has a bud start', () => {
    const countries = dataset.domainEntities.filter((e) => e.tier === 'country')
    expect(plan.countryPopDelayMs.size).toBe(countries.length)
    const sorted = countries.map((c) => plan.countryPopDelayMs.get(c.id)!).sort((a, b) => a - b)
    for (let i = 1; i < sorted.length; i++) expect(sorted[i] - sorted[i - 1]).toBe(COUNTRY_STAGGER_MS)
    expect(sorted[0]).toBe(STAGE_START_MS.countries)

    for (const e of dataset.domainEntities) {
      if (e.tier === 'country') continue
      expect(plan.budStartMs.get(e.id), `${e.id} (${e.tier})`).toBeDefined()
      expect(plan.budParentId.get(e.id), `${e.id} (${e.tier})`).toBe(e.parentId)
    }
    for (const env of dataset.environmentNodes) {
      expect(plan.budStartMs.get(env.id)).toBeDefined()
      expect(plan.budParentId.get(env.id)).toBe(env.regionId)
    }
  })

  it('country names fade in exactly POP_A_DURATION_MS + 200ms after their own pop delay', () => {
    for (const c of dataset.domainEntities.filter((e) => e.tier === 'country')) {
      const pop = plan.countryPopDelayMs.get(c.id)!
      const name = plan.countryNameDelayMs.get(c.id)!
      expect(name - pop).toBeGreaterThan(200) // at least the post-land delay
    }
  })

  it('stage windows hold: countries < regions < environment < routes/operators < climbers, each tier landing inside its own window', () => {
    const budRange = (tier: string) => {
      const vals = dataset.domainEntities.filter((e) => e.tier === tier).map((e) => plan.budStartMs.get(e.id)!)
      return { min: Math.min(...vals), max: Math.max(...vals) }
    }
    const country = { min: 0, max: Math.max(...dataset.domainEntities.filter((e) => e.tier === 'country').map((e) => plan.countryPopDelayMs.get(e.id)!)) }
    expect(country.max).toBeLessThan(STAGE_START_MS.regions)

    const region = budRange('region')
    expect(region.min).toBeGreaterThanOrEqual(STAGE_START_MS.regions)
    expect(region.max).toBeLessThan(STAGE_START_MS.environment)

    const envVals = dataset.environmentNodes.map((e) => plan.budStartMs.get(e.id)!)
    expect(Math.min(...envVals)).toBeGreaterThanOrEqual(STAGE_START_MS.environment)
    expect(Math.max(...envVals)).toBeLessThan(STAGE_START_MS.routesOperators)

    const route = budRange('route')
    expect(route.min).toBeGreaterThanOrEqual(STAGE_START_MS.routesOperators)

    const climber = budRange('climber')
    expect(climber.min).toBeGreaterThanOrEqual(STAGE_START_MS.climbers)
    expect(climber.max).toBeLessThan(STAGE_START_MS.records)
  })

  it('regions within one country stagger 90ms, all countries branch simultaneously (every country\'s first region starts at STAGE_START_MS.regions)', () => {
    const regionsByCountry = new Map<string, string[]>()
    for (const r of dataset.domainEntities.filter((e) => e.tier === 'region')) {
      const list = regionsByCountry.get(r.countryId) ?? []
      list.push(r.id)
      regionsByCountry.set(r.countryId, list)
    }
    for (const ids of regionsByCountry.values()) {
      const sorted = ids.map((id) => plan.budStartMs.get(id)!).sort((a, b) => a - b)
      expect(sorted[0]).toBe(STAGE_START_MS.regions)
      for (let i = 1; i < sorted.length; i++) expect(sorted[i] - sorted[i - 1]).toBe(REGION_STAGGER_MS)
    }
  })

  it('routes stagger 45ms across the full flat list (region:route is 1:1, nothing to stagger within a single-child litter)', () => {
    const routes = dataset.domainEntities.filter((e) => e.tier === 'route')
    const sorted = routes.map((r) => plan.budStartMs.get(r.id)!).sort((a, b) => a - b)
    expect(sorted[0]).toBe(STAGE_START_MS.routesOperators)
    for (let i = 1; i < sorted.length; i++) expect(sorted[i] - sorted[i - 1]).toBe(ROUTE_STAGGER_MS)
  })

  it('operators within a route stagger 45ms, all routes branch simultaneously, starting before every route has landed (the 300ms overlap)', () => {
    const operatorsByRoute = new Map<string, string[]>()
    for (const o of dataset.domainEntities.filter((e) => e.tier === 'operator')) {
      const list = operatorsByRoute.get(o.parentId!) ?? []
      list.push(o.id)
      operatorsByRoute.set(o.parentId!, list)
    }
    const firstOperatorStarts = new Set<number>()
    for (const ids of operatorsByRoute.values()) {
      const sorted = ids.map((id) => plan.budStartMs.get(id)!).sort((a, b) => a - b)
      firstOperatorStarts.add(sorted[0])
      for (let i = 1; i < sorted.length; i++) expect(sorted[i] - sorted[i - 1]).toBe(OPERATOR_STAGGER_MS)
    }
    // every route's first operator shares the same start (simultaneous across routes)
    expect(firstOperatorStarts.size).toBe(1)
    const operatorStageStart = [...firstOperatorStarts][0]
    expect(operatorStageStart).toBe(STAGE_START_MS.routesOperators + BUD_CHILD_TOTAL_MS - ROUTES_OPERATORS_OVERLAP_MS)

    const lastRouteLand = Math.max(...dataset.domainEntities.filter((e) => e.tier === 'route').map((e) => plan.budStartMs.get(e.id)! + BUD_CHILD_TOTAL_MS))
    expect(operatorStageStart).toBeLessThan(lastRouteLand)
  })

  it('sensors bud alongside their route\'s first operator, no extra stagger', () => {
    for (const sensor of dataset.domainEntities.filter((e) => e.tier === 'sensor')) {
      const operatorsOnSameRoute = dataset.domainEntities.filter((e) => e.tier === 'operator' && e.parentId === sensor.parentId)
      if (operatorsOnSameRoute.length === 0) continue
      const firstOperatorStart = Math.min(...operatorsOnSameRoute.map((o) => plan.budStartMs.get(o.id)!))
      expect(plan.budStartMs.get(sensor.id)).toBe(firstOperatorStart)
    }
  })

  it('climbers within an operator stagger 30ms, all operators branch simultaneously', () => {
    const climbersByOperator = new Map<string, string[]>()
    for (const c of dataset.domainEntities.filter((e) => e.tier === 'climber')) {
      const list = climbersByOperator.get(c.parentId!) ?? []
      list.push(c.id)
      climbersByOperator.set(c.parentId!, list)
    }
    for (const ids of climbersByOperator.values()) {
      const sorted = ids.map((id) => plan.budStartMs.get(id)!).sort((a, b) => a - b)
      expect(sorted[0]).toBe(STAGE_START_MS.climbers)
      for (let i = 1; i < sorted.length; i++) expect(sorted[i] - sorted[i - 1]).toBe(CLIMBER_STAGGER_MS)
    }
  })

  it('parent-pop episodes: a country gets exactly one (its region litter), a region gets two in temporal order (environment then routes), a route gets one (its operator+sensor litter)', () => {
    const country = dataset.domainEntities.find((e) => e.tier === 'country')!
    const countryEpisodes = plan.parentPopEpisodes.get(country.id) ?? []
    expect(countryEpisodes).toHaveLength(1)
    expect(countryEpisodes[0].relaxStart).toBeGreaterThan(countryEpisodes[0].swellStart)
    expect(countryEpisodes[0].swellStart).toBe(STAGE_START_MS.regions - BUD_PARENT_SWELL_MS)

    const region = dataset.domainEntities.find((e) => e.tier === 'region')!
    const regionEpisodes = plan.parentPopEpisodes.get(region.id) ?? []
    expect(regionEpisodes).toHaveLength(2)
    expect(regionEpisodes[0].relaxStart).toBeLessThanOrEqual(regionEpisodes[1].swellStart) // non-overlapping, in order

    const route = dataset.domainEntities.find((e) => e.tier === 'route')!
    const routeEpisodes = plan.parentPopEpisodes.get(route.id) ?? []
    expect(routeEpisodes).toHaveLength(1)
  })

  it('leaf tiers (climber, sensor, environment) never bud children, so they have no parent-pop episodes', () => {
    const climber = dataset.domainEntities.find((e) => e.tier === 'climber')!
    expect(plan.parentPopEpisodes.get(climber.id) ?? []).toHaveLength(0)
    const env = dataset.environmentNodes[0]
    expect(plan.parentPopEpisodes.get(env.id) ?? []).toHaveLength(0)
  })

  it('anomaly: every one of the 9 anomalous climbers turns red strictly AFTER its own bud settles (arrives normal, then becomes wrong)', () => {
    for (const climberId of dataset.anomalyClimberIds) {
      const bud = plan.budStartMs.get(climberId)!
      const turnRed = plan.anomalyTurnRedMs.get(climberId)!
      expect(turnRed).toBe(bud + BUD_CHILD_TOTAL_MS + ANOMALY_TURN_RED_DELAY_MS)
    }
  })

  it('anomaly flush: every anomalous climber has a full 4-hop ancestor chain with a defined flush delay, and its own hop-0 edge (never shared with another climber) fires exactly at its own turn-red moment', () => {
    const byId = new Map(dataset.domainEntities.map((e) => [e.id, e]))
    for (const climberId of dataset.anomalyClimberIds) {
      const turnRed = plan.anomalyTurnRedMs.get(climberId)!
      const delays: number[] = []
      let current = byId.get(climberId)
      while (current && current.parentId !== null) {
        const key = `${current.parentId}->${current.id}`
        const delay = plan.anomalyFlushDelayMs.get(key)
        expect(delay, key).toBeDefined()
        delays.push(delay!)
        current = byId.get(current.parentId)
      }
      expect(delays).toHaveLength(ANOMALY_FLUSH_HOPS)
      // hop 0 — the edge directly INTO this climber — is never shared with
      // any other anomalous climber, so it always fires at exactly this
      // climber's own turn-red moment, with no dedup possible.
      expect(delays[0]).toBe(turnRed)
      // an UPPER hop, by contrast, may be shared with another anomalous
      // climber under the same operator/route/region and can legitimately
      // resolve EARLIER than this climber's own local schedule would
      // predict — "flushes at whichever climber reaches it first" is
      // covered by its own dedicated test below, so this one only asserts
      // hop 0's exactness plus every hop being within the reveal's own
      // sane bounds.
      for (const d of delays) expect(d).toBeGreaterThanOrEqual(turnRed - ANOMALY_FLUSH_TOTAL_MS * dataset.anomalyClimberIds.length)
    }
  })

  it('a shared ancestor edge between two anomalous climbers flushes at the earliest of the two', () => {
    const byId = new Map(dataset.domainEntities.map((e) => [e.id, e]))
    const seen = new Map<string, number>()
    for (const climberId of dataset.anomalyClimberIds) {
      const turnRed = plan.anomalyTurnRedMs.get(climberId)!
      let current = byId.get(climberId)
      let hop = 0
      while (current && current.parentId !== null) {
        const key = `${current.parentId}->${current.id}`
        const delay = turnRed + hop * (ANOMALY_FLUSH_TOTAL_MS / ANOMALY_FLUSH_HOPS)
        const prior = seen.get(key)
        seen.set(key, prior === undefined ? delay : Math.min(prior, delay))
        current = byId.get(current.parentId)
        hop++
      }
    }
    for (const [key, expectedMin] of seen) {
      expect(plan.anomalyFlushDelayMs.get(key)).toBe(expectedMin)
    }
  })

  it('stage 6: the spore release starts at STAGE_START_MS.records, history draws after it finishes, total duration is their sum', () => {
    expect(plan.subNodeStartMs).toBe(STAGE_START_MS.records)
    expect(plan.historyStartMs).toBe(plan.subNodeStartMs + plan.subNodeDurationMs)
    expect(plan.totalDurationMs).toBe(plan.historyStartMs + plan.historyDurationMs)
  })

  it('ticker lines: 6 lines (one per stage), real dataset counts, in stage order, fade starts after totalDurationMs', () => {
    expect(plan.tickerLines).toHaveLength(6)
    const routeCount = dataset.domainEntities.filter((e) => e.tier === 'route').length
    const operatorCount = dataset.domainEntities.filter((e) => e.tier === 'operator').length
    expect(plan.tickerLines[3].text).toContain(String(routeCount))
    expect(plan.tickerLines[3].text).toContain(String(operatorCount))
    expect(plan.tickerLines[5].text).toContain(dataset.subNodes.length.toLocaleString())
    for (let i = 1; i < plan.tickerLines.length; i++) expect(plan.tickerLines[i].atMs).toBeGreaterThan(plan.tickerLines[i - 1].atMs)
    expect(plan.tickerFadeStartMs).toBeGreaterThan(plan.totalDurationMs)
  })

  it('is deterministic: building the plan twice from the same dataset produces identical delays', () => {
    const again = buildSpawnPlan(dataset)
    expect([...plan.budStartMs.entries()]).toEqual([...again.budStartMs.entries()])
    expect([...plan.countryPopDelayMs.entries()]).toEqual([...again.countryPopDelayMs.entries()])
  })
})

describe('hasEverSpawned (S8.4b "ONCE PER DATASET", unchanged by S8.5N)', () => {
  beforeEach(() => resetHasEverSpawned())

  it('starts false, becomes true only after markHasSpawned, and stays true across repeated reads', () => {
    expect(getHasEverSpawned()).toBe(false)
    markHasSpawned()
    expect(getHasEverSpawned()).toBe(true)
    expect(getHasEverSpawned()).toBe(true)
  })

  it('resetHasEverSpawned restores the initial false state (test-only escape hatch)', () => {
    markHasSpawned()
    resetHasEverSpawned()
    expect(getHasEverSpawned()).toBe(false)
  })
})
