// S9.9 (Map rebuild): a node-graph-editor view derived FROM the existing
// DetectionEngineState — this file never mutates or re-shapes the domain
// model List/Detections/Tuning already depend on (ase/detection.ts), it
// only adds a presentation-layer graph on top: nodes gain ports, rules
// become graph nodes, and wires connect a rule's watched value to the
// SPECIFIC port it watches — spec's own words, "that single detail turns
// the map from decoration into an explanation of what is being watched."
//
// PORT SIDE, a deliberate reading of an ambiguous spec: watched-value ports
// (Blood oxygen, Wind, ...) are drawn spec'd as an entity's OUTPUTS (right
// edge), but rule nodes sit at the canvas's far LEFT wiring rightward into
// exactly those ports. Taken literally, every rule wire would have to loop
// behind its target node to reach a right-edge port from a node stationed
// to its left — unreadable at 16 real wires. Watched-value ports render on
// the LEFT edge here instead, alongside the structural "in" ports, so a
// rule approaching from the left connects directly. Structural hierarchy
// ports (Route/Operator/Country membership one way, Parties-on-route/
// Roster the other) keep the spec'd left-in/right-out edges — only the
// rule-facing ports move, and only because two literal readings of this
// spec conflict and one of them has to give.

import type { Instant } from './traced'
import { confidence } from './folds'
import type {
  Detection,
  DetectionEngineState,
  DetectionRule,
  MapNode,
  Severity,
} from './detection'
import type { NodeStatus } from './nodeLanguage'

export type PortSide = 'left' | 'right'

export interface PortInstance {
  id: string
  label: string
  side: PortSide
  /** Set only when a real, currently-firing Detection backs this exact port — the honest case where "hovering a port shows its current value and its age" has something real to show. */
  live: { valueText: string; ageAt: Instant; confidencePct: number } | null
}

export type GraphNodeKind = 'country' | 'route' | 'operator' | 'climber' | 'sensor' | 'rule'

export interface GraphNode {
  id: string
  kind: GraphNodeKind
  label: string
  /** Header's right-aligned masked serial tail, climbers only. */
  serialTail: string | null
  parentId: string | null
  ports: PortInstance[]
  firingRuleIds: string[]
  status: NodeStatus
  severity: Severity | null // rule nodes only — the 3px top-edge colour
  climberId: string | null
  isSummary: boolean
  /** Real underlying node ids folded into this summary — expanding it reveals exactly these, never a fabricated count. */
  summaryMemberIds: string[]
}

export type WireKind = 'structure' | 'detection' | 'anomaly' | 'past'

export interface GraphWire {
  id: string
  fromId: string
  fromPortId: string | null
  toId: string
  toPortId: string | null
  kind: WireKind
  colorToken: 'structure' | 'anomaly' | Severity
}

export interface DetectionGraph {
  nodes: GraphNode[]
  wires: GraphWire[]
}

const ENTITY_PORTS: Record<Exclude<GraphNodeKind, 'rule'>, { in: string[]; out: string[]; watched: string[] }> = {
  country: { in: [], out: [], watched: [] },
  route: { in: ['Country'], out: ['Parties on route', 'Conditions'], watched: [] },
  operator: { in: ['Route'], out: ['Guides active', 'Roster'], watched: [] },
  climber: { in: ['Route', 'Operator', 'Rope partner'], out: [], watched: ['Blood oxygen', 'Heart rate', 'Camp', 'Ascent rate', 'Position'] },
  sensor: { in: ['Route'], out: [], watched: ['Wind', 'Temperature', 'Visibility', 'Battery', 'Last reading'] },
}

/** Which watched-value port label a rule's own condition reads — the wire target. Rules that watch a kind of value not modelled as a port (permits, system) wire nowhere; List/Detections already cover them fully. */
const RULE_WATCHED_PORT: Record<string, string> = {
  'rule-low-spo2': 'Blood oxygen',
  'rule-high-pulse': 'Heart rate',
  'rule-climbing-too-fast': 'Ascent rate',
  'rule-rope-partner-lost': 'Rope partner',
  'rule-pressure-mismatch': 'Camp',
  'rule-dangerous-wind': 'Wind',
  'rule-visibility-collapse': 'Visibility',
  'rule-low-battery': 'Battery',
  'rule-sensor-quiet': 'Last reading',
  'rule-not-enough-guides': 'Guides active',
}

function portsFor(kind: Exclude<GraphNodeKind, 'rule'>): PortInstance[] {
  const def = ENTITY_PORTS[kind]
  const ports: PortInstance[] = []
  for (const label of def.in) ports.push({ id: `in:${label}`, label, side: 'left', live: null })
  for (const label of def.watched) ports.push({ id: `watch:${label}`, label, side: 'left', live: null })
  for (const label of def.out) ports.push({ id: `out:${label}`, label, side: 'right', live: null })
  return ports
}

function formatDetectionValue(rule: DetectionRule, value: number): string {
  const rounded = Math.round(value * 10) / 10
  return rule.thresholdUnit === '%' ? `${rounded}%` : `${rounded} ${rule.thresholdUnit}`
}

/** ase/detection.ts's tree tier is `'regionRoute'` (it renders one card for a route inside its region) — this graph's own vocabulary just calls that tier `'route'`. */
function tierToKind(tier: MapNode['tier']): Exclude<GraphNodeKind, 'rule'> {
  return tier === 'regionRoute' ? 'route' : tier
}

/** Builds the port-graph for the Map tab from the same engine state List/Detections/Tuning read — nothing here is a second dataset, only a second SHAPE drawn over the first. */
export function buildDetectionGraph(engine: DetectionEngineState): DetectionGraph {
  const detectionsByNodeId = new Map<string, Detection[]>()
  for (const d of engine.detections) {
    if (d.suppressed || d.subject.kind === 'system') continue
    const list = detectionsByNodeId.get(d.subject.nodeId) ?? []
    list.push(d)
    detectionsByNodeId.set(d.subject.nodeId, list)
  }

  const nodes: GraphNode[] = engine.mapNodes.map((n) => {
    const kind = tierToKind(n.tier)
    const ports = portsFor(kind)
    const firing = detectionsByNodeId.get(n.id) ?? []
    for (const d of firing) {
      const rule = engine.rules.find((r) => r.id === d.ruleId)
      const portLabel = rule ? RULE_WATCHED_PORT[rule.id] : undefined
      if (!rule || !portLabel) continue
      const port = ports.find((p) => p.label === portLabel)
      if (!port) continue
      port.live = { valueText: formatDetectionValue(rule, d.valueTraced.value), ageAt: d.detectedAt, confidencePct: Math.round(confidence(d.valueTraced) * 100) }
    }
    return {
      id: n.id,
      kind,
      label: n.label,
      serialTail: n.serial ? n.serial.replace(/\D/g, '').slice(-4) : null,
      parentId: n.parentId,
      ports,
      firingRuleIds: n.firingRuleIds,
      status: n.status,
      severity: null,
      climberId: n.climberId ?? null,
      isSummary: false,
      summaryMemberIds: [],
    }
  })

  // -- rule nodes, far-left column, one per rule that has a real port to watch --
  const ruleWires: GraphWire[] = []
  const ruleNodes: GraphNode[] = []
  for (const rule of engine.rules) {
    const watchedLabel = RULE_WATCHED_PORT[rule.id]
    const firingDetections = engine.detections.filter((d) => d.ruleId === rule.id && !d.suppressed)
    ruleNodes.push({
      id: `rule:${rule.id}`,
      kind: 'rule',
      label: rule.label,
      serialTail: null,
      parentId: null,
      ports: [{ id: 'out:Firing on', label: 'Firing on', side: 'right', live: null }],
      firingRuleIds: [],
      status: firingDetections.length > 0 ? 'anomaly' : 'nominal',
      severity: rule.severity,
      climberId: null,
      isSummary: false,
      summaryMemberIds: [],
    })
    if (!watchedLabel) continue
    for (const d of firingDetections) {
      const subject = d.subject
      if (subject.kind === 'system') continue
      const targetNode = nodes.find((n) => n.id === subject.nodeId)
      const targetPort = targetNode?.ports.find((p) => p.label === watchedLabel)
      if (!targetNode || !targetPort) continue
      ruleWires.push({
        id: `wire:${rule.id}:${d.id}`,
        fromId: `rule:${rule.id}`,
        fromPortId: 'out:Firing on',
        toId: targetNode.id,
        toPortId: targetPort.id,
        kind: targetNode.status === 'anomaly' ? 'anomaly' : 'detection',
        colorToken: targetNode.status === 'anomaly' ? 'anomaly' : rule.severity,
      })
    }
  }

  // -- structural wires: country->route->operator->climber, route->sensor --
  const structureWires: GraphWire[] = []
  for (const n of nodes) {
    if (!n.parentId) continue
    const parent = nodes.find((p) => p.id === n.parentId)
    if (!parent) continue
    structureWires.push({
      id: `struct:${parent.id}:${n.id}`,
      fromId: parent.id,
      fromPortId: null,
      toId: n.id,
      toPortId: null,
      kind: n.status !== 'nominal' ? 'anomaly' : 'structure',
      colorToken: n.status !== 'nominal' ? 'anomaly' : 'structure',
    })
  }

  return { nodes: [...ruleNodes, ...nodes], wires: [...structureWires, ...ruleWires] }
}

const COLLAPSIBLE_KINDS = new Set<GraphNodeKind>(['operator', 'climber'])

/**
 * Folds every non-anomalous node in `collapsedKinds` into one summary node
 * per parent — "Khumbu Vertical · 4 climbers · 1 firing." Anomalous nodes
 * are NEVER folded in, regardless of collapse state (spec's own line:
 * "trouble is never hidden inside a summary") — they keep rendering as
 * individual nodes, wired normally, right alongside the summary that
 * covers their nominal siblings. `manuallyExpandedIds` lets a click expand
 * one specific summary without turning off collapsing everywhere.
 */
export function applyCollapse(graph: DetectionGraph, collapsedKinds: Set<GraphNodeKind>, manuallyExpandedIds: Set<string>): DetectionGraph {
  const foldTargetOf = new Map<string, string>() // real node id -> summary node id it was folded into
  const summaries = new Map<string, GraphNode>() // summary node id -> the summary node

  for (const n of graph.nodes) {
    if (!COLLAPSIBLE_KINDS.has(n.kind) || !collapsedKinds.has(n.kind) || n.status === 'anomaly') continue
    if (n.parentId && manuallyExpandedIds.has(n.parentId)) continue
    const summaryId = `summary:${n.parentId ?? 'root'}:${n.kind}`
    foldTargetOf.set(n.id, summaryId)
    const existing = summaries.get(summaryId)
    if (existing) {
      existing.summaryMemberIds.push(n.id)
    } else {
      const parent = graph.nodes.find((p) => p.id === n.parentId)
      summaries.set(summaryId, {
        id: summaryId,
        kind: n.kind,
        label: `${parent?.label ?? ''} · ${n.kind}s`,
        serialTail: null,
        parentId: n.parentId,
        ports: [],
        firingRuleIds: [],
        status: 'nominal',
        severity: null,
        climberId: null,
        isSummary: true,
        summaryMemberIds: [n.id],
      })
    }
  }

  for (const summary of summaries.values()) {
    summary.label = `${graph.nodes.find((p) => p.id === summary.parentId)?.label ?? ''} · ${summary.summaryMemberIds.length} ${summary.kind}${summary.summaryMemberIds.length === 1 ? '' : 's'}`
  }

  const keptNodes = graph.nodes.filter((n) => !foldTargetOf.has(n.id))
  const nodes = [...keptNodes, ...summaries.values()]

  function redirect(id: string): string {
    return foldTargetOf.get(id) ?? id
  }
  const seenWireIds = new Set<string>()
  const wires: GraphWire[] = []
  for (const w of graph.wires) {
    const fromId = redirect(w.fromId)
    const toId = redirect(w.toId)
    if (fromId === toId) continue // both ends folded into the same summary — nothing to show
    const key = `${fromId}->${toId}->${w.kind}`
    if (seenWireIds.has(key)) continue // several real wires collapsing onto the same summary edge
    seenWireIds.add(key)
    wires.push({ ...w, fromId, toId, fromPortId: foldTargetOf.has(w.fromId) ? null : w.fromPortId, toPortId: foldTargetOf.has(w.toId) ? null : w.toPortId })
  }

  return { nodes, wires }
}

/** Ancestors of `nodeId`, nearest first, walking `parentId` — the dependency cone a hover dims everything outside of. */
export function ancestorsOf(graph: DetectionGraph, nodeId: string): string[] {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]))
  const result: string[] = []
  let current = byId.get(nodeId)
  while (current?.parentId) {
    result.push(current.parentId)
    current = byId.get(current.parentId)
  }
  return result
}

/** `nodeId` plus everything within `hops` steps along structural OR wire edges — the FOCUS view's neighbourhood. */
export function neighborhood(graph: DetectionGraph, nodeId: string, hops: number): Set<string> {
  const adjacency = new Map<string, Set<string>>()
  function link(a: string, b: string) {
    if (!adjacency.has(a)) adjacency.set(a, new Set())
    if (!adjacency.has(b)) adjacency.set(b, new Set())
    adjacency.get(a)!.add(b)
    adjacency.get(b)!.add(a)
  }
  for (const w of graph.wires) link(w.fromId, w.toId)
  for (const n of graph.nodes) if (n.parentId) link(n.parentId, n.id)

  let frontier = new Set([nodeId])
  const visited = new Set([nodeId])
  for (let hop = 0; hop < hops; hop++) {
    const next = new Set<string>()
    for (const id of frontier) {
      for (const neighbor of adjacency.get(id) ?? []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor)
          next.add(neighbor)
        }
      }
    }
    frontier = next
  }
  return visited
}
