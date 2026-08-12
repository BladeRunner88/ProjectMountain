import { describe, expect, it } from 'vitest'
import { buildGraphDataset, GRAPH_SEED } from './dataset'
import { buildRouteProfiles, buildClimberPlacements } from './terrainProfile'
import { buildClimberProfiles } from './climberProfile'
import { computeEntityDetail, computeLabels, HR_BREACH_HIGH_BPM, HR_BREACH_LOW_BPM, SPO2_BREACH_PCT, type EntityPropertiesContext } from './entityProperties'

const dataset = buildGraphDataset(GRAPH_SEED)
const routeProfiles = buildRouteProfiles(dataset)
const climberPlacements = buildClimberPlacements(dataset, routeProfiles)
const climberProfiles = buildClimberProfiles(dataset, climberPlacements, routeProfiles)
const NOW = Date.now()

function baseCtx(overrides: Partial<EntityPropertiesContext> = {}): EntityPropertiesContext {
  return {
    environmentReadings: new Map(),
    routeProfiles,
    climberPlacements,
    climberProfiles,
    activeVitals: null,
    ...overrides,
  }
}

function entityIdOf(tier: string): string {
  return dataset.domainEntities.find((e) => e.tier === tier)!.id
}

describe('computeEntityDetail (S8.5N detail panel spine)', () => {
  it('returns null for an id that resolves to nothing', () => {
    expect(computeEntityDetail(dataset, 'does-not-exist', baseCtx(), NOW)).toBeNull()
  })

  it('every domain tier produces a non-empty rows list and a non-empty summary, matching its own kind', () => {
    for (const tier of ['country', 'region', 'route', 'operator', 'climber', 'sensor'] as const) {
      const id = entityIdOf(tier)
      const detail = computeEntityDetail(dataset, id, baseCtx(), NOW)
      expect(detail, tier).not.toBeNull()
      expect(detail!.kind).toBe(tier)
      expect(detail!.rows.length).toBeGreaterThan(0)
      expect(detail!.summary.length).toBeGreaterThan(0)
    }
  })

  it('a record (sub-node) produces kind/timestamp/source/summary/confidence rows', () => {
    const sub = dataset.subNodes[0]
    const detail = computeEntityDetail(dataset, sub.id, baseCtx(), NOW)!
    expect(detail.kind).toBe('record')
    const labels = detail.rows.map((r) => r.label)
    expect(labels).toEqual(['Kind', 'Timestamp', 'Source', 'Summary', 'Confidence'])
  })

  it('is deterministic: the same id, same context shape, same seed always produces the same rows and summary', () => {
    const id = entityIdOf('operator')
    const a = computeEntityDetail(dataset, id, baseCtx(), NOW)
    const b = computeEntityDetail(dataset, id, baseCtx(), NOW)
    expect(a).toEqual(b)
  })

  it('country counts (regions/routes/operators/climbers) match the real dataset hierarchy exactly, not a seeded guess', () => {
    const id = entityIdOf('country')
    const detail = computeEntityDetail(dataset, id, baseCtx(), NOW)!
    const country = dataset.domainEntities.find((e) => e.id === id)!
    const realRegions = dataset.domainEntities.filter((e) => e.tier === 'region' && e.countryId === country.id).length
    const realClimbers = dataset.domainEntities.filter((e) => e.tier === 'climber' && e.countryId === country.id).length
    expect(detail.rows.find((r) => r.label === 'Regions')!.value).toBe(String(realRegions))
    expect(detail.rows.find((r) => r.label === 'Climbers')!.value).toBe(String(realClimbers))
  })

  it('a region with a breaching environment reading marks the corresponding rows red with a threshold, and a calm reading marks none', () => {
    const regionId = entityIdOf('region')
    const calm = computeEntityDetail(
      dataset,
      regionId,
      baseCtx({ environmentReadings: new Map([[regionId, { windKph: 10, temperatureC: 0, visibilityKm: 15, freezingLevelM: 4000, breached: false }]]) }),
      NOW,
    )!
    expect(calm.rows.some((r) => r.breaching)).toBe(false)

    const breached = computeEntityDetail(
      dataset,
      regionId,
      baseCtx({ environmentReadings: new Map([[regionId, { windKph: 999, temperatureC: 0, visibilityKm: 15, freezingLevelM: 4000, breached: true }]]) }),
      NOW,
    )!
    const windRow = breached.rows.find((r) => r.label === 'Wind')!
    expect(windRow.breaching).toBe(true)
    expect(windRow.threshold).toBeDefined()
  })

  it('a climber\'s SpO2/heart rate rows are "—" with no live reading, and breach correctly when the active vitals cross the threshold', () => {
    const climberId = entityIdOf('climber')
    const noVitals = computeEntityDetail(dataset, climberId, baseCtx(), NOW)!
    expect(noVitals.rows.find((r) => r.label === 'SpO2')!.value).toBe('—')

    const lowSpo2 = computeEntityDetail(dataset, climberId, baseCtx({ activeVitals: { climberId, reading: { spo2: SPO2_BREACH_PCT - 5, hr: 70 } } }), NOW)!
    const spo2Row = lowSpo2.rows.find((r) => r.label === 'SpO2')!
    expect(spo2Row.breaching).toBe(true)

    const highHr = computeEntityDetail(dataset, climberId, baseCtx({ activeVitals: { climberId, reading: { spo2: 98, hr: HR_BREACH_HIGH_BPM + 10 } } }), NOW)!
    expect(highHr.rows.find((r) => r.label === 'Heart rate')!.breaching).toBe(true)

    const normalHr = computeEntityDetail(dataset, climberId, baseCtx({ activeVitals: { climberId, reading: { spo2: 98, hr: (HR_BREACH_LOW_BPM + HR_BREACH_HIGH_BPM) / 2 } } }), NOW)!
    expect(normalHr.rows.find((r) => r.label === 'Heart rate')!.breaching).toBe(false)
  })

  it('an anomalous climber\'s summary mentions being flagged; a nominal one\'s does not', () => {
    const anomalyId = dataset.anomalyClimberIds[0]
    const anomalyDetail = computeEntityDetail(dataset, anomalyId, baseCtx(), NOW)!
    expect(anomalyDetail.summary).toContain('flagged')

    const nominalId = dataset.domainEntities.find((e) => e.tier === 'climber' && e.status === 'nominal')!.id
    const nominalDetail = computeEntityDetail(dataset, nominalId, baseCtx(), NOW)!
    expect(nominalDetail.summary).not.toContain('flagged')
  })
})

describe('computeLabels', () => {
  it('returns null for an unresolved id', () => {
    expect(computeLabels(dataset, 'does-not-exist')).toBeNull()
  })

  it('every domain entity gets its own kind/country/status', () => {
    const id = entityIdOf('climber')
    const climber = dataset.domainEntities.find((e) => e.id === id)!
    const labels = computeLabels(dataset, id)!
    expect(labels.kind).toBe('climber')
    expect(labels.status).toBe(climber.status)
    expect(labels.country).not.toBeNull()
  })

  it('a climber with a history link carries the prior-expedition tag; one without does not', () => {
    const withHistory = dataset.historyLinks[0].climberId
    expect(computeLabels(dataset, withHistory)!.tags).toContain('prior-expedition')

    const climberIdsWithHistory = new Set(dataset.historyLinks.map((h) => h.climberId))
    const withoutHistory = dataset.domainEntities.find((e) => e.tier === 'climber' && !climberIdsWithHistory.has(e.id))
    if (withoutHistory) {
      expect(computeLabels(dataset, withoutHistory.id)!.tags).not.toContain('prior-expedition')
    }
  })

  it('a record (sub-node) resolves to kind "record" with no country', () => {
    const sub = dataset.subNodes[0]
    const labels = computeLabels(dataset, sub.id)!
    expect(labels.kind).toBe('record')
    expect(labels.country).toBeNull()
  })
})
