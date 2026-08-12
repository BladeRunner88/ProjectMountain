// S8.5N: THE DETAIL PANEL's own spine — a per-kind key/value PROPERTIES
// list and a written SUMMARY, both computed fresh from the dataset (never
// stored). Reuses every real relationship the dataset already carries
// (hierarchy counts, RouteProfile, ClimberProfile, live environment
// readings) and seeds the handful of fields nothing in the domain model
// carries at all (permits issued, technical grade, guide count, safety
// rating, battery, confidence) the same deterministic "seeded per id, no
// Date.now()" way climberProfile.ts/terrainProfile.ts already do — flavour
// text, disclosed as such, never something a real number could contradict.

import { mulberry32, randInt, seedFromString } from './rng'
import { ENVIRONMENT_FREEZING_BREACH_M, ENVIRONMENT_TEMP_BREACH_C, ENVIRONMENT_VISIBILITY_BREACH_KM, ENVIRONMENT_WIND_BREACH_KPH } from './dataset'
import { computeConnections } from './connections'
import type { EnvironmentReading } from './environmentStore'
import type { ClimberPlacement, RouteProfile } from './terrainProfile'
import type { ClimberProfile } from './climberProfile'
import type { DomainDataset, DomainEntity, EntityTier, SubNode } from './domain'
import type { GraphId } from './types'

export const SPO2_BREACH_PCT = 85
export const HR_BREACH_HIGH_BPM = 160
export const HR_BREACH_LOW_BPM = 45

export interface PropertyRow {
  label: string
  value: string
  breaching?: boolean
  threshold?: string
}

export interface EntityDetail {
  kind: EntityTier | 'record'
  rows: PropertyRow[]
  summary: string
}

export interface VitalsReading {
  spo2: number
  hr: number
}

export interface EntityPropertiesContext {
  environmentReadings: ReadonlyMap<GraphId, EnvironmentReading>
  routeProfiles: ReadonlyMap<GraphId, RouteProfile>
  climberPlacements: ReadonlyMap<GraphId, ClimberPlacement>
  climberProfiles: ReadonlyMap<GraphId, ClimberProfile>
  /** The live climber this reading belongs to, if any is currently active — vitalsStore only ever tracks one climber at a time. */
  activeVitals: { climberId: GraphId; reading: VitalsReading } | null
}

/** Routes are direct children of regions (S8.3) — one hop, no walk needed. */
function regionIdOfRoute(byId: ReadonlyMap<GraphId, DomainEntity>, routeId: GraphId): GraphId | null {
  return byId.get(routeId)?.parentId ?? null
}

const TECHNICAL_GRADES = ['PD', 'PD+', 'AD', 'AD+', 'D', 'D+', 'TD', 'TD+', 'ED'] as const
const SAFETY_RATINGS = ['A+', 'A', 'A-', 'B+', 'B', 'B-'] as const

function formatAgo(ts: number, nowMs: number): string {
  const minutes = Math.max(0, Math.round((nowMs - ts) / 60000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function mostRecentSubNodeTs(dataset: DomainDataset, parentId: GraphId): number | null {
  let latest: number | null = null
  for (const s of dataset.subNodes) {
    if (s.parentId !== parentId) continue
    if (latest === null || s.ts > latest) latest = s.ts
  }
  return latest
}

function environmentRow(label: string, value: number, unit: string, breach: (v: number) => boolean, thresholdText: string, decimals = 0): PropertyRow {
  const breaching = breach(value)
  return { label, value: `${decimals ? value.toFixed(decimals) : Math.round(value)}${unit}`, breaching, threshold: breaching ? thresholdText : undefined }
}

function conditionsRows(reading: EnvironmentReading | undefined): PropertyRow[] {
  if (!reading) return []
  return [
    environmentRow('Wind', reading.windKph, 'kph', (v) => v > ENVIRONMENT_WIND_BREACH_KPH, `threshold ${ENVIRONMENT_WIND_BREACH_KPH}kph`),
    environmentRow('Temperature', reading.temperatureC, '°C', (v) => v < ENVIRONMENT_TEMP_BREACH_C, `threshold ${ENVIRONMENT_TEMP_BREACH_C}°C`),
    environmentRow('Visibility', reading.visibilityKm, 'km', (v) => v < ENVIRONMENT_VISIBILITY_BREACH_KM, `threshold ${ENVIRONMENT_VISIBILITY_BREACH_KM}km`, 1),
    environmentRow('Freezing level', reading.freezingLevelM, 'm', (v) => v > ENVIRONMENT_FREEZING_BREACH_M, `threshold ${ENVIRONMENT_FREEZING_BREACH_M}m`),
  ]
}

function conditionsSummaryPhrase(reading: EnvironmentReading | undefined): string {
  if (!reading) return 'no live reading yet'
  if (!reading.breached) return `calm — ${Math.round(reading.windKph)}kph wind, ${Math.round(reading.temperatureC)}°C`
  const breaches: string[] = []
  if (reading.windKph > ENVIRONMENT_WIND_BREACH_KPH) breaches.push('wind has exceeded the operating threshold')
  if (reading.temperatureC < ENVIRONMENT_TEMP_BREACH_C) breaches.push('temperature has dropped below the operating threshold')
  if (reading.visibilityKm < ENVIRONMENT_VISIBILITY_BREACH_KM) breaches.push('visibility has fallen below the operating threshold')
  if (reading.freezingLevelM > ENVIRONMENT_FREEZING_BREACH_M) breaches.push('the freezing level has risen above the operating threshold')
  return breaches[0] ?? 'a condition is currently breaching'
}

export function computeEntityDetail(dataset: DomainDataset, id: GraphId, ctx: EntityPropertiesContext, nowMs: number): EntityDetail | null {
  const byId = new Map(dataset.domainEntities.map((e) => [e.id, e]))
  const entity = byId.get(id)
  if (entity) return computeDomainEntityDetail(dataset, entity, byId, ctx, nowMs)
  const sub = dataset.subNodes.find((s) => s.id === id)
  if (sub) return computeRecordDetail(sub)
  return null
}

function computeDomainEntityDetail(
  dataset: DomainDataset,
  entity: DomainEntity,
  byId: ReadonlyMap<GraphId, DomainEntity>,
  ctx: EntityPropertiesContext,
  nowMs: number,
): EntityDetail {
  const rand = mulberry32(seedFromString(entity.id, 7100))
  const descendants = (tier: EntityTier, scopeId: GraphId) => dataset.domainEntities.filter((e) => e.tier === tier && e.countryId === scopeId)

  switch (entity.tier) {
    case 'country': {
      const regions = descendants('region', entity.id)
      const routes = descendants('route', entity.id)
      const operators = descendants('operator', entity.id)
      const climbers = descendants('climber', entity.id)
      const anomaliesOpen = dataset.domainEntities.filter((e) => e.countryId === entity.id && e.status === 'anomaly').length
      const permitsIssued = climbers.length + randInt(rand, 5, 40)
      const activeExpeditions = new Set(climbers.map((c) => c.parentId)).size
      const rows: PropertyRow[] = [
        { label: 'Regions', value: String(regions.length) },
        { label: 'Routes', value: String(routes.length) },
        { label: 'Operators', value: String(operators.length) },
        { label: 'Climbers', value: String(climbers.length) },
        { label: 'Active expeditions', value: String(activeExpeditions) },
        { label: 'Permits issued', value: String(permitsIssued) },
        { label: 'Anomalies open', value: String(anomaliesOpen) },
      ]
      const flaggedClimber = climbers.find((c) => c.status === 'anomaly')
      const flaggedRoute = flaggedClimber ? routeLabelFor(byId, flaggedClimber.id) : null
      const summary =
        anomaliesOpen === 0
          ? `${entity.label} hosts ${regions.length} active region${regions.length === 1 ? '' : 's'} and ${climbers.length} climbers across ${operators.length} operators. Nothing is currently flagged.`
          : `${entity.label} hosts ${regions.length} active region${regions.length === 1 ? '' : 's'} and ${climbers.length} climbers across ${operators.length} operators. ${anomaliesOpen} ${anomaliesOpen === 1 ? 'entity is' : 'entities are'} currently flagged${flaggedRoute ? `, including on the ${flaggedRoute} route` : ''}.`
      return { kind: 'country', rows, summary }
    }
    case 'region': {
      const country = byId.get(entity.parentId ?? '')
      const routes = dataset.domainEntities.filter((e) => e.tier === 'route' && e.parentId === entity.id)
      const operators = dataset.domainEntities.filter((e) => e.tier === 'operator' && routes.some((r) => r.id === e.parentId))
      const climbers = dataset.domainEntities.filter((e) => e.tier === 'climber' && operators.some((o) => o.id === e.parentId))
      const reading = ctx.environmentReadings.get(entity.id)
      const rows: PropertyRow[] = [
        { label: 'Country', value: country?.label ?? '—' },
        { label: 'Routes', value: String(routes.length) },
        { label: 'Parties on route', value: String(climbers.length) },
        { label: 'Operators', value: String(operators.length) },
        { label: 'Climbers', value: String(climbers.length) },
        ...conditionsRows(reading),
      ]
      const anomalyClimbers = climbers.filter((c) => c.status === 'anomaly')
      const conditionsClause = reading ? `Conditions are currently ${conditionsSummaryPhrase(reading)}` : 'Live conditions have not reported in yet'
      const flaggedClause = anomalyClimbers.length > 0 ? `, and ${anomalyClimbers.length} climber${anomalyClimbers.length === 1 ? ' is' : 's are'} flagged` : ''
      const summary = `${entity.label} carries ${routes.length} route${routes.length === 1 ? '' : 's'} for ${operators.length} operator${operators.length === 1 ? '' : 's'} and ${climbers.length} climbers. ${conditionsClause}${flaggedClause}.`
      return { kind: 'region', rows, summary }
    }
    case 'route': {
      const region = byId.get(entity.parentId ?? '')
      const profile = ctx.routeProfiles.get(entity.id)
      const operators = dataset.domainEntities.filter((e) => e.tier === 'operator' && e.parentId === entity.id)
      const climbers = dataset.domainEntities.filter((e) => e.tier === 'climber' && operators.some((o) => o.id === e.parentId))
      const sensor = dataset.domainEntities.find((e) => e.tier === 'sensor' && e.parentId === entity.id)
      const grade = TECHNICAL_GRADES[Math.floor(rand() * TECHNICAL_GRADES.length)]
      const rows: PropertyRow[] = [
        { label: 'Region', value: region?.label ?? '—' },
        { label: 'Length', value: profile ? `${profile.lengthKm}km` : '—' },
        { label: 'Entry altitude', value: profile ? `${profile.entryAltitudeM.toLocaleString()}m` : '—' },
        { label: 'Crux altitude', value: profile ? `${profile.cruxAltitudeM.toLocaleString()}m` : '—' },
        { label: 'Exit altitude', value: profile ? `${profile.exitAltitudeM.toLocaleString()}m` : '—' },
        { label: 'Technical grade', value: grade },
        { label: 'Parties on route', value: String(climbers.length) },
        { label: 'Sensor covering it', value: sensor?.label ?? 'none' },
      ]
      const summary = `${entity.label} runs ${profile?.lengthKm ?? '—'}km from ${profile?.entryAltitudeM.toLocaleString() ?? '—'}m to a ${profile?.exitAltitudeM.toLocaleString() ?? '—'}m exit, graded ${grade}. ${climbers.length} climber${climbers.length === 1 ? ' is' : 's are'} currently on route across ${operators.length} operator${operators.length === 1 ? '' : 's'}.`
      return { kind: 'route', rows, summary }
    }
    case 'operator': {
      const route = byId.get(entity.parentId ?? '')
      const climbers = dataset.domainEntities.filter((e) => e.tier === 'climber' && e.parentId === entity.id)
      const anomalies = climbers.filter((c) => c.status === 'anomaly').length
      const guidesActive = randInt(rand, 2, 8)
      const rating = SAFETY_RATINGS[Math.floor(rand() * SAFETY_RATINGS.length)]
      const rows: PropertyRow[] = [
        { label: 'Route', value: route?.label ?? '—' },
        { label: 'Guides active', value: String(guidesActive) },
        { label: 'Climbers', value: String(climbers.length) },
        { label: 'Safety rating', value: rating },
        { label: 'Anomalies among them', value: String(anomalies) },
      ]
      const summary = `${entity.label} is guiding ${climbers.length} climber${climbers.length === 1 ? '' : 's'} on ${route?.label ?? 'its route'} with ${guidesActive} guides active, rated ${rating}.${anomalies > 0 ? ` ${anomalies} of their climbers ${anomalies === 1 ? 'is' : 'are'} currently flagged.` : ''}`
      return { kind: 'operator', rows, summary }
    }
    case 'climber': {
      const profile = ctx.climberProfiles.get(entity.id)
      const placement = ctx.climberPlacements.get(entity.id)
      const connections = computeConnections(dataset, entity.id)
      const ropePartners = connections.filter((c) => c.relation === 'rope-partner')
      const vitals = ctx.activeVitals?.climberId === entity.id ? ctx.activeVitals.reading : null
      const rows: PropertyRow[] = [
        { label: 'Operator', value: profile?.operatorLabel ?? '—' },
        { label: 'Route', value: profile?.routeLabel ?? '—' },
        { label: 'Current camp', value: placement?.camp ?? '—' },
        { label: 'Altitude', value: placement ? `${placement.altitudeM.toLocaleString()}m` : '—' },
        { label: 'Ethnicity', value: profile?.ethnicity ?? '—' },
        { label: 'Origin', value: profile?.originCountry ?? '—' },
        { label: 'Date of birth', value: profile ? `${profile.dateOfBirthIso} (${profile.ageYears})` : '—' },
        { label: 'Summits', value: profile ? String(profile.summitsCompleted) : '—' },
        vitals
          ? { label: 'SpO2', value: `${Math.round(vitals.spo2)}%`, breaching: vitals.spo2 < SPO2_BREACH_PCT, threshold: vitals.spo2 < SPO2_BREACH_PCT ? `threshold ${SPO2_BREACH_PCT}%` : undefined }
          : { label: 'SpO2', value: '—' },
        vitals
          ? {
              label: 'Heart rate',
              value: `${Math.round(vitals.hr)}bpm`,
              breaching: vitals.hr > HR_BREACH_HIGH_BPM || vitals.hr < HR_BREACH_LOW_BPM,
              threshold: vitals.hr > HR_BREACH_HIGH_BPM || vitals.hr < HR_BREACH_LOW_BPM ? `threshold ${HR_BREACH_LOW_BPM}-${HR_BREACH_HIGH_BPM}bpm` : undefined,
            }
          : { label: 'Heart rate', value: '—' },
        { label: 'Rope partners', value: ropePartners.length > 0 ? ropePartners.map((p) => p.label).join(', ') : 'none' },
      ]
      const flaggedText = entity.status === 'anomaly' ? ` This climber is currently flagged.` : ''
      const summary = `${entity.label} is climbing with ${profile?.operatorLabel ?? 'their operator'} on ${profile?.routeLabel ?? 'their route'}, currently at ${placement?.camp ?? 'an unknown camp'} (${placement?.altitudeM.toLocaleString() ?? '—'}m). ${profile?.summitsCompleted ?? 0} prior summit${(profile?.summitsCompleted ?? 0) === 1 ? '' : 's'} completed.${flaggedText}`
      return { kind: 'climber', rows, summary }
    }
    case 'sensor': {
      const route = byId.get(entity.parentId ?? '')
      const regionId = route ? regionIdOfRoute(byId, route.id) : null
      const reading = regionId ? ctx.environmentReadings.get(regionId) : undefined
      const battery = randInt(rand, 18, 100)
      const lastTs = mostRecentSubNodeTs(dataset, entity.id)
      const rows: PropertyRow[] = [
        { label: 'Route', value: route?.label ?? '—' },
        ...conditionsRows(reading),
        { label: 'Battery', value: `${battery}%`, breaching: battery < 20, threshold: battery < 20 ? 'threshold 20%' : undefined },
        { label: 'Last reading age', value: lastTs !== null ? formatAgo(lastTs, nowMs) : '—' },
      ]
      const conditionsClause = reading ? `currently reading ${conditionsSummaryPhrase(reading)}` : 'has not reported live conditions yet'
      const summary = `${entity.label} covers ${route?.label ?? 'its route'}, ${conditionsClause}. Battery at ${battery}%.`
      return { kind: 'sensor', rows, summary }
    }
  }
}

function routeLabelFor(byId: ReadonlyMap<GraphId, DomainEntity>, climberId: GraphId): string | null {
  const climber = byId.get(climberId)
  const operator = climber?.parentId ? byId.get(climber.parentId) : undefined
  const route = operator?.parentId ? byId.get(operator.parentId) : undefined
  return route?.label ?? null
}

const RECORD_SOURCE_LABEL = 'field system'

function computeRecordDetail(sub: SubNode): EntityDetail {
  const rand = mulberry32(seedFromString(sub.id, 7200))
  const confidencePct = randInt(rand, 62, 99)
  const rows: PropertyRow[] = [
    { label: 'Kind', value: sub.kind },
    { label: 'Timestamp', value: new Date(sub.ts).toISOString() },
    { label: 'Source', value: sub.provenanceId || RECORD_SOURCE_LABEL },
    { label: 'Summary', value: sub.summary },
    { label: 'Confidence', value: `${confidencePct}%` },
  ]
  const summary = `A ${sub.kind} record${sub.status === 'alert' ? ', currently flagged,' : ''}: ${sub.summary}`
  return { kind: 'record', rows, summary }
}

// -- LABELS: "small chips at the foot — the entity kind, its country, its
// status, and any tags: corroborated, single-source, anomalous, prior-
// expedition." Status itself already reads as ANOMALY/NOMINAL in its own
// chip (the header), so "anomalous" here isn't repeated as a redundant
// second badge — corroborated/single-source (provenance diversity across
// this entity's own attached records) and prior-expedition (climbers with
// at least one graph/domain.ts HistoryLink) are the two tags that add
// information the header doesn't already carry. --

export interface LabelChips {
  kind: string
  country: string | null
  status: string
  tags: string[]
}

export function computeLabels(dataset: DomainDataset, id: GraphId): LabelChips | null {
  const byId = new Map(dataset.domainEntities.map((e) => [e.id, e]))
  const entity = byId.get(id)
  if (entity) {
    const country = byId.get(entity.countryId)
    const tags: string[] = []
    const provenances = new Set(dataset.subNodes.filter((s) => s.parentId === id).map((s) => s.provenanceId))
    if (provenances.size > 1) tags.push('corroborated')
    else if (provenances.size === 1) tags.push('single-source')
    if (entity.tier === 'climber' && dataset.historyLinks.some((h) => h.climberId === id)) tags.push('prior-expedition')
    return { kind: entity.tier, country: country?.label ?? null, status: entity.status, tags }
  }
  const sub = dataset.subNodes.find((s) => s.id === id)
  if (sub) {
    return { kind: 'record', country: null, status: sub.status, tags: [] }
  }
  const env = dataset.environmentNodes.find((e) => e.id === id)
  if (env) {
    const country = byId.get(env.countryId)
    return { kind: 'environment', country: country?.label ?? null, status: env.breached ? 'anomaly' : 'nominal', tags: [] }
  }
  return null
}
