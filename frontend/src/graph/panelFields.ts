// 8.11: pure helpers behind the 380px detail panel — kept out of
// DetailPanel.tsx itself so the "what connects to what" / "what does this
// node's data actually rest on" logic is unit-testable without React.
//
// RULE (same as adapter.ts's own): every fact surfaced here is either read
// straight off a GraphNode/GraphEdge already built by adapter.ts, or is a
// genuine derived count/lookup over that real data (a descendant count, a
// provenance walk) — never a narrated or invented number.

import { resolveOrThrow } from '../ase/graph'
import type { Derivation, SourceId, TracedId, TracedValue } from '../ase/traced'
import type { PredictedOutcome } from '../ase/prediction'
import type { GraphEdge, GraphNode, GraphNodeType } from './adapter'

// -- PROPERTIES rows ---------------------------------------------------------
// The spec names an exact field list per entity type. Where the backend
// genuinely has no such field, the row still renders (an operations
// director should see the field exists and isn't tracked, not have it
// silently vanish) with an honest "not tracked"/"not available" value —
// never a fabricated number and never a silently-dropped row.

export interface PropertyRowSpec {
  key: string
  label: string
  kind: 'metric' | 'text'
  traced?: TracedValue<unknown>
  value?: string
  note?: string
}

function textRow(key: string, label: string, value: string, note?: string): PropertyRowSpec {
  return { key, label, kind: 'text', value, note }
}

function metricRow(key: string, label: string, traced: TracedValue<unknown>): PropertyRowSpec {
  return { key, label, kind: 'metric', traced }
}

export const READABLE_READINESS: Record<string, string> = {
  READY: 'Ready',
  WATCH: 'Watch',
  IMPAIRED: 'Impaired',
  REQUIRES_DESCENT: 'Requires descent',
}

/** The consumed `properties` keys, so `extraPropertyRows` can show everything real that isn't already curated here. */
export function curatedPropertyRowsWithConsumedKeys(
  node: GraphNode,
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[]
): { rows: PropertyRowSpec[]; consumedKeys: Set<string> } {
  const consumedKeys = new Set<string>()

  if (node.type === 'climber') {
    const partner = ropePartnerOf(node, nodes, edges)
    const rows: PropertyRowSpec[] = [
      textRow('serial', 'Serial', node.serial ?? 'Not on record'),
      textRow('role', 'Role', node.role ?? 'Not available', node.role === null ? 'Role is only tracked for climbers with an active prediction.' : undefined),
      textRow('team', 'Team', 'Not tracked', 'No team/crew assignment field exists in the backend.'),
      node.properties.currentAltitudeM
        ? metricRow('current_altitude', 'Current altitude', node.properties.currentAltitudeM)
        : textRow('current_altitude', 'Current altitude', 'Not available'),
      textRow('health_score', 'Health score', 'Not tracked', 'ASE tracks decision capacity (Prediction) and identity confidence separately — neither is a single "health score."'),
      textRow('readiness', 'Readiness', node.status ? READABLE_READINESS[node.status] : 'Unassessed'),
      textRow('last_contact', 'Last contact', node.lastContactMinutesAgo !== null ? `${node.lastContactMinutesAgo} min ago` : 'Not available'),
      textRow('rope_partner', 'Rope partner', partner ? partner.label : 'No rope partner on record'),
    ]
    consumedKeys.add('currentAltitudeM')
    return { rows, consumedKeys }
  }

  if (node.type === 'country') {
    const activeClimbers = countDescendantsByType(node.id, 'climber', nodes)
    const rows: PropertyRowSpec[] = [
      node.properties.name ? metricRow('name', 'Name', node.properties.name) : textRow('name', 'Name', node.label),
      textRow('code', 'Code', 'Not tracked', 'No ISO/country-code field exists in the backend.'),
      textRow('permit_registry', 'Permit registry', 'Not tracked', 'No permit registry is modelled in this dataset.'),
      textRow('base_camps', 'Base camps', 'Not tracked', 'No base-camp roster field exists per country.'),
      textRow('active_climbers', 'Active climbers', String(activeClimbers)),
      textRow('weather_feed', 'Weather feed', 'Not tracked per-country', 'Weather is tracked at the source level, not attached to a country record.'),
    ]
    consumedKeys.add('name')
    return { rows, consumedKeys }
  }

  if (node.type === 'source') {
    const health = node.sourceHealth
    const staleRow = node.properties.lastSyncAgeSec
      ? metricRow('staleness', 'Staleness', node.properties.lastSyncAgeSec)
      : textRow('staleness', 'Staleness', health ? `${health.lastSyncAgeSec}s since last sync` : 'Not available')
    const rows: PropertyRowSpec[] = [
      textRow('type', 'Type', node.sourceCategory ?? 'Not categorised'),
      textRow('status', 'Status', health ? health.state : 'Not tracked', health ? undefined : 'Exposure health is not tracked for this source.'),
      textRow('uptime', 'Uptime', health ? `${health.breakdown.uptimePct}%` : 'Not tracked'),
      staleRow,
      textRow('conclusions_dependent', 'Conclusions dependent', health ? String(health.factsDependent) : 'Not tracked'),
      textRow('backup', 'Backup', node.sourceBackup ? `${node.sourceBackup.backupSourceName} — switch cost ${node.sourceBackup.switchCostMinutes}m` : 'No backup source configured'),
    ]
    if (node.properties.lastSyncAgeSec) consumedKeys.add('lastSyncAgeSec')
    return { rows, consumedKeys }
  }

  // route / operator — not named in the spec's field list; show what's real.
  const climberCount = countDescendantsByType(node.id, 'climber', nodes)
  const rows: PropertyRowSpec[] = [
    node.properties.name ? metricRow('name', 'Name', node.properties.name) : textRow('name', 'Name', node.label),
    textRow('climbers_attached', 'Climbers attached', String(climberCount)),
  ]
  consumedKeys.add('name')
  return { rows, consumedKeys }
}

/** 8.13-ui: the redesign spec's "Aimpoints" coordinate list, mapped onto the real position facts a climber actually carries — never a fabricated MGRS grid (no such concept exists in this app). `currentAltitudeM` is deliberately NOT repeated here — it's already one of the 8 curated climber fields above; this is the rest of the position picture (camp, last known position, GPS fix age). Every other node type honestly has no position concept at all. */
export function positionRowsFor(node: GraphNode): PropertyRowSpec[] {
  if (node.type !== 'climber') {
    return [textRow('position', 'Position', 'Not tracked', 'No position field exists for this entity type.')]
  }
  return [
    node.properties.currentCamp ? metricRow('currentCamp', 'Current camp', node.properties.currentCamp) : textRow('currentCamp', 'Current camp', 'Not available'),
    node.properties.lastKnownPosition
      ? metricRow('lastKnownPosition', 'Last known position', node.properties.lastKnownPosition)
      : textRow('lastKnownPosition', 'Last known position', 'Not available'),
    node.properties.gpsFixAgeSec ? metricRow('gpsFixAgeSec', 'GPS fix age', node.properties.gpsFixAgeSec) : textRow('gpsFixAgeSec', 'GPS fix age', 'Not available'),
  ]
}

function humanizeKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase())
    .trim()
}

/** Every real property the node carries that curatedPropertyRowsWithConsumedKeys didn't already surface — the "+ Show all properties" expander's contents. */
export function extraPropertyRows(node: GraphNode, consumedKeys: ReadonlySet<string>): PropertyRowSpec[] {
  return Object.entries(node.properties)
    .filter(([key]) => !consumedKeys.has(key))
    .map(([key, traced]) => metricRow(key, humanizeKey(key), traced))
}

// -- CONNECTIONS(n) rows ------------------------------------------------------

export interface ConnectionRowSpec {
  key: string
  label: string
  value: string
  targetNodeId: string | null
}

export function connectionRowsFor(node: GraphNode, nodes: readonly GraphNode[], edges: readonly GraphEdge[]): ConnectionRowSpec[] {
  const nodeById = new Map(nodes.map((n) => [n.id, n]))
  const parent = node.parentId ? (nodeById.get(node.parentId) ?? null) : null
  const route = node.type === 'operator' || node.type === 'climber' ? nearestAncestorOfType(node, 'route', nodeById) : null
  const partner = node.type === 'climber' ? ropePartnerOf(node, nodes, edges) : null
  const sources = contributingSourceNodes(node, nodes)

  const rows: ConnectionRowSpec[] = [
    { key: 'parent', label: 'Parent', value: parent ? parent.label : 'None', targetNodeId: parent?.id ?? null },
    { key: 'route', label: 'Route', value: route ? route.label : 'None', targetNodeId: route?.id ?? null },
    { key: 'rope', label: 'Rope', value: partner ? partner.label : 'No rope partner on record', targetNodeId: partner?.id ?? null },
    { key: 'team', label: 'Team', value: 'Not tracked', targetNodeId: null },
    {
      key: 'predictions',
      label: 'Predictions active',
      value: node.type === 'climber' ? (node.drivers ? '1 active' : 'None') : 'Not applicable',
      targetNodeId: null,
    },
    {
      key: 'sources',
      label: 'Sources contributing',
      value: sources.length > 0 ? `${sources.length} source${sources.length === 1 ? '' : 's'}` : 'None traced',
      targetNodeId: sources.length === 1 ? sources[0].id : null,
    },
  ]
  return rows
}

/** How many of the CONNECTIONS(n) rows are real, navigable-or-informative facts — not a permanently-empty "Team" row. Used for the section's own "(n)" count. */
export function connectionCount(rows: readonly ConnectionRowSpec[]): number {
  return rows.filter((r) => r.value !== 'None' && r.value !== 'Not tracked' && r.value !== 'Not applicable' && r.value !== 'None traced' && r.value !== 'No rope partner on record').length
}

// -- LABELS pills -------------------------------------------------------------

export const ENTITY_TYPE_LABEL: Record<GraphNodeType, string> = {
  country: 'Country',
  route: 'Route',
  operator: 'Operator',
  climber: 'Climber',
  source: 'Source',
}

export interface LabelSpec {
  key: string
  text: string
  kind: 'entityType' | 'status' | 'risk' | 'source'
}

/** entity type (always), status (when scored), a risk flag (when the status is severe enough to warrant attention), and one flag per distinct category among this node's real contributing sources. Never invented — every pill traces back to a real field. */
export function labelsFor(node: GraphNode, nodes: readonly GraphNode[]): LabelSpec[] {
  const labels: LabelSpec[] = [{ key: 'type', text: ENTITY_TYPE_LABEL[node.type], kind: 'entityType' }]
  if (node.status) labels.push({ key: 'status', text: READABLE_READINESS[node.status], kind: 'status' })
  if (node.status === 'IMPAIRED' || node.status === 'REQUIRES_DESCENT') labels.push({ key: 'risk', text: 'Requires attention', kind: 'risk' })
  const categories = new Set(contributingSourceNodes(node, nodes).map((s) => s.sourceCategory).filter((c): c is string => c !== null))
  for (const category of categories) labels.push({ key: `source-${category}`, text: category, kind: 'source' })
  return labels
}

// -- provenance: which of the 8 provenance sources does a node's own data
// actually trace back to. Duplicates the small `inputsOf` derivation walk
// ase/exposure.ts already keeps local (folds.ts deliberately doesn't export
// it) rather than exporting a new cross-module dependency for one caller.

function inputsOf(d: Derivation): TracedId[] {
  switch (d.kind) {
    case 'observed':
    case 'asserted':
      return []
    case 'normalised':
    case 'bound':
      return [d.from]
    case 'merged':
    case 'derived':
    case 'inferred':
    case 'predicted':
      return d.from
  }
}

function sourceIdsOf(t: TracedValue<unknown>, seen: Set<TracedId>): Set<SourceId> {
  if (seen.has(t.id)) return new Set()
  seen.add(t.id)
  if (t.derivation.kind === 'observed') return new Set([t.derivation.source])
  const out = new Set<SourceId>()
  for (const id of inputsOf(t.derivation)) {
    for (const s of sourceIdsOf(resolveOrThrow(id), seen)) out.add(s)
  }
  return out
}

/** Every SourceId this node's own properties ultimately trace back to. Real provenance, not a narrated list. */
export function contributingSourceIds(node: GraphNode): SourceId[] {
  const seen = new Set<TracedId>()
  const all = new Set<SourceId>()
  for (const tv of Object.values(node.properties)) {
    for (const s of sourceIdsOf(tv, seen)) all.add(s)
  }
  return [...all]
}

/** The provenance-source GraphNodes (of the 8) this node's data traces back to, resolved against the id convention adapter.ts's source loop uses (`source:<SourceDef.id>`). */
export function contributingSourceNodes(node: GraphNode, nodes: readonly GraphNode[]): GraphNode[] {
  const ids = new Set(contributingSourceIds(node).map((id) => `source:${id}`))
  return nodes.filter((n) => ids.has(n.id))
}

// -- topology helpers -------------------------------------------------------

/** The other end of this climber's rope-partner cross edge, if any. Real edge lookup, not a guess. */
export function ropePartnerOf(node: GraphNode, nodes: readonly GraphNode[], edges: readonly GraphEdge[]): GraphNode | null {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  for (const e of edges) {
    if (e.kind !== 'cross') continue
    if (e.source === node.id) return byId.get(e.target) ?? null
    if (e.target === node.id) return byId.get(e.source) ?? null
  }
  return null
}

/** Walks the parent chain looking for the nearest ancestor of a given type — used for "Route" when the immediate parent is an operator, not a route. */
export function nearestAncestorOfType(node: GraphNode, type: GraphNodeType, nodeById: ReadonlyMap<string, GraphNode>): GraphNode | null {
  let currentId = node.parentId
  while (currentId) {
    const current = nodeById.get(currentId)
    if (!current) return null
    if (current.type === type) return current
    currentId = current.parentId
  }
  return null
}

/** Count of real descendant nodes of a given type below `nodeId` — a derived fact from the actual tree, never invented. */
export function countDescendantsByType(nodeId: string, type: GraphNodeType, nodes: readonly GraphNode[]): number {
  const childrenOf = new Map<string, GraphNode[]>()
  for (const n of nodes) {
    if (!n.parentId) continue
    const list = childrenOf.get(n.parentId) ?? []
    list.push(n)
    childrenOf.set(n.parentId, list)
  }
  let count = 0
  const stack = [nodeId]
  while (stack.length > 0) {
    const id = stack.pop()!
    for (const child of childrenOf.get(id) ?? []) {
      if (child.type === type) count += 1
      stack.push(child.id)
    }
  }
  return count
}

// -- the SUMMARY sentence ----------------------------------------------------
// Spec's exact climber shape: "<name> is currently at <location> with
// <readiness> readiness. <the single strongest driver, stated plainly>.
// Prediction: <outcome> within <window> at <confidence>." "Where a driver
// is unknown, the sentence says so. It does not omit and imply certainty."
//
// Only climbers carry the fields this exact template needs (location,
// readiness, drivers, a prediction) — the other four node types get an
// honestly-different sentence built from what they actually have, not a
// forced fit of the climber template onto data that doesn't exist for them.

const OUTCOME_LABEL: Record<PredictedOutcome, string> = {
  'requires-descent': 'requires descent',
  'requires-review': 'requires review',
  watch: 'watch',
  ready: 'ready',
}

const READABLE_STATUS: Record<string, string> = {
  READY: 'ready',
  WATCH: 'watch',
  IMPAIRED: 'impaired',
  REQUIRES_DESCENT: 'requires-descent',
}

function resolvedValue(tv: TracedValue<unknown> | undefined): unknown {
  return tv?.value
}

export function generateSummary(node: GraphNode, nodes: readonly GraphNode[]): string {
  if (node.type === 'climber') {
    const location = resolvedValue(node.properties.currentCamp)
    const locationText = typeof location === 'string' && location.length > 0 ? location : 'an unrecorded location'
    const readinessText = node.status ? READABLE_STATUS[node.status] : 'unassessed'

    const driverText = (() => {
      if (!node.drivers || node.drivers.length === 0) {
        return `The strongest driver behind ${node.label}'s status is unknown — no traceable driver is on record.`
      }
      const strongest = [...node.drivers].sort((a, b) => b.contributionPct - a.contributionPct)[0]
      return `${strongest.label} is the strongest driver, contributing +${strongest.contributionPct}%.`
    })()

    const predictionText =
      node.predictedOutcome && node.predictedWithinHours !== null
        ? (() => {
            const confidence = resolvedValue(node.properties.predictedLikelihoodPct)
            const confidenceText = typeof confidence === 'number' ? `${confidence}%` : 'an unknown confidence'
            return `Prediction: ${OUTCOME_LABEL[node.predictedOutcome]} within ${node.predictedWithinHours}h at ${confidenceText}.`
          })()
        : 'Prediction: none on record for this person.'

    return `${node.label} is currently at ${locationText} with ${readinessText} readiness. ${driverText} ${predictionText}`
  }

  if (node.type === 'country') {
    const climberCount = countDescendantsByType(node.id, 'climber', nodes)
    const routeCount = countDescendantsByType(node.id, 'route', nodes)
    return `${node.label} currently has ${routeCount} route${routeCount === 1 ? '' : 's'} and ${climberCount} climber${climberCount === 1 ? '' : 's'} on record.`
  }

  if (node.type === 'route' || node.type === 'operator') {
    const climberCount = countDescendantsByType(node.id, 'climber', nodes)
    return `${node.label} currently has ${climberCount} climber${climberCount === 1 ? '' : 's'} attached.`
  }

  // source
  if (node.sourceHealth) {
    return `${node.label} is currently ${node.sourceHealth.state}, feeding ${node.sourceHealth.factsDependent} dependent fact${node.sourceHealth.factsDependent === 1 ? '' : 's'}.`
  }
  return `${node.label} has no exposure health tracked for it.`
}
