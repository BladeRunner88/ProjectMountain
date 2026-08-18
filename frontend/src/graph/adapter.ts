// 8.4: THE ADAPTER — the one place the graph reads the existing backend
// (ase/) dataset and reshapes it into GraphNode/GraphEdge. Nothing in
// ase/ is modified; nothing here calls buildDataset() itself (that
// clears the module-level TracedValue registry — see ase/store.tsx's own
// comment — so only ase/store.tsx's useDataset() may build/hold it; this
// module is a pure function of whatever Dataset it's handed).
//
// RULE: every entry in a node's `properties` is a REAL TracedValue read
// straight off the dataset — never authored here, never a raw literal.
// Where the backend genuinely has nothing to offer, the field is left out
// or set null; it is never invented. See the accompanying report (adapter
// block's own write-up) for the full list of gaps this surfaces.
//
// STATUS: derived ONLY from ase/prediction.ts's decisionBandForCapacity —
// the one existing readiness computation — applied to the one real input
// it takes (PersonPrediction.cognitive.decisionCapacity). That number only
// exists for the 9 climbers who have a PersonPrediction at all (see
// prediction.ts's own `selectedIds = [...].slice(0, 9)`), and for no other
// node kind. Every other node's status is null. This is NOT the same
// vocabulary as the detection map's own NodeStatus ('nominal'|'watch'|
// 'anomaly') — mapping one onto the other would be an invented
// equivalence the backend never asserts, so it isn't done.

import { latest } from '../ase/graph'
import type { BackupSourceInfo, SourceHealth } from '../ase/exposure'
import { decisionBandForCapacity, type Driver, type PredictedOutcome, type TimelinePoint } from '../ase/prediction'
import type { ClimberFact, Dataset } from '../ase/dataset'
import type { TracedValue } from '../ase/traced'
import type { MapNode } from '../ase/detection'
import type { ThingRecord } from '../ase/ontology'

export type GraphNodeType = 'country' | 'route' | 'operator' | 'climber' | 'source'
export type GraphNodeTier = 'root' | 'parent' | 'child' | 'leaf'
export type GraphNodeStatus = 'READY' | 'WATCH' | 'IMPAIRED' | 'REQUIRES_DESCENT'

export interface GraphNode {
  id: string
  type: GraphNodeType
  tier: GraphNodeTier
  label: string
  parentId: string | null
  status: GraphNodeStatus | null
  properties: Record<string, TracedValue<unknown>>
  serial: string | null
  createdAt: string
  // 8.11: real backend data the panel needs that ISN'T itself a single
  // TracedValue (a driver list, a role string, a source's health rollup) —
  // same treatment `status` already got in 8.4: a plain, always-present,
  // nullable top-level field rather than forcing it into `properties`
  // (which promises every entry is Metric-renderable) or inventing a
  // fake TracedValue wrapper around something that was never traced as
  // its own fact.
  /** Only the 9 climbers with a PersonPrediction — null for everyone/everything else. */
  drivers: Driver[] | null
  /** PersonPrediction.role — same 9-of-50 gate as `drivers`. */
  role: string | null
  /** PersonPrediction.human.lastContactMinutesAgo — same 9-of-50 gate; 0 is a real "no rope partner" value, not missing data. */
  lastContactMinutesAgo: number | null
  /** PersonPrediction.predicted — same 9-of-50 gate. The panel's SUMMARY sentence needs the outcome, not just its drivers. */
  predictedOutcome: PredictedOutcome | null
  /** PersonPrediction.withinHours — same 9-of-50 gate. */
  predictedWithinHours: number | null
  /** 8.13-ui: PersonPrediction.timeline — same 9-of-50 gate. The bottom timeline's real "decision capacity" swimlane needs the actual series, not just the derived driver list. */
  timeline: TimelinePoint[] | null
  /** SourceDef.category — the 8 provenance sources only. */
  sourceCategory: string | null
  /** dataset.exposure.sourceHealth — only 6 of the 8 sources are exposure-tracked (operator-rosters, medical-logs are not). */
  sourceHealth: SourceHealth | null
  /** dataset.exposure.simulations[].backup — only sources with a defined domain pair have one; null is a real "no backup exists" fact. */
  sourceBackup: BackupSourceInfo | null
}

export type GraphEdgeKind = 'parent' | 'sibling' | 'cross'

export interface GraphEdge {
  id: string
  source: string
  target: string
  kind: GraphEdgeKind
  label: string | null
}

export interface GraphView {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

/** decisionBandForCapacity's own vocabulary uses a space ("REQUIRES DESCENT"); the contract given for GraphNode.status uses an underscore. Purely a string-formatting boundary — not a data change. */
const READINESS_BAND_TO_STATUS: Record<ReturnType<typeof decisionBandForCapacity>, GraphNodeStatus> = {
  READY: 'READY',
  WATCH: 'WATCH',
  IMPAIRED: 'IMPAIRED',
  'REQUIRES DESCENT': 'REQUIRES_DESCENT',
}

function latestOf<T>(tv: TracedValue<T>): TracedValue<T> {
  return latest(tv as TracedValue<unknown>) as TracedValue<T>
}

/** country/route/operator/sensor(source) nodes: the ONLY real per-instance TracedValue the backend carries for them is their own ontology "name" record — never anything richer. */
function buildReferenceNode(mapNode: MapNode, type: GraphNodeType, tier: GraphNodeTier, record: ThingRecord | undefined, fallbackCreatedAt: string): GraphNode {
  const nameTv = record ? latestOf(record.traced) : null
  return {
    id: mapNode.id,
    type,
    tier,
    label: mapNode.label,
    parentId: mapNode.parentId,
    status: null,
    properties: nameTv ? { name: nameTv } : {},
    serial: null,
    createdAt: nameTv ? nameTv.recordedAt : fallbackCreatedAt,
    drivers: null,
    role: null,
    lastContactMinutesAgo: null,
    predictedOutcome: null,
    predictedWithinHours: null,
    timeline: null,
    sourceCategory: null,
    sourceHealth: null,
    sourceBackup: null,
  }
}

function buildClimberNode(mapNode: MapNode, dataset: Dataset, climberById: ReadonlyMap<string, ClimberFact>, fallbackCreatedAt: string): GraphNode {
  const climberId = mapNode.climberId ?? ''
  const record = dataset.identityRecords.get(climberId)
  const card = dataset.identityCards.get(climberId)
  const prediction = dataset.predictions.predictions.get(climberId)
  const climberFact = climberById.get(climberId)

  const properties: Record<string, TracedValue<unknown>> = {}
  if (climberFact) properties.identityStatus = latestOf(climberFact.status)
  if (record) {
    properties.name = latestOf(record.who.fullLegalName)
    properties.currentCamp = latestOf(record.responder.currentCamp)
    properties.lastKnownPosition = latestOf(record.responder.lastKnownPosition)
    properties.operatorName = latestOf(record.contacts.operatorName)
    properties.priorExpeditions = latestOf(record.derived.priorExpeditions)
  }
  if (card) {
    properties.routeName = latestOf(card.routeName)
    // Permit-registry-derived, one hop from record.who.fullLegalName —
    // this is the property the perturbation test moves.
    properties.identityConfidencePct = latestOf(card.confidencePct)
    // 8.11: real, all-50-climbers TracedValues that weren't read before —
    // not new data, just newly wired in for the panel's PROPERTIES section.
    properties.currentAltitudeM = latestOf(card.footer.altitudeM)
    properties.gpsFixAgeSec = latestOf(card.footer.fixAgeSec)
  }
  // Only 9 of 50 climbers have this — absent for the other 41, not zero.
  if (prediction) properties.predictedLikelihoodPct = latestOf(prediction.likelihoodTraced)

  const status = prediction ? READINESS_BAND_TO_STATUS[decisionBandForCapacity(prediction.cognitive.decisionCapacity)] : null

  return {
    id: mapNode.id,
    type: 'climber',
    tier: 'child',
    label: mapNode.label,
    parentId: mapNode.parentId,
    status,
    properties,
    serial: mapNode.serial ?? null,
    createdAt: record ? latestOf(record.serial).recordedAt : fallbackCreatedAt,
    // 8.11: drivers/role/lastContactMinutesAgo all live on PersonPrediction
    // — the same 9-of-50 gate `status`/`predictedLikelihoodPct` already
    // disclose, not a new gap.
    drivers: prediction ? prediction.drivers : null,
    role: prediction ? prediction.role : null,
    lastContactMinutesAgo: prediction ? prediction.human.lastContactMinutesAgo : null,
    predictedOutcome: prediction ? prediction.predicted : null,
    predictedWithinHours: prediction ? prediction.withinHours : null,
    timeline: prediction ? prediction.timeline : null,
    sourceCategory: null,
    sourceHealth: null,
    sourceBackup: null,
  }
}

export function buildGraphView(dataset: Dataset): GraphView {
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  const fallbackCreatedAt: string = dataset.headline.entitiesTracked.recordedAt

  // ontology.records correlates to detectionEngine.mapNodes by the SAME
  // array-index build order both use in dataset.ts/ontology.ts (both
  // iterate REGIONS/ROUTE_NAMES/operatorNames.flat() in lockstep) — the
  // only per-instance name TracedValue the backend has for these kinds.
  // Country correlates by label (both sides use the bare country string
  // directly, so an exact match is reliable without depending on shared
  // iteration order).
  const countryRecordByLabel = new Map(dataset.ontology.records.filter((r) => r.kind === 'country').map((r) => [r.label, r]))
  const routeRecordsInOrder = dataset.ontology.records.filter((r) => r.kind === 'route')
  const operatorRecordsInOrder = dataset.ontology.records.filter((r) => r.kind === 'operator')
  const sensorRecordsInOrder = dataset.ontology.records.filter((r) => r.kind === 'sensor')
  let routeIdx = 0
  let operatorIdx = 0
  let sensorIdx = 0

  const climberById = new Map(dataset.climbers.map((c) => [c.id, c]))

  for (const mapNode of dataset.detectionEngine.mapNodes) {
    switch (mapNode.tier) {
      case 'country':
        nodes.push(buildReferenceNode(mapNode, 'country', 'root', countryRecordByLabel.get(mapNode.label), fallbackCreatedAt))
        break
      case 'regionRoute':
        nodes.push(buildReferenceNode(mapNode, 'route', 'parent', routeRecordsInOrder[routeIdx++], fallbackCreatedAt))
        break
      case 'operator':
        nodes.push(buildReferenceNode(mapNode, 'operator', 'parent', operatorRecordsInOrder[operatorIdx++], fallbackCreatedAt))
        break
      case 'sensor':
        nodes.push(buildReferenceNode(mapNode, 'source', 'leaf', sensorRecordsInOrder[sensorIdx++], fallbackCreatedAt))
        break
      case 'climber':
        nodes.push(buildClimberNode(mapNode, dataset, climberById, fallbackCreatedAt))
        break
    }
  }

  // The 8 provenance sources (Wearable oximeter, GPS tracker, ...) are
  // cross-cutting, not geographically attached to any one route — parentId
  // null here is honest, not a gap: they genuinely have no single parent
  // in the country -> route -> operator -> climber chain. SourceDef.name
  // is a plain string (not a TracedValue), so it can only be the node's
  // label, never a `properties.name` entry.
  for (const source of dataset.sources) {
    // 8.11: category/health/backup are all real, just not all-8 — health
    // and backup specifically only exist for sources dataset.exposure.ts
    // tracks (6 of 8 for health; 2 of 8 have a defined backup domain
    // pair). null here means "the backend has no such fact for this
    // source," not a placeholder.
    const health = dataset.exposure.sourceHealth.find((h) => h.sourceId === source.def.id) ?? null
    const backup = dataset.exposure.simulations.find((sim) => sim.sourceId === source.def.id)?.backup ?? null
    nodes.push({
      id: `source:${source.def.id}`,
      type: 'source',
      tier: 'leaf',
      label: source.def.name,
      parentId: null,
      status: null,
      properties: {
        reliabilityPct: latestOf(source.reliabilityPct),
        lastSyncAgeSec: latestOf(source.lastSyncAgeSec),
      },
      serial: null,
      createdAt: latestOf(source.reliabilityPct).recordedAt,
      drivers: null,
      role: null,
      lastContactMinutesAgo: null,
      predictedOutcome: null,
      predictedWithinHours: null,
      timeline: null,
      sourceCategory: source.def.category,
      sourceHealth: health,
      sourceBackup: backup,
    })
  }

  // parent edges: detectionEngine.mapEdges already encodes exactly
  // parent -> child (buildMapTree: `{ from: n.parentId!, to: n.id }`).
  for (const e of dataset.detectionEngine.mapEdges) {
    edges.push({ id: `parent:${e.from}->${e.to}`, source: e.from, target: e.to, kind: 'parent', label: null })
  }

  // cross edges: rope partners, read off IdentityCard.associates — a real,
  // bidirectional relationship stored on both sides in the backend by
  // design (ase/dataset.ts's own comment: "so 'stored redundantly on both
  // sides' is inspectable"), deduplicated here to one edge per pair.
  const seenRopePairs = new Set<string>()
  for (const [climberId, card] of dataset.identityCards) {
    for (const assoc of card.associates) {
      if (assoc.kind !== 'rope_partner' || !assoc.climberId) continue
      const [a, b] = [climberId, assoc.climberId].sort()
      const key = `${a}|${b}`
      if (seenRopePairs.has(key)) continue
      seenRopePairs.add(key)
      edges.push({ id: `cross:${a}-${b}`, source: `climber:${a}`, target: `climber:${b}`, kind: 'cross', label: 'rope partner' })
    }
  }

  // "sibling" is NOT emitted — deliberately. See the block's own report:
  // the only backend candidate (PersonPrediction.cluster's 'route mate'
  // relation) exists for just the 9 climbers with a prediction, and even
  // there ClusterMember.serial is hardcoded to '' in ase/prediction.ts —
  // a real, already-broken field, not something this adapter can complete
  // without fabricating data the backend doesn't actually have.

  return { nodes, edges }
}
