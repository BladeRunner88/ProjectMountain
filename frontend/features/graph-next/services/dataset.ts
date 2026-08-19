// S8.3: DATASET AND THE SUB-NODE LAYER. The 127 top-tier entities (5 countries, 14 plants, 14 lines, 30 operators, 50 machines, 14 sensors) reuse the
// Control Room's own reference names (PLANTS/LINE_NAMES/LINE_OPERATORS,
// pure exported constants — importing them touches nothing about the ASE
// TracedValue graph, so this never risks the registry-clobbering hazard a
// second `buildDataset()` call would: ase/dataset.ts's own `buildDataset()`
// calls `clearRegistry()` on every invocation, and that registry is a
// module-level singleton the Control Room ALSO depends on, so this module
// deliberately never calls it) — so a country, plant, line or operator
// named here is the exact same one the Control Room shows. The 50 machines
// are generated independently (this graph needs its own deterministic seed
// stream, not a second copy of ase/dataset.ts's private name-generation
// logic), except for the two individuals other surfaces are likely to name
// directly: the worked-example machine (machine index 0) and the outlier machine, matching
// ase/dataset.ts's own placement (operator 1's first machine) — a
// deliberate, disclosed scope decision, not an oversight.
//
// The sub-node layer is new content, unique to the graph: telemetry,
// events, maintenance, logs, documents, alerts and historical records
// attached to every one of the 127 entities, seeded within the bands S8.3
// specifies, landing the total "terminal point" count around 2,400-3,200 —
// the density the NETWORK view's reference image needs.

import { IS_DEV } from "./env"
import {
  mulberry32,
  randInt,
  seedFromString,
  seededShuffle,
  weightedPick,
} from "./rng"
import type { GraphId } from "../types/graph"
import type { AseWorld } from "@/features/ase/types/world"
import type {
  DomainDataset,
  DomainEntity,
  EdgeKind,
  EntityStatus,
  EntityTier,
  EnvironmentNode,
  GraphEdge,
  GraphNode,
  HistoryLink,
  SubNode,
  SubNodeKind,
} from "../types/domain"

// -- S8.4b: environment node baselines ---------------------------------
// A seeded reading per plant, independent of TERRAIN's own per-line
// load profile (terrainProfile.ts) — dataset.ts is the foundational
// generator everything else (including terrainProfile.ts) builds on top
// of, so it can't reach "up" into a module that itself depends on this
// one. Breach thresholds are tuned (and checked in dataset.test.ts) to
// land a handful of the 14 plants breached at baseline, not none and not
// all of them.
// Exported — environmentStore.ts's live tick re-evaluates `breached` against
// these SAME thresholds every tick, so a live reading and this seeded
// baseline can never disagree about what "breached" means.
export const ENVIRONMENT_VIBRATION_BREACH_MM_S = 85
export const ENVIRONMENT_SPINDLE_TEMP_BREACH_C = -36
export const ENVIRONMENT_OEE_BREACH_PCT = 0.6
export const ENVIRONMENT_CYCLE_TIME_BREACH_S = 5600

function buildEnvironmentNode(
  rand: () => number,
  id: GraphId,
  plantId: GraphId,
  countryId: GraphId
): EnvironmentNode {
  const vibrationMmS = randInt(rand, 8, 95)
  const spindleTempC = -randInt(rand, 2, 38)
  const loadBase = randInt(rand, 4500, 7600)
  const oeePct = Math.round((0.4 + rand() * 19.6) * 10) / 10
  const cycleTimeS = randInt(rand, 3500, 5700)
  const breached =
    vibrationMmS > ENVIRONMENT_VIBRATION_BREACH_MM_S ||
    spindleTempC < ENVIRONMENT_SPINDLE_TEMP_BREACH_C ||
    oeePct < ENVIRONMENT_OEE_BREACH_PCT ||
    cycleTimeS > ENVIRONMENT_CYCLE_TIME_BREACH_S
  return {
    id,
    kind: "environment",
    plantId,
    countryId,
    vibrationMmS,
    spindleTempC,
    loadBandM: [loadBase, loadBase + 400],
    oeePct,
    cycleTimeS,
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
  machine: [18, 40],
  sensor: [24, 60],
  line: [8, 20],
  plant: [4, 10],
  country: [3, 6],
}

// Sub-nodes hang off entities, so the total scales with however many the
// warehouse reports. This was a fixed [2400, 3200] band, which only held for
// the one topology this file used to invent.
const POINT_COUNT_PER_ENTITY_BAND: [number, number] = [1, 60]

// -- kind weights, per tier, normal vs anomalous-parent boosted -------------
// Every table sums to 1.0 — not load-bearing (weightedPick normalises by
// its own total), kept exact anyway so the weights read as real
// proportions, not arbitrary numbers.

const KIND_WEIGHTS: Record<EntityTier, Record<SubNodeKind, number>> = {
  machine: {
    telemetry: 0.57,
    logs: 0.21,
    events: 0.1,
    documents: 0.08,
    historical: 0.03,
    alerts: 0.01,
    maintenance: 0,
  },
  sensor: {
    telemetry: 0.52,
    logs: 0.21,
    maintenance: 0.15,
    events: 0.08,
    historical: 0.02,
    documents: 0.01,
    alerts: 0.01,
  },
  line: {
    logs: 0.32,
    documents: 0.31,
    historical: 0.31,
    events: 0.05,
    alerts: 0.01,
    telemetry: 0,
    maintenance: 0,
  },
  plant: {
    historical: 0.66,
    documents: 0.2,
    logs: 0.1,
    events: 0.03,
    alerts: 0.01,
    telemetry: 0,
    maintenance: 0,
  },
  country: {
    documents: 0.56,
    historical: 0.4,
    events: 0.03,
    alerts: 0.01,
    telemetry: 0,
    logs: 0,
    maintenance: 0,
  },
}

// Only machines and sensors are ever anomalous (S8.3: "9 machines and 3
// sensors") — these are the only two boosted tables that exist.
const KIND_WEIGHTS_ANOMALOUS: Partial<
  Record<EntityTier, Record<SubNodeKind, number>>
> = {
  machine: {
    telemetry: 0.53,
    logs: 0.17,
    events: 0.1,
    documents: 0.06,
    historical: 0.03,
    alerts: 0.07,
    maintenance: 0,
  },
  sensor: {
    telemetry: 0.49,
    logs: 0.17,
    maintenance: 0.13,
    events: 0.08,
    historical: 0.02,
    documents: 0.01,
    alerts: 0.06,
  },
}

// Breaching-reading probability for a non-'alerts'-kind sub-node — real
// signal on top of the always-alert 'alerts' kind, tuned (and verified in
// dataset.test.ts) so the realised total lands near the "roughly 2%" S8.3
// asks for, clustered on anomalous parents rather than flat across all
// ~2,650 sub-nodes.
const BREACH_PROBABILITY_NORMAL = 0.0006
const BREACH_PROBABILITY_ANOMALOUS_PARENT = 0.025

// -- summaries -------------------------------------------------------------

function summaryFor(
  kind: SubNodeKind,
  tier: EntityTier,
  label: string,
  rand: () => number,
  breaching: boolean
): string {
  switch (kind) {
    case "telemetry":
      if (tier === "machine") {
        return breaching
          ? `Oee ${68 + randInt(rand, 0, 8)}% — below safe threshold`
          : `Oee ${88 + randInt(rand, 0, 8)}%, HR ${70 + randInt(rand, 0, 40)}mm/s`
      }
      if (tier === "sensor") {
        return breaching
          ? `Vibration ${75 + randInt(rand, 0, 40)}kph — exceeds operating threshold`
          : `Vibration ${10 + randInt(rand, 0, 40)}kph, temp ${-20 + randInt(rand, 0, 15)}°C`
      }
      return `Telemetry reading — ${label}`
    case "events":
      return breaching
        ? `Incident reported — ${label}`
        : `Routine check-in logged — ${label}`
    case "maintenance":
      return breaching
        ? `${label} — maintenance overdue`
        : `${label} — scheduled maintenance completed`
    case "logs":
      return `Log entry — ${label}`
    case "documents":
      return `Document on file — ${label}`
    case "alerts":
      return `ALERT — ${label} flagged for review`
    case "historical":
      return `Historical record — ${label}, prior campaign`
  }
}

// -- builder ----------------------------------------------------------------

export function buildGraphDataset(
  world: AseWorld,
  seed: number = GRAPH_SEED
): DomainDataset {
  const rand = mulberry32(seed)
  void rand

  const domainEntities: DomainEntity[] = []
  const byId = new Map<GraphId, DomainEntity>()

  function addEntity(
    id: GraphId,
    tier: EntityTier,
    label: string,
    parentId: GraphId | null,
    countryId: GraphId
  ): DomainEntity {
    const entity: DomainEntity = {
      id,
      tier,
      label,
      parentId,
      countryId,
      status: "nominal",
    }
    domainEntities.push(entity)
    byId.set(id, entity)
    return entity
  }

  // -- the structural tree, straight from the warehouse --------------------
  // Ids, labels and parents are the backend's own. That matters beyond
  // honesty: the telemetry snapshot keys its readings by these machine ids,
  // so a locally-invented id would silently never match a reading.
  //
  // There is no `operator` tier. Machines belong to lines; the people who
  // operate them are related, not structural — modelling them as a level of
  // the hierarchy was inventing a rung of the ladder.
  const worldById = new Map(world.nodes.map((node) => [node.id, node]))

  function countryOf(nodeId: string): GraphId {
    let current = worldById.get(nodeId)
    while (current && current.tier !== "country" && current.parentId) {
      current = worldById.get(current.parentId)
    }
    return (current?.id ?? nodeId) as GraphId
  }

  // Outermost tier first, so a parent always exists before its children.
  const TIER_ORDER: EntityTier[] = [
    "country",
    "plant",
    "line",
    "machine",
    "sensor",
  ]
  for (const tier of TIER_ORDER) {
    for (const node of world.nodes) {
      if (node.tier !== tier) continue
      addEntity(node.id, tier, node.label, node.parentId, countryOf(node.id))
    }
  }

  const plantIds = world.nodes
    .filter((n) => n.tier === "plant")
    .map((n) => n.id)
  const machineIds: GraphId[] = world.nodes
    .filter((n) => n.tier === "machine")
    .map((n) => n.id)

  // -- S8.4b: environment nodes, one per plant ----------------------------
  // The seeded values here are a starting point only: environmentStore
  // replaces them with real per-plant aggregates on its first poll.
  const environmentNodes: EnvironmentNode[] = plantIds.map((plantId) => {
    const envRand = mulberry32(seedFromString(plantId, 5500))
    return buildEnvironmentNode(
      envRand,
      `environment-${plantId}`,
      plantId,
      countryOf(plantId)
    )
  })

  // -- S8.4b: history links — machine -> a PRIOR plant, never their own --
  function currentPlantIdFor(machineId: GraphId): GraphId {
    const machine = byId.get(machineId)
    const line = machine?.parentId ? byId.get(machine.parentId) : undefined
    return (line?.parentId ?? machine?.countryId ?? machineId) as GraphId
  }
  const historyLinks: HistoryLink[] = []
  machineIds.forEach((machineId) => {
    const hRand = mulberry32(seedFromString(machineId, 5600))
    if (hRand() >= HISTORY_LINK_PROBABILITY) return
    const ownPlantId = currentPlantIdFor(machineId)
    const candidates = plantIds.filter((r) => r !== ownPlantId)
    const shuffled = seededShuffle(candidates, hRand)
    const count = randInt(
      hRand,
      HISTORY_LINK_COUNT_RANGE[0],
      HISTORY_LINK_COUNT_RANGE[1]
    )
    for (const plantId of shuffled.slice(0, count)) {
      historyLinks.push({ machineId, plantId })
    }
  })

  // -- anomalies: 9 machines (never index 0) + 3 sensors, spread across ----
  // -- at least 4 operators and 3 countries --------------------------------
  const sensorIds = domainEntities
    .filter((e) => e.tier === "sensor")
    .map((e) => e.id)

  function pickAnomalousMachines(): GraphId[] {
    const candidates = machineIds.slice(1) // never index 0 — that is the worked example
    for (let attempt = 0; attempt < 50; attempt++) {
      const shuffled = seededShuffle(
        candidates,
        mulberry32(seed + 7000 + attempt)
      )
      const picked = shuffled.slice(0, 9)
      const operators = new Set(picked.map((id) => byId.get(id)!.parentId))
      const countries = new Set(picked.map((id) => byId.get(id)!.countryId))
      if (operators.size >= 4 && countries.size >= 3) return picked
    }
    // Exhaustive fallback — deterministic, not random: walk machines in id
    // order until the spread requirement is met. With 50 machines across 30
    // operators and 5 countries this is unreachable in practice, but the
    // loop above must never be allowed to silently return an unverified set.
    const operators = new Set<GraphId | null>()
    const countries = new Set<GraphId>()
    const picked: GraphId[] = []
    for (const id of candidates) {
      if (picked.length >= 9 && operators.size >= 4 && countries.size >= 3)
        break
      picked.push(id)
      operators.add(byId.get(id)!.parentId)
      countries.add(byId.get(id)!.countryId)
    }
    return picked.slice(0, 9)
  }

  const anomalyMachineIds = pickAnomalousMachines()
  const anomalySensorIds = seededShuffle(
    sensorIds,
    mulberry32(seed + 9000)
  ).slice(0, 3)

  const anomalySet = new Set([...anomalyMachineIds, ...anomalySensorIds])
  for (const id of anomalySet) byId.get(id)!.status = "anomaly" as EntityStatus

  // -- sub-nodes --------------------------------------------------------------
  const subNodes: SubNode[] = []
  for (const entity of domainEntities) {
    const [minC, maxC] = SUBNODE_BAND[entity.tier]
    const entityRand = mulberry32(seedFromString(entity.id, 42))
    const count = randInt(entityRand, minC, maxC)
    const isAnomalous = entity.status === "anomaly"
    const weights =
      (isAnomalous && KIND_WEIGHTS_ANOMALOUS[entity.tier]) ||
      KIND_WEIGHTS[entity.tier]
    const breachP = isAnomalous
      ? BREACH_PROBABILITY_ANOMALOUS_PARENT
      : BREACH_PROBABILITY_NORMAL

    for (let i = 0; i < count; i++) {
      const kind = weightedPick(entityRand, weights)
      const breaching = kind !== "alerts" && entityRand() < breachP
      const status = kind === "alerts" || breaching ? "alert" : "nominal"
      const minutesAgo = randInt(entityRand, 5, 60 * 24 * 90) // up to ~90 days back
      subNodes.push({
        id: `sub-${entity.id}-${i}`,
        parentId: entity.id,
        kind,
        ts: BUILD_ANCHOR_MS - minutesAgo * 60000,
        summary: summaryFor(
          kind,
          entity.tier,
          entity.label,
          entityRand,
          breaching
        ),
        provenanceId: `prov:${entity.tier}:${entity.id}:${kind}:${i}`,
        status,
      })
    }
  }

  // -- edges --------------------------------------------------------------
  const edges: GraphEdge[] = []
  function statusOf(id: GraphId): EntityStatus | SubNode["status"] {
    const e = byId.get(id)
    if (e) return e.status
    return subNodeById.get(id)?.status ?? "nominal"
  }
  const subNodeById = new Map(subNodes.map((s) => [s.id, s]))
  function edgeKind(base: EdgeKind, target: GraphId): EdgeKind {
    const s = statusOf(target)
    return s === "anomaly" || s === "alert" ? "anomaly" : base
  }

  for (const entity of domainEntities) {
    if (entity.parentId === null) continue
    const base: EdgeKind =
      entity.tier === "machine" ? "operational" : "structural"
    edges.push({
      source: entity.parentId,
      target: entity.id,
      kind: edgeKind(base, entity.id),
    })
  }

  // rope links: first two machines under an operator with 2+ machines
  const machinesByOperator = new Map<GraphId, GraphId[]>()
  machineIds.forEach((id) => {
    const opId = byId.get(id)!.parentId!
    const list = machinesByOperator.get(opId) ?? []
    list.push(id)
    machinesByOperator.set(opId, list)
  })
  for (const list of machinesByOperator.values()) {
    if (list.length >= 2) {
      edges.push({
        source: list[0],
        target: list[1],
        kind: edgeKind("operational", list[1]),
      })
    }
  }

  for (const sub of subNodes) {
    edges.push({
      source: sub.parentId,
      target: sub.id,
      kind: edgeKind("filament", sub.id),
    })
  }

  const entities: GraphNode[] = [
    ...domainEntities,
    ...subNodes,
    ...environmentNodes,
  ]

  const dataset: DomainDataset = {
    version: seed,
    entities,
    domainEntities,
    subNodes,
    environmentNodes,
    historyLinks,
    edges,
    pointCount: subNodes.length,
    anomalyMachineIds,
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
  const byId = new Map<GraphId, GraphNode>(
    dataset.entities.map((e) => [e.id, e])
  )

  for (const sub of dataset.subNodes) {
    if (!byId.has(sub.parentId))
      violations.push(
        `sub-node "${sub.id}" has no resolvable parent "${sub.parentId}"`
      )
    if (!Number.isFinite(sub.ts))
      violations.push(`sub-node "${sub.id}" has a non-finite ts`)
  }

  for (const entity of dataset.domainEntities) {
    if (entity.tier === "country") {
      if (entity.parentId !== null)
        violations.push(`country "${entity.id}" must have parentId null`)
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
      const next = dataset.domainEntities.find(
        (e) => e.id === current!.parentId
      )
      if (!next) {
        violations.push(
          `entity "${entity.id}" resolves to a dangling parent "${current.parentId}"`
        )
        break
      }
      current = next
      hops++
      if (hops > 10) {
        violations.push(
          `entity "${entity.id}" did not resolve to a country within 10 hops`
        )
        break
      }
    }
  }

  if (
    dataset.pointCount <
      dataset.domainEntities.length * POINT_COUNT_PER_ENTITY_BAND[0] ||
    dataset.pointCount >
      dataset.domainEntities.length * POINT_COUNT_PER_ENTITY_BAND[1]
  ) {
    violations.push(
      `pointCount ${dataset.pointCount} is outside ` +
        `[${POINT_COUNT_PER_ENTITY_BAND[0]}, ${POINT_COUNT_PER_ENTITY_BAND[1]}] per entity ` +
        `for ${dataset.domainEntities.length} entities`
    )
  }

  if (dataset.anomalyMachineIds.length !== 9)
    violations.push(
      `expected 9 anomalous machines, got ${dataset.anomalyMachineIds.length}`
    )
  if (dataset.anomalySensorIds.length !== 3)
    violations.push(
      `expected 3 anomalous sensors, got ${dataset.anomalySensorIds.length}`
    )
  // The first machine is the worked example. Checked by position, not by the
  // literal id "machine-0" — that was the old locally-generated scheme, so
  // against warehouse ids (`machine_00001`) the guard could never fire.
  const workedExampleId = dataset.domainEntities.find(
    (e) => e.tier === "machine"
  )?.id
  if (workedExampleId && dataset.anomalyMachineIds.includes(workedExampleId))
    violations.push(
      `${workedExampleId} is the worked example and must never be anomalous`
    )

  // Spread requirements scale with what the warehouse actually holds: asking
  // for four distinct lines in a plant that has two is asking for a violation.
  const lineCount = dataset.domainEntities.filter(
    (e) => e.tier === "line"
  ).length
  const countryCount = dataset.domainEntities.filter(
    (e) => e.tier === "country"
  ).length
  const plantCount = dataset.domainEntities.filter(
    (e) => e.tier === "plant"
  ).length
  const minLines = Math.min(4, lineCount)
  const minCountries = Math.min(3, countryCount)

  const operators = new Set(
    dataset.anomalyMachineIds.map(
      (id) => byId.get(id) && (byId.get(id) as DomainEntity).parentId
    )
  )
  if (operators.size < minLines)
    violations.push(
      `anomalous machines span only ${operators.size} lines, need >= ${minLines}`
    )
  const countries = new Set(
    dataset.anomalyMachineIds.map(
      (id) => (byId.get(id) as DomainEntity).countryId
    )
  )
  if (countries.size < minCountries)
    violations.push(
      `anomalous machines span only ${countries.size} countries, need >= ${minCountries}`
    )

  for (const node of dataset.entities) {
    for (const [k, v] of Object.entries(node)) {
      if (typeof v === "number" && !Number.isFinite(v))
        violations.push(`entity "${node.id}" field "${k}" is non-finite`)
    }
  }

  // -- S8.4b invariants -----------------------------------------------------
  if (dataset.environmentNodes.length !== plantCount) {
    violations.push(
      `expected ${plantCount} environment nodes (one per plant), got ${dataset.environmentNodes.length}`
    )
  }
  const plantIdSet = new Set(
    dataset.domainEntities.filter((e) => e.tier === "plant").map((e) => e.id)
  )
  for (const env of dataset.environmentNodes) {
    if (!plantIdSet.has(env.plantId))
      violations.push(
        `environment node "${env.id}" points at a non-existent plant "${env.plantId}"`
      )
    const plant = byId.get(env.plantId) as DomainEntity | undefined
    if (plant && plant.countryId !== env.countryId) {
      violations.push(
        `environment node "${env.id}"'s countryId disagrees with its own plant's countryId`
      )
    }
  }

  const machineIdSet = new Set(
    dataset.domainEntities.filter((e) => e.tier === "machine").map((e) => e.id)
  )
  const entityById = new Map<GraphId, DomainEntity>(
    dataset.domainEntities.map((e) => [e.id, e])
  )
  /** machine -> line -> plant.
   *
   * Was a 4-hop walk through an `operator` rung that no longer exists, so it
   * returned null for every machine and the history-link invariant below never
   * fired once. Matches `currentPlantIdFor` in the builder above.
   */
  function ownPlantOf(machineId: GraphId): GraphId | null {
    const machine = entityById.get(machineId)
    const line = machine?.parentId
      ? entityById.get(machine.parentId)
      : undefined
    return line?.parentId ?? null
  }
  for (const link of dataset.historyLinks) {
    if (!machineIdSet.has(link.machineId))
      violations.push(
        `history link references a non-existent machine "${link.machineId}"`
      )
    if (!plantIdSet.has(link.plantId))
      violations.push(
        `history link references a non-existent plant "${link.plantId}"`
      )
    if (ownPlantOf(link.machineId) === link.plantId) {
      violations.push(
        `history link for "${link.machineId}" points at their OWN current plant "${link.plantId}" — history must be a PRIOR plant`
      )
    }
  }

  return violations
}
