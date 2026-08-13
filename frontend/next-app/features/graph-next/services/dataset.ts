// S8.3: DATASET AND THE SUB-NODE LAYER. The 127 top-tier entities (5 countries, 14 regions, 14 routes, 30 operators, 50 climbers, 14 sensors) reuse the
// Control Room's own reference names (REGIONS/ROUTE_NAMES/ROUTE_OPERATORS,
// pure exported constants — importing them touches nothing about the ASE
// TracedValue graph, so this never risks the registry-clobbering hazard a
// second `buildDataset()` call would: ase/dataset.ts's own `buildDataset()`
// calls `clearRegistry()` on every invocation, and that registry is a
// module-level singleton the Control Room ALSO depends on, so this module
// deliberately never calls it) — so a country, region, route or operator
// named here is the exact same one the Control Room shows. The 50 climbers
// are generated independently (this graph needs its own deterministic seed
// stream, not a second copy of ase/dataset.ts's private name-generation
// logic), except for the two individuals other surfaces are likely to name
// directly: James Marshall III (climber index 0) and Nima Tamang, matching
// ase/dataset.ts's own placement (operator 1's first climber) — a
// deliberate, disclosed scope decision, not an oversight.
//
// The sub-node layer is new content, unique to the graph: telemetry,
// events, maintenance, logs, documents, alerts and historical records
// attached to every one of the 127 entities, seeded within the bands S8.3
// specifies, landing the total "terminal point" count around 2,400-3,200 —
// the density the NETWORK view's reference image needs.

import { IS_DEV } from './env'
import { REGIONS, ROUTE_NAMES, ROUTE_OPERATORS } from '@/features/ase/services/dataset'
import { mulberry32, randInt, seedFromString, seededShuffle, weightedPick } from './rng'
import type { GraphId } from '../types/graph'
import type { DomainDataset, DomainEntity, EdgeKind, EntityStatus, EntityTier, EnvironmentNode, GraphEdge, GraphNode, HistoryLink, SubNode, SubNodeKind } from '../types/domain'

// -- S8.4b: environment node baselines ---------------------------------
// A seeded reading per region, independent of TERRAIN's own per-route
// altitude profile (terrainProfile.ts) — dataset.ts is the foundational
// generator everything else (including terrainProfile.ts) builds on top
// of, so it can't reach "up" into a module that itself depends on this
// one. Breach thresholds are tuned (and checked in dataset.test.ts) to
// land a handful of the 14 regions breached at baseline, not none and not
// all of them.
// Exported — environmentStore.ts's live tick re-evaluates `breached` against
// these SAME thresholds every tick, so a live reading and this seeded
// baseline can never disagree about what "breached" means.
export const ENVIRONMENT_WIND_BREACH_KPH = 85
export const ENVIRONMENT_TEMP_BREACH_C = -36
export const ENVIRONMENT_VISIBILITY_BREACH_KM = 0.6
export const ENVIRONMENT_FREEZING_BREACH_M = 5600

function buildEnvironmentNode(rand: () => number, id: GraphId, regionId: GraphId, countryId: GraphId): EnvironmentNode {
  const windKph = randInt(rand, 8, 95)
  const temperatureC = -randInt(rand, 2, 38)
  const altitudeBase = randInt(rand, 4500, 7600)
  const visibilityKm = Math.round((0.4 + rand() * 19.6) * 10) / 10
  const freezingLevelM = randInt(rand, 3500, 5700)
  const breached =
    windKph > ENVIRONMENT_WIND_BREACH_KPH ||
    temperatureC < ENVIRONMENT_TEMP_BREACH_C ||
    visibilityKm < ENVIRONMENT_VISIBILITY_BREACH_KM ||
    freezingLevelM > ENVIRONMENT_FREEZING_BREACH_M
  return {
    id,
    kind: 'environment',
    regionId,
    countryId,
    windKph,
    temperatureC,
    altitudeBandM: [altitudeBase, altitudeBase + 400],
    visibilityKm,
    freezingLevelM,
    breached,
  }
}

// -- S8.4b: history links ------------------------------------------------
const HISTORY_LINK_PROBABILITY = 0.6
const HISTORY_LINK_COUNT_RANGE: [number, number] = [1, 3]

export const GRAPH_SEED = 8300

// Fixed, never Date.now() — buildGraphDataset(SEED) must deep-equal itself
// on every call, including every sub-node's timestamp.
const BUILD_ANCHOR_MS = Date.UTC(2026, 7, 9, 12, 0, 0)

// -- sub-node count bands, per S8.3 -----------------------------------------

const SUBNODE_BAND: Record<EntityTier, [number, number]> = {
  climber: [18, 40],
  sensor: [24, 60],
  operator: [6, 14],
  route: [8, 20],
  region: [4, 10],
  country: [3, 6],
}

const POINT_COUNT_BAND: [number, number] = [2400, 3200]

// -- kind weights, per tier, normal vs anomalous-parent boosted -------------
// Every table sums to 1.0 — not load-bearing (weightedPick normalises by
// its own total), kept exact anyway so the weights read as real
// proportions, not arbitrary numbers.

const KIND_WEIGHTS: Record<EntityTier, Record<SubNodeKind, number>> = {
  climber: { telemetry: 0.57, logs: 0.21, events: 0.1, documents: 0.08, historical: 0.03, alerts: 0.01, maintenance: 0 },
  sensor: { telemetry: 0.52, logs: 0.21, maintenance: 0.15, events: 0.08, historical: 0.02, documents: 0.01, alerts: 0.01 },
  operator: { documents: 0.37, events: 0.3, logs: 0.21, historical: 0.1, alerts: 0.02, telemetry: 0, maintenance: 0 },
  route: { logs: 0.32, documents: 0.31, historical: 0.31, events: 0.05, alerts: 0.01, telemetry: 0, maintenance: 0 },
  region: { historical: 0.66, documents: 0.2, logs: 0.1, events: 0.03, alerts: 0.01, telemetry: 0, maintenance: 0 },
  country: { documents: 0.56, historical: 0.4, events: 0.03, alerts: 0.01, telemetry: 0, logs: 0, maintenance: 0 },
}

// Only climbers and sensors are ever anomalous (S8.3: "9 climbers and 3
// sensors") — these are the only two boosted tables that exist.
const KIND_WEIGHTS_ANOMALOUS: Partial<Record<EntityTier, Record<SubNodeKind, number>>> = {
  climber: { telemetry: 0.53, logs: 0.17, events: 0.1, documents: 0.06, historical: 0.03, alerts: 0.07, maintenance: 0 },
  sensor: { telemetry: 0.49, logs: 0.17, maintenance: 0.13, events: 0.08, historical: 0.02, documents: 0.01, alerts: 0.06 },
}

// Breaching-reading probability for a non-'alerts'-kind sub-node — real
// signal on top of the always-alert 'alerts' kind, tuned (and verified in
// dataset.test.ts) so the realised total lands near the "roughly 2%" S8.3
// asks for, clustered on anomalous parents rather than flat across all
// ~2,650 sub-nodes.
const BREACH_PROBABILITY_NORMAL = 0.0006
const BREACH_PROBABILITY_ANOMALOUS_PARENT = 0.025

// -- climber name pool --------------------------------------------------
// Independent of ase/dataset.ts's own (private, unexported) NAME_POOLS —
// see this file's header comment for why. James Marshall III and Nima
// Tamang are placed at the same structural positions ase/dataset.ts uses
// (index 0; operator 1's first climber) so at least those two are never
// contradictable between the two surfaces.

const CLIMBER_FIRST_NAMES = [
  'Pemba', 'Lhakpa', 'Dawa', 'Mingma', 'Tenzing', 'Karma', 'Ang', 'Sonam',
  'Michael', 'Sarah', 'David', 'Jessica', 'Ryan', 'Amanda', 'Robert', 'Laura',
  'Oliver', 'Emma', 'George', 'Charlotte', 'Harry', 'Alice', 'Thomas', 'Olivia',
  'Antoine', 'Camille', 'Julien', 'Margaux', 'Lukas', 'Anja', 'Matthias', 'Sabine',
  'Kenji', 'Yuki', 'Hiroshi', 'Aiko', 'Min-jun', 'Ji-woo', 'Alberto', 'Elena',
  'Piotr', 'Anna', 'Arjun', 'Priya', 'Rohan', 'Divya', 'Aidos', 'Zarina', 'Carlos', 'Marta',
]
const CLIMBER_LAST_NAMES = [
  'Sherpa', 'Tamang', 'Gurung', 'Rai', 'Anderson', 'Carter', 'Bennett', 'Foster',
  'Whitfield', 'Ashcroft', 'Pemberton', 'Moreau', 'Girard', 'Baumann', 'Zimmermann',
  'Tanaka', 'Sato', 'Kim', 'Park', 'Fernández', 'García', 'Kowalski', 'Nowak',
  'Sharma', 'Mehta', 'Nurlanov', 'Torres',
]

function generateClimberNames(rand: () => number, count: number): string[] {
  const names: string[] = ['James Marshall III']
  const used = new Set(names)
  while (names.length < count) {
    const first = CLIMBER_FIRST_NAMES[Math.floor(rand() * CLIMBER_FIRST_NAMES.length)]
    const last = CLIMBER_LAST_NAMES[Math.floor(rand() * CLIMBER_LAST_NAMES.length)]
    const full = `${first} ${last}`
    if (!used.has(full)) {
      used.add(full)
      names.push(full)
    }
  }
  return names
}

// -- summaries -------------------------------------------------------------

function summaryFor(kind: SubNodeKind, tier: EntityTier, label: string, rand: () => number, breaching: boolean): string {
  switch (kind) {
    case 'telemetry':
      if (tier === 'climber') {
        return breaching ? `SpO2 ${68 + randInt(rand, 0, 8)}% — below safe threshold` : `SpO2 ${88 + randInt(rand, 0, 8)}%, HR ${70 + randInt(rand, 0, 40)}bpm`
      }
      if (tier === 'sensor') {
        return breaching ? `Wind ${75 + randInt(rand, 0, 40)}kph — exceeds operating threshold` : `Wind ${10 + randInt(rand, 0, 40)}kph, temp ${-20 + randInt(rand, 0, 15)}°C`
      }
      return `Telemetry reading — ${label}`
    case 'events':
      return breaching ? `Incident reported — ${label}` : `Routine check-in logged — ${label}`
    case 'maintenance':
      return breaching ? `${label} — maintenance overdue` : `${label} — scheduled maintenance completed`
    case 'logs':
      return `Log entry — ${label}`
    case 'documents':
      return `Document on file — ${label}`
    case 'alerts':
      return `ALERT — ${label} flagged for review`
    case 'historical':
      return `Historical record — ${label}, prior expedition`
  }
}

// -- builder ----------------------------------------------------------------

export function buildGraphDataset(seed: number = GRAPH_SEED): DomainDataset {
  const rand = mulberry32(seed)

  const domainEntities: DomainEntity[] = []
  const byId = new Map<GraphId, DomainEntity>()

  function addEntity(id: GraphId, tier: EntityTier, label: string, parentId: GraphId | null, countryId: GraphId): DomainEntity {
    const entity: DomainEntity = { id, tier, label, parentId, countryId, status: 'nominal' }
    domainEntities.push(entity)
    byId.set(id, entity)
    return entity
  }

  // -- countries, regions, routes ------------------------------------------
  const countryNames = [...new Set(REGIONS.map((r) => r.country))]
  const countryIdByName = new Map<string, GraphId>()
  countryNames.forEach((name, i) => {
    const id = `country-${i}`
    countryIdByName.set(name, id)
    addEntity(id, 'country', name, null, id)
  })

  const regionIds: GraphId[] = []
  const routeIds: GraphId[] = []
  const routeCountryId: GraphId[] = []
  REGIONS.forEach((region, i) => {
    const countryId = countryIdByName.get(region.country)!
    const regionId = `region-${i}`
    addEntity(regionId, 'region', region.name, countryId, countryId)
    regionIds.push(regionId)

    const routeId = `route-${i}`
    addEntity(routeId, 'route', ROUTE_NAMES[i], regionId, countryId)
    routeIds.push(routeId)
    routeCountryId.push(countryId)

    const sensorId = `sensor-${i}`
    addEntity(sensorId, 'sensor', `Sensor ${i + 1} — ${ROUTE_NAMES[i]}`, routeId, countryId)
  })

  // -- S8.4b: environment nodes, one per region ----------------------------
  const environmentNodes: EnvironmentNode[] = REGIONS.map((region, i) => {
    const countryId = countryIdByName.get(region.country)!
    const envRand = mulberry32(seedFromString(`region-${i}`, 5500))
    return buildEnvironmentNode(envRand, `environment-${i}`, `region-${i}`, countryId)
  })

  // -- operators ------------------------------------------------------------
  const operatorNames = ROUTE_OPERATORS.flat()
  const operatorRouteIndex: number[] = []
  ROUTE_OPERATORS.forEach((ops, routeIdx) => {
    for (let k = 0; k < ops.length; k++) operatorRouteIndex.push(routeIdx)
  })
  const operatorIds: GraphId[] = operatorNames.map((name, i) => {
    const routeIdx = operatorRouteIndex[i]
    const id = `operator-${i}`
    addEntity(id, 'operator', name, routeIds[routeIdx], routeCountryId[routeIdx])
    return id
  })

  // -- climbers, distributed across operators (1 each, then up to 4) --------
  const CLIMBER_COUNT = 50
  const operatorClimberCounts: number[] = new Array(operatorIds.length).fill(1)
  let remaining = CLIMBER_COUNT - operatorIds.length
  while (remaining > 0) {
    const idx = Math.floor(rand() * operatorIds.length)
    if (operatorClimberCounts[idx] < 4) {
      operatorClimberCounts[idx]++
      remaining--
    }
  }
  const climberOperatorIndex: number[] = []
  operatorClimberCounts.forEach((count: number, opIdx: number) => {
    for (let k = 0; k < count; k++) climberOperatorIndex.push(opIdx)
  })

  const climberNames = generateClimberNames(rand, CLIMBER_COUNT)
  // Nima Tamang: operator 1's first climber — same structural placement
  // ase/dataset.ts uses, so this one other name is also never contradictable.
  const nimaIndex = climberOperatorIndex.indexOf(1)
  if (nimaIndex !== -1) climberNames[nimaIndex] = 'Nima Tamang'

  const climberIds: GraphId[] = climberNames.map((name, i) => {
    const opIdx = climberOperatorIndex[i]
    const id = `climber-${i}`
    addEntity(id, 'climber', name, operatorIds[opIdx], byId.get(operatorIds[opIdx])!.countryId)
    return id
  })

  // -- S8.4b: history links — climber -> a PRIOR region, never their own --
  function currentRegionIdFor(climberId: GraphId): GraphId {
    const climber = byId.get(climberId)!
    const operator = byId.get(climber.parentId!)!
    const route = byId.get(operator.parentId!)!
    return route.parentId!
  }
  const historyLinks: HistoryLink[] = []
  climberIds.forEach((climberId) => {
    const hRand = mulberry32(seedFromString(climberId, 5600))
    if (hRand() >= HISTORY_LINK_PROBABILITY) return
    const ownRegionId = currentRegionIdFor(climberId)
    const candidates = regionIds.filter((r) => r !== ownRegionId)
    const shuffled = seededShuffle(candidates, hRand)
    const count = randInt(hRand, HISTORY_LINK_COUNT_RANGE[0], HISTORY_LINK_COUNT_RANGE[1])
    for (const regionId of shuffled.slice(0, count)) {
      historyLinks.push({ climberId, regionId })
    }
  })

  // -- anomalies: 9 climbers (never index 0) + 3 sensors, spread across ----
  // -- at least 4 operators and 3 countries --------------------------------
  const sensorIds = domainEntities.filter((e) => e.tier === 'sensor').map((e) => e.id)

  function pickAnomalousClimbers(): GraphId[] {
    const candidates = climberIds.slice(1) // never index 0 (James Marshall III)
    for (let attempt = 0; attempt < 50; attempt++) {
      const shuffled = seededShuffle(candidates, mulberry32(seed + 7000 + attempt))
      const picked = shuffled.slice(0, 9)
      const operators = new Set(picked.map((id) => byId.get(id)!.parentId))
      const countries = new Set(picked.map((id) => byId.get(id)!.countryId))
      if (operators.size >= 4 && countries.size >= 3) return picked
    }
    // Exhaustive fallback — deterministic, not random: walk climbers in id
    // order until the spread requirement is met. With 50 climbers across 30
    // operators and 5 countries this is unreachable in practice, but the
    // loop above must never be allowed to silently return an unverified set.
    const operators = new Set<GraphId | null>()
    const countries = new Set<GraphId>()
    const picked: GraphId[] = []
    for (const id of candidates) {
      if (picked.length >= 9 && operators.size >= 4 && countries.size >= 3) break
      picked.push(id)
      operators.add(byId.get(id)!.parentId)
      countries.add(byId.get(id)!.countryId)
    }
    return picked.slice(0, 9)
  }

  const anomalyClimberIds = pickAnomalousClimbers()
  const anomalySensorIds = seededShuffle(sensorIds, mulberry32(seed + 9000)).slice(0, 3)

  const anomalySet = new Set([...anomalyClimberIds, ...anomalySensorIds])
  for (const id of anomalySet) byId.get(id)!.status = 'anomaly' as EntityStatus

  // -- sub-nodes --------------------------------------------------------------
  const subNodes: SubNode[] = []
  for (const entity of domainEntities) {
    const [minC, maxC] = SUBNODE_BAND[entity.tier]
    const entityRand = mulberry32(seedFromString(entity.id, 42))
    const count = randInt(entityRand, minC, maxC)
    const isAnomalous = entity.status === 'anomaly'
    const weights = (isAnomalous && KIND_WEIGHTS_ANOMALOUS[entity.tier]) || KIND_WEIGHTS[entity.tier]
    const breachP = isAnomalous ? BREACH_PROBABILITY_ANOMALOUS_PARENT : BREACH_PROBABILITY_NORMAL

    for (let i = 0; i < count; i++) {
      const kind = weightedPick(entityRand, weights)
      const breaching = kind !== 'alerts' && entityRand() < breachP
      const status = kind === 'alerts' || breaching ? 'alert' : 'nominal'
      const minutesAgo = randInt(entityRand, 5, 60 * 24 * 90) // up to ~90 days back
      subNodes.push({
        id: `sub-${entity.id}-${i}`,
        parentId: entity.id,
        kind,
        ts: BUILD_ANCHOR_MS - minutesAgo * 60000,
        summary: summaryFor(kind, entity.tier, entity.label, entityRand, breaching),
        provenanceId: `prov:${entity.tier}:${entity.id}:${kind}:${i}`,
        status,
      })
    }
  }

  // -- edges --------------------------------------------------------------
  const edges: GraphEdge[] = []
  function statusOf(id: GraphId): EntityStatus | SubNode['status'] {
    const e = byId.get(id)
    if (e) return e.status
    return subNodeById.get(id)?.status ?? 'nominal'
  }
  const subNodeById = new Map(subNodes.map((s) => [s.id, s]))
  function edgeKind(base: EdgeKind, target: GraphId): EdgeKind {
    const s = statusOf(target)
    return s === 'anomaly' || s === 'alert' ? 'anomaly' : base
  }

  for (const entity of domainEntities) {
    if (entity.parentId === null) continue
    const base: EdgeKind = entity.tier === 'climber' ? 'operational' : 'structural'
    edges.push({ source: entity.parentId, target: entity.id, kind: edgeKind(base, entity.id) })
  }

  // rope links: first two climbers under an operator with 2+ climbers
  const climbersByOperator = new Map<GraphId, GraphId[]>()
  climberIds.forEach((id) => {
    const opId = byId.get(id)!.parentId!
    const list = climbersByOperator.get(opId) ?? []
    list.push(id)
    climbersByOperator.set(opId, list)
  })
  for (const list of climbersByOperator.values()) {
    if (list.length >= 2) {
      edges.push({ source: list[0], target: list[1], kind: edgeKind('operational', list[1]) })
    }
  }

  for (const sub of subNodes) {
    edges.push({ source: sub.parentId, target: sub.id, kind: edgeKind('filament', sub.id) })
  }

  const entities: GraphNode[] = [...domainEntities, ...subNodes, ...environmentNodes]

  const dataset: DomainDataset = {
    version: seed,
    entities,
    domainEntities,
    subNodes,
    environmentNodes,
    historyLinks,
    edges,
    pointCount: subNodes.length,
    anomalyClimberIds,
    anomalySensorIds,
  }

  if (IS_DEV) {
    const violations = validateGraphDataset(dataset)
    for (const v of violations) {
       
      console.error(`[graph/dataset] invariant violated: ${v}`)
    }
  }

  return dataset
}

// -- invariant checks ---------------------------------------------------

export function validateGraphDataset(dataset: DomainDataset): string[] {
  const violations: string[] = []
  const byId = new Map<GraphId, GraphNode>(dataset.entities.map((e) => [e.id, e]))

  for (const sub of dataset.subNodes) {
    if (!byId.has(sub.parentId)) violations.push(`sub-node "${sub.id}" has no resolvable parent "${sub.parentId}"`)
    if (!Number.isFinite(sub.ts)) violations.push(`sub-node "${sub.id}" has a non-finite ts`)
  }

  for (const entity of dataset.domainEntities) {
    if (entity.tier === 'country') {
      if (entity.parentId !== null) violations.push(`country "${entity.id}" must have parentId null`)
      continue
    }
    let current: DomainEntity | undefined = entity
    const seen = new Set<GraphId>()
    let hops = 0
    while (current && current.parentId !== null) {
      if (seen.has(current.id)) {
        violations.push(`entity "${entity.id}" is in a parent cycle`)
        break
      }
      seen.add(current.id)
      const next = dataset.domainEntities.find((e) => e.id === current!.parentId)
      if (!next) {
        violations.push(`entity "${entity.id}" resolves to a dangling parent "${current.parentId}"`)
        break
      }
      current = next
      hops++
      if (hops > 10) {
        violations.push(`entity "${entity.id}" did not resolve to a country within 10 hops`)
        break
      }
    }
  }

  if (dataset.pointCount < POINT_COUNT_BAND[0] || dataset.pointCount > POINT_COUNT_BAND[1]) {
    violations.push(`pointCount ${dataset.pointCount} is outside the [${POINT_COUNT_BAND[0]}, ${POINT_COUNT_BAND[1]}] band`)
  }

  if (dataset.anomalyClimberIds.length !== 9) violations.push(`expected 9 anomalous climbers, got ${dataset.anomalyClimberIds.length}`)
  if (dataset.anomalySensorIds.length !== 3) violations.push(`expected 3 anomalous sensors, got ${dataset.anomalySensorIds.length}`)
  if (dataset.anomalyClimberIds.includes('climber-0')) violations.push('James Marshall III (climber-0) must never be anomalous')

  const operators = new Set(dataset.anomalyClimberIds.map((id) => byId.get(id) && (byId.get(id) as DomainEntity).parentId))
  if (operators.size < 4) violations.push(`anomalous climbers span only ${operators.size} operators, need >= 4`)
  const countries = new Set(dataset.anomalyClimberIds.map((id) => (byId.get(id) as DomainEntity).countryId))
  if (countries.size < 3) violations.push(`anomalous climbers span only ${countries.size} countries, need >= 3`)

  for (const node of dataset.entities) {
    for (const [k, v] of Object.entries(node)) {
      if (typeof v === 'number' && !Number.isFinite(v)) violations.push(`entity "${node.id}" field "${k}" is non-finite`)
    }
  }

  // -- S8.4b invariants -----------------------------------------------------
  if (dataset.environmentNodes.length !== 14) {
    violations.push(`expected 14 environment nodes (one per region), got ${dataset.environmentNodes.length}`)
  }
  const regionIdSet = new Set(dataset.domainEntities.filter((e) => e.tier === 'region').map((e) => e.id))
  for (const env of dataset.environmentNodes) {
    if (!regionIdSet.has(env.regionId)) violations.push(`environment node "${env.id}" points at a non-existent region "${env.regionId}"`)
    const region = byId.get(env.regionId) as DomainEntity | undefined
    if (region && region.countryId !== env.countryId) {
      violations.push(`environment node "${env.id}"'s countryId disagrees with its own region's countryId`)
    }
  }

  const climberIdSet = new Set(dataset.domainEntities.filter((e) => e.tier === 'climber').map((e) => e.id))
  const entityById = new Map<GraphId, DomainEntity>(dataset.domainEntities.map((e) => [e.id, e]))
  function ownRegionOf(climberId: GraphId): GraphId | null {
    const climber = entityById.get(climberId)
    const operator = climber?.parentId ? entityById.get(climber.parentId) : undefined
    const route = operator?.parentId ? entityById.get(operator.parentId) : undefined
    return route?.parentId ?? null
  }
  for (const link of dataset.historyLinks) {
    if (!climberIdSet.has(link.climberId)) violations.push(`history link references a non-existent climber "${link.climberId}"`)
    if (!regionIdSet.has(link.regionId)) violations.push(`history link references a non-existent region "${link.regionId}"`)
    if (ownRegionOf(link.climberId) === link.regionId) {
      violations.push(`history link for "${link.climberId}" points at their OWN current region "${link.regionId}" — history must be a PRIOR region`)
    }
  }

  return violations
}
