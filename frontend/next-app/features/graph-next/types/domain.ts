// S8.3: the real entity + sub-node layer. Kept separate from types.ts (the
// stability layer's minimal contract) on purpose — `DomainEntity`/`SubNode`
// both satisfy `GraphEntity` (they have an `id`), and `DomainDataset`
// satisfies `GraphDataset` (`version` + `entities`), so nothing in
// layoutSafety.ts/offsets.ts/graphStore.ts needs to change to accept this
// richer shape. That was the whole point of writing those against the
// minimal contract in 8.2.

import type { GraphDataset, GraphEntity, GraphId } from './graph'

/**
 * The structural tiers, outermost first.
 *
 * There is no `operator`. Machines are installed on lines; the people who
 * operate them are related to them, not above them in the hierarchy — the
 * ontology says OPERATED_BY, not "contains". Drawing operators as a rung of
 * the ladder invented a level of structure the plant does not have.
 */
export type EntityTier = 'country' | 'plant' | 'line' | 'machine' | 'sensor'

export type EntityStatus = 'nominal' | 'anomaly'

export interface DomainEntity extends GraphEntity {
  id: GraphId
  tier: EntityTier
  label: string
  /** null only for country — the root of the structural chain. */
  parentId: GraphId | null
  /** Denormalised for O(1) lookup — every entity's ultimate country, itself included for countries. Used by the anomaly-spread invariant and later by STRATA/TERRAIN grouping. */
  countryId: GraphId
  status: EntityStatus
}

/**
 * The seven kinds S8.3 names: telemetry, events, maintenance, logs,
 * documents, alerts, historical. A sub-node's `kind` is what TYPE of record
 * it is; its `status` (below) is whether THIS specific record is currently
 * flagged — independent axes. A kind of 'alerts' always carries
 * status 'alert' (it IS an alert record); any other kind can also be
 * flagged 'alert' as a breaching reading.
 */
export type SubNodeKind = 'telemetry' | 'events' | 'maintenance' | 'logs' | 'documents' | 'alerts' | 'historical'

export type SubNodeStatus = 'nominal' | 'alert'

export interface SubNode extends GraphEntity {
  id: GraphId
  parentId: GraphId
  kind: SubNodeKind
  /** Epoch ms — deterministic, derived from a fixed anchor and a seeded offset, never Date.now(). */
  ts: number
  summary: string
  provenanceId: string
  status: SubNodeStatus
}

/**
 * S8.4b: ONE per plant, always live — the node that makes the graph feel
 * alive between interactions. Deliberately NOT a DomainEntity (no `tier`,
 * no country-hue colouring, ignores anomaly/status entirely in favour of
 * its own `breached` reading) and not a SubNode either (it never
 * collapses, never stops pulsing, and carries live-ticking conditions a
 * static historical record never would). `vibrationMmS` etc. are the dataset's
 * own SEEDED baseline; environmentStore.ts owns the live tick on top of
 * this baseline while NETWORK is mounted.
 */
export interface EnvironmentNode extends GraphEntity {
  id: GraphId
  kind: 'environment'
  plantId: GraphId
  countryId: GraphId
  vibrationMmS: number
  spindleTempC: number
  loadBandM: [number, number]
  oeePct: number
  cycleTimeS: number
  breached: boolean
}

/**
 * S8.4b: "a machine who has previously climbed in another plant draws a
 * link to that plant." Directional (machine -> prior plant, never the
 * reverse) and deliberately NOT modelled as a GraphEdge — history links
 * render on canvas, lined behind everything, with their own opacity rules
 * (12% rest / 100% on hover-or-selection of that machine) that don't fit
 * the shared structural/operational/filament/anomaly edge-appearance
 * system at all.
 */
export interface HistoryLink {
  machineId: GraphId
  plantId: GraphId
}

export type GraphNode = DomainEntity | SubNode | EnvironmentNode

export function isDomainEntity(node: GraphNode): node is DomainEntity {
  return 'tier' in node
}

export function isEnvironmentNode(node: GraphNode): node is EnvironmentNode {
  return 'kind' in node && (node as EnvironmentNode).kind === 'environment'
}

/**
 * Structural: the hierarchy chain down to line, plus machine -> sensor.
 * Operational: the FINAL hop from line down to
 * machine, plus machine <-> machine rope links — the day-to-day working
 * relationship, not paperwork hierarchy, so it takes the "healthy
 * operational flow" colour (S8.0) rather than plain structural white.
 * Filament: entity -> each of its own sub-nodes. Anomaly overrides any of
 * the three above when the edge's own child (target) is currently
 * anomalous/alert — computed once at generation time here, since nothing
 * in this dataset changes live yet.
 */
export type EdgeKind = 'structural' | 'filament' | 'operational' | 'anomaly'

export interface GraphEdge {
  source: GraphId
  target: GraphId
  kind: EdgeKind
}

export interface DomainDataset extends GraphDataset {
  version: number
  /** Every node — top-tier entities, sub-nodes AND environment nodes — this is what layout/offsets/the store actually iterate. */
  entities: GraphNode[]
  /** Just the 127 top-tier entities, for convenience. */
  domainEntities: DomainEntity[]
  /** Just the sub-nodes — the "terminal points" S8.0's reference image needs thousands of. */
  subNodes: SubNode[]
  /** S8.4b: one per plant (14) — always-live conditions, never part of domainEntities/subNodes. */
  environmentNodes: EnvironmentNode[]
  /** S8.4b: machine -> prior-plant links, ~60% of machines, 1-3 each. */
  historyLinks: HistoryLink[]
  edges: GraphEdge[]
  /** = subNodes.length, reported per S8.3's acceptance line. */
  pointCount: number
  anomalyMachineIds: GraphId[]
  anomalySensorIds: GraphId[]
}
