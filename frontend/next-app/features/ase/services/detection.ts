// S9.9: the Anomaly Detection tab, built as a working rule engine. NO CODE
// ANYWHERE — a DetectionRule's condition is a plain sentence a coordinator
// can read aloud; the threshold that sentence implies is a separate,
// tunable number (`thresholdValue`/`thresholdUnit`/`thresholdDirection`)
// that Tuning drags, never a predicate string.
//
// A rule's own accuracy ("HOW OFTEN RIGHT") is a system input alongside the
// rule, exactly like S9.7's `ContextRule.confidence` — built with
// `ruleAuthority()`, not folded from any one TracedValue, because it
// describes the RULE's own track record, not a fact the rule produced.
// Every ACTIVE detection's own VALUE is a real, folded TracedValue; only
// the wider tuning population behind the trade-off curve (46 climbers who
// are currently fine, alongside the 4 who aren't) is plain numbers — an
// aggregate background distribution, not individually displayed facts, the
// same distinction `perSourceCoverage` already draws in ase/contextEngine.ts.

import type { Confidence, Instant, TracedValue } from './traced'
import { ruleAuthority } from './folds'
import type { NodeStatus } from './nodeLanguage'

export type Severity = 'critical' | 'high' | 'medium' | 'low'
export type WatchTarget = 'climbers' | 'sensors' | 'operators' | 'permits' | 'system'
export type ThresholdDirection = 'below' | 'above'
export type Trend = 'rising' | 'falling' | 'steady'

export interface DetectionRule {
  id: string
  label: string
  watches: WatchTarget
  conditionSentence: string
  window: string
  windowMinutes: number | null // null for 'live'/'daily' — not a fixed dwell window
  severity: Severity
  accuracy: Confidence
  thresholdValue: number
  thresholdUnit: string
  thresholdDirection: ThresholdDirection
  authority: string
  patternName: string | null // a learned pattern's own name, when one contributed — Tuning/reason panel both read this
  patternLeadMinutes: number | null
}

// Every non-system kind carries a `nodeId` matching a real MapNode.id one
// for one — the ONE identifier scheme both `subjectKey()` and the map tree
// read, so a detection and the node it fires on can never silently
// disagree about which entity they mean (an earlier draft of this file
// keyed subjects by display label and nodes by index — a sensor named the
// same as its own id-looking label would have matched by accident and
// everything else would have silently failed to propagate).
export type DetectionSubject =
  | { kind: 'climber'; nodeId: string; climberId: string; name: string; serial: string }
  | { kind: 'route'; nodeId: string; label: string }
  | { kind: 'sensor'; nodeId: string; label: string; routeLabel: string }
  | { kind: 'operator'; nodeId: string; label: string }
  | { kind: 'system'; label: string }

export interface Detection {
  id: string
  ruleId: string
  subject: DetectionSubject
  valueTraced: TracedValue<number>
  detectedAt: Instant
  series: { minutesAgo: number; value: number }[] // last 40 readings, oldest first
  trend: Trend
  suppressed: boolean
}

export interface ResolvedDetection {
  id: string
  ruleId: string
  subject: DetectionSubject
  clearedAt: Instant
  ranForMinutes: number
  clearedBy: string
  flapping: boolean // fired and cleared on the same subject more than once in the last hour
}

export interface Suppression {
  id: string
  ruleId: string
  subject: DetectionSubject
  reason: string
  setBy: string
  setAt: Instant
  expiresAt: Instant
}

export interface MapNodeInput {
  id: string
  tier: 'country' | 'regionRoute' | 'operator' | 'climber' | 'sensor'
  label: string
  parentId: string | null
  climberId?: string
  serial?: string
}

export interface MapNode extends MapNodeInput {
  firingRuleIds: string[]
  status: NodeStatus
}

export interface MapEdge {
  from: string
  to: string
  status: NodeStatus
}

export interface DetectionEngineState {
  rules: DetectionRule[]
  detections: Detection[]
  resolved: ResolvedDetection[]
  suppressions: Suppression[]
  mapNodes: MapNode[]
  mapEdges: MapEdge[]
  /** Every entity a rule watches, not just the ones currently firing — Tuning's real background distribution, keyed by rule id. Built once in dataset.ts (the only place that knows what a "climber" is) and passed straight through. */
  tuningPopulations: Map<string, TuningPopulationMember[]>
}

// -- rules ----------------------------------------------------------------
// Two rules genuinely sit below 60% accuracy (Climbing too fast, Pressure
// mismatch) — real `ruleAuthority()` figures, not the spec's own
// illustrative 61%/55% copied verbatim, since 61% wouldn't actually clear
// the "below 60%" bar it's there to demonstrate.

export function builtInRules(): DetectionRule[] {
  return [
    {
      id: 'rule-low-spo2',
      label: 'Low blood oxygen',
      watches: 'climbers',
      conditionSentence: 'below 80%',
      window: '6 min',
      windowMinutes: 6,
      severity: 'critical',
      accuracy: ruleAuthority(0.92),
      thresholdValue: 80,
      thresholdUnit: '%',
      thresholdDirection: 'below',
      authority: 'Clinical reference (Lake Louise acclimatisation guidance)',
      patternName: null,
      patternLeadMinutes: null,
    },
    {
      id: 'rule-dangerous-wind',
      label: 'Dangerous wind',
      watches: 'sensors',
      conditionSentence: 'above 70 kph',
      window: 'live',
      windowMinutes: null,
      severity: 'critical',
      accuracy: ruleAuthority(0.95),
      thresholdValue: 70,
      thresholdUnit: 'kph',
      thresholdDirection: 'above',
      authority: 'Operator SOP v3 — exposed-ridge limit',
      patternName: 'wind-precedes-oxygen-decline',
      patternLeadMinutes: 18,
    },
    {
      id: 'rule-high-pulse',
      label: 'Sustained high pulse',
      watches: 'climbers',
      conditionSentence: 'above 120 bpm',
      window: '10 min',
      windowMinutes: 10,
      severity: 'high',
      accuracy: ruleAuthority(0.88),
      thresholdValue: 120,
      thresholdUnit: 'bpm',
      thresholdDirection: 'above',
      authority: 'Field correction — expedition physician, 2026-01',
      patternName: null,
      patternLeadMinutes: null,
    },
    {
      id: 'rule-climbing-too-fast',
      label: 'Climbing too fast',
      watches: 'climbers',
      conditionSentence: 'faster than the body can adjust',
      window: '24 h',
      windowMinutes: 1440,
      severity: 'high',
      accuracy: ruleAuthority(0.58),
      thresholdValue: 500,
      thresholdUnit: 'm/day',
      thresholdDirection: 'above',
      authority: 'Wilderness Medical Society ascent-rate guidance',
      patternName: null,
      patternLeadMinutes: null,
    },
    {
      id: 'rule-not-enough-guides',
      label: 'Not enough guides',
      watches: 'operators',
      conditionSentence: 'fewer guides than parties',
      window: '1 h',
      windowMinutes: 60,
      severity: 'medium',
      accuracy: ruleAuthority(0.84),
      thresholdValue: 1,
      thresholdUnit: 'guides per party',
      thresholdDirection: 'below',
      authority: 'Operator SOP v3',
      patternName: null,
      patternLeadMinutes: null,
    },
    {
      id: 'rule-sensor-quiet',
      label: 'Sensor gone quiet',
      watches: 'sensors',
      conditionSentence: 'no reading received',
      window: '15 min',
      windowMinutes: 15,
      severity: 'high',
      accuracy: ruleAuthority(0.99),
      thresholdValue: 15,
      thresholdUnit: 'min silent',
      thresholdDirection: 'above',
      authority: 'Operator SOP v3',
      patternName: null,
      patternLeadMinutes: null,
    },
    {
      id: 'rule-visibility-collapse',
      label: 'Visibility collapse',
      watches: 'sensors',
      conditionSentence: 'below 200 m',
      window: 'live',
      windowMinutes: null,
      severity: 'high',
      accuracy: ruleAuthority(0.9),
      thresholdValue: 200,
      thresholdUnit: 'm',
      thresholdDirection: 'below',
      authority: 'Weather feed calibration',
      patternName: null,
      patternLeadMinutes: null,
    },
    {
      id: 'rule-permit-expired',
      label: 'Permit expired',
      watches: 'permits',
      conditionSentence: 'end date has passed',
      window: 'daily',
      windowMinutes: null,
      severity: 'medium',
      accuracy: ruleAuthority(1.0),
      thresholdValue: 0,
      thresholdUnit: 'days remaining',
      thresholdDirection: 'below',
      authority: 'Permit registry',
      patternName: null,
      patternLeadMinutes: null,
    },
    {
      id: 'rule-low-battery',
      label: 'Low battery',
      watches: 'sensors',
      conditionSentence: 'below 20%',
      window: 'live',
      windowMinutes: null,
      severity: 'low',
      accuracy: ruleAuthority(0.97),
      thresholdValue: 20,
      thresholdUnit: '%',
      thresholdDirection: 'below',
      authority: 'Operator SOP v3',
      patternName: null,
      patternLeadMinutes: null,
    },
    {
      id: 'rule-rope-partner-lost',
      label: 'Rope partner lost',
      watches: 'climbers',
      conditionSentence: 'partner unreachable',
      window: '30 min',
      windowMinutes: 30,
      severity: 'high',
      accuracy: ruleAuthority(0.73),
      thresholdValue: 30,
      thresholdUnit: 'min unreachable',
      thresholdDirection: 'above',
      authority: 'Operator SOP v3',
      patternName: null,
      patternLeadMinutes: null,
    },
    {
      id: 'rule-pressure-mismatch',
      label: 'Pressure mismatch',
      watches: 'climbers',
      conditionSentence: 'altitude does not match camp',
      window: '1 h',
      windowMinutes: 60,
      severity: 'medium',
      accuracy: ruleAuthority(0.55),
      thresholdValue: 150,
      thresholdUnit: 'm discrepancy',
      thresholdDirection: 'above',
      authority: 'Barometric altitude model',
      patternName: null,
      patternLeadMinutes: null,
    },
    {
      id: 'rule-slow-processing',
      label: 'Slow processing',
      watches: 'system',
      conditionSentence: 'a stage falling behind',
      window: '5 min',
      windowMinutes: 5,
      severity: 'low',
      accuracy: ruleAuthority(0.81),
      thresholdValue: 5,
      thresholdUnit: 'min behind',
      thresholdDirection: 'above',
      authority: 'Pipeline SLA',
      patternName: null,
      patternLeadMinutes: null,
    },
  ]
}

export function needsTuning(rule: DetectionRule): boolean {
  return rule.accuracy < 0.6
}

export function firingCount(state: Pick<DetectionEngineState, 'detections'>, ruleId: string): number {
  return state.detections.filter((d) => d.ruleId === ruleId && !d.suppressed).length
}

// -- series + trend ---------------------------------------------------------
// A small deterministic PRNG seeded by the detection's own id (FNV-1a, the
// same technique ase/serial.ts uses for its stable hash) — a pure function
// of inputs, so two builds with the same seed produce the same sparkline,
// without borrowing dataset.ts's own stateful Rng stream position.

/** Exported so dataset.ts's Tuning background population (real, named entities not currently firing) can be generated the same deterministic way, without borrowing the shared stateful `Rng`'s stream position. */
export function stableUnit(seedStr: string, i: number = 0): number {
  let h = 0x811c9dc5
  const s = `${seedStr}:${i}`
  for (let j = 0; j < s.length; j++) {
    h ^= s.charCodeAt(j)
    h = Math.imul(h, 0x01000193)
  }
  return ((h >>> 0) % 1000) / 1000
}

/** 40 points ending at `currentValue`, trending toward it over `windowMinutes` (defaults to 40 when the rule has no fixed window, e.g. 'live'). Real deterministic data the sparkline draws directly — `computeTrendFromSeries` below reads the SAME array back, so the displayed arrow can never disagree with the line. */
export function generateSeries(detectionId: string, currentValue: number, startValue: number, windowMinutes: number | null): { minutesAgo: number; value: number }[] {
  const span = windowMinutes ?? 40
  const points: { minutesAgo: number; value: number }[] = []
  const n = 40
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1) // 0 (oldest) .. 1 (now)
    const base = startValue + (currentValue - startValue) * t
    const noise = (stableUnit(detectionId, i) - 0.5) * Math.abs(currentValue - startValue || currentValue) * 0.08
    points.push({ minutesAgo: Math.round((1 - t) * span), value: Math.round((base + noise) * 100) / 100 })
  }
  points[points.length - 1] = { minutesAgo: 0, value: currentValue }
  return points
}

export function computeTrendFromSeries(series: { minutesAgo: number; value: number }[]): Trend {
  if (series.length < 2) return 'steady'
  const quarter = Math.max(1, Math.floor(series.length / 4))
  const early = series.slice(0, quarter).reduce((s, p) => s + p.value, 0) / quarter
  const late = series.slice(-quarter).reduce((s, p) => s + p.value, 0) / quarter
  const delta = late - early
  const scale = Math.max(Math.abs(early), 1)
  if (Math.abs(delta) / scale < 0.02) return 'steady'
  return delta > 0 ? 'rising' : 'falling'
}

// -- map tree + propagation ---------------------------------------------------

const TIER_ORDER: MapNodeInput['tier'][] = ['country', 'regionRoute', 'operator', 'climber', 'sensor']

export function buildMapTree(nodeInputs: MapNodeInput[], detections: Detection[]): { nodes: MapNode[]; edges: MapEdge[] } {
  const bySubjectKey = new Map<string, string[]>() // "kind:id" -> ruleIds firing on it
  for (const d of detections) {
    if (d.suppressed) continue
    const key = subjectKey(d.subject)
    if (!key) continue
    const list = bySubjectKey.get(key) ?? []
    list.push(d.ruleId)
    bySubjectKey.set(key, list)
  }

  const byId = new Map(nodeInputs.map((n) => [n.id, n]))
  const childrenOf = new Map<string, string[]>()
  for (const n of nodeInputs) {
    if (!n.parentId) continue
    const list = childrenOf.get(n.parentId) ?? []
    list.push(n.id)
    childrenOf.set(n.parentId, list)
  }

  const firingRuleIdsOf = new Map<string, string[]>()
  for (const n of nodeInputs) {
    firingRuleIdsOf.set(n.id, bySubjectKey.get(n.id) ?? [])
  }

  const statusCache = new Map<string, NodeStatus>()
  function statusOf(id: string): NodeStatus {
    const cached = statusCache.get(id)
    if (cached) return cached
    const own = firingRuleIdsOf.get(id) ?? []
    const children = childrenOf.get(id) ?? []
    let status: NodeStatus = own.length > 0 ? 'anomaly' : 'nominal'
    if (status === 'nominal') {
      for (const childId of children) {
        if (statusOf(childId) !== 'nominal') {
          status = 'watch'
          break
        }
      }
    }
    statusCache.set(id, status)
    return status
  }

  const nodes: MapNode[] = nodeInputs
    .slice()
    .sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier))
    .map((n) => ({ ...n, firingRuleIds: firingRuleIdsOf.get(n.id) ?? [], status: statusOf(n.id) }))

  const edges: MapEdge[] = nodeInputs
    .filter((n) => n.parentId && byId.has(n.parentId))
    .map((n) => ({ from: n.parentId!, to: n.id, status: statusOf(n.id) }))

  return { nodes, edges }
}

function subjectKey(subject: DetectionSubject): string | null {
  return subject.kind === 'system' ? null : subject.nodeId
}

export function dimOpacityFor(node: MapNode, selectedRuleId: string | null): number {
  if (!selectedRuleId) return 1
  return node.firingRuleIds.includes(selectedRuleId) ? 1 : 0.12
}

/** `rootId` plus every node beneath it — what a Map click on a route or country (never itself a detection subject) filters Detections to, so "moves to Detections filtered to them" means everything firing under that place, not a literal, always-empty match on the place's own id. */
export function descendantNodeIds(nodes: MapNode[], rootId: string): Set<string> {
  const childrenOf = new Map<string, string[]>()
  for (const n of nodes) {
    if (!n.parentId) continue
    const list = childrenOf.get(n.parentId) ?? []
    list.push(n.id)
    childrenOf.set(n.parentId, list)
  }
  const result = new Set<string>([rootId])
  const queue = [rootId]
  while (queue.length > 0) {
    const current = queue.shift()!
    for (const childId of childrenOf.get(current) ?? []) {
      if (!result.has(childId)) {
        result.add(childId)
        queue.push(childId)
      }
    }
  }
  return result
}

// -- tuning simulation --------------------------------------------------------
// A pure function over a rule's own background population (every value it
// watches, not just the ones currently firing) — real recomputation on
// every drag, never a canned lookup table of "what the number would be."

export interface TuningPopulationMember {
  subject: DetectionSubject
  value: number
  actuallyDeteriorated: boolean // ground truth this demo knows and the rule doesn't — what "how often right" is scored against
}

export interface TuningResult {
  firingCount: number
  accuracyPct: number
  missed: TuningPopulationMember[] // deteriorated but not flagged at this threshold
  newlyFlagged: TuningPopulationMember[]
  newlyCleared: TuningPopulationMember[]
}

function firesAt(member: TuningPopulationMember, threshold: number, direction: ThresholdDirection): boolean {
  return direction === 'below' ? member.value < threshold : member.value > threshold
}

export function simulateThreshold(population: TuningPopulationMember[], direction: ThresholdDirection, currentThreshold: number, candidateThreshold: number): TuningResult {
  const before = new Set(population.filter((m) => firesAt(m, currentThreshold, direction)).map((m) => m.subject))
  const firingNow = population.filter((m) => firesAt(m, candidateThreshold, direction))
  const firingSet = new Set(firingNow.map((m) => m.subject))
  const truePositives = firingNow.filter((m) => m.actuallyDeteriorated).length
  const trueNegatives = population.filter((m) => !firingSet.has(m.subject) && !m.actuallyDeteriorated).length
  const accuracyPct = population.length === 0 ? 0 : Math.round(((truePositives + trueNegatives) / population.length) * 100)
  const missed = population.filter((m) => m.actuallyDeteriorated && !firingSet.has(m.subject))
  const newlyFlagged = firingNow.filter((m) => !before.has(m.subject))
  const newlyCleared = population.filter((m) => before.has(m.subject) && !firingSet.has(m.subject))
  return { firingCount: firingNow.length, accuracyPct, missed, newlyFlagged, newlyCleared }
}

export function subjectLabel(subject: DetectionSubject): string {
  switch (subject.kind) {
    case 'climber':
      return subject.name
    case 'route':
    case 'operator':
    case 'system':
      return subject.label
    case 'sensor':
      return `${subject.label} — ${subject.routeLabel}`
  }
}

// -- entry point ----------------------------------------------------------

export interface BuildDetectionEngineInputs {
  rules: DetectionRule[]
  detections: Detection[]
  resolved: ResolvedDetection[]
  suppressions: Suppression[]
  mapNodeInputs: MapNodeInput[]
  tuningPopulations: Map<string, TuningPopulationMember[]>
}

export function buildDetectionEngine(inputs: BuildDetectionEngineInputs): DetectionEngineState {
  const { nodes, edges } = buildMapTree(inputs.mapNodeInputs, inputs.detections)
  return {
    rules: inputs.rules,
    detections: inputs.detections,
    resolved: inputs.resolved,
    suppressions: inputs.suppressions,
    mapNodes: nodes,
    mapEdges: edges,
    tuningPopulations: inputs.tuningPopulations,
  }
}

/** Applies a suppression: a detection stops counting as firing (List/Map/Detections all read `.suppressed`), a real state transition, not a filter bolted onto the UI. */
export function applySuppression(state: DetectionEngineState, suppression: Suppression): DetectionEngineState {
  const key = subjectKey(suppression.subject)
  const detections = state.detections.map((d) => (d.ruleId === suppression.ruleId && subjectKey(d.subject) === key ? { ...d, suppressed: true } : d))
  const { nodes, edges } = buildMapTree(state.mapNodes, detections)
  return { ...state, detections, suppressions: [...state.suppressions, suppression], mapNodes: nodes, mapEdges: edges }
}

/** Commits a dragged Tuning threshold as the rule's real, persisted value — "any change writes to Revision" needs an actual change to persist, not just a live preview. */
export function applyThresholdChange(state: DetectionEngineState, ruleId: string, newThreshold: number): DetectionEngineState {
  const rules = state.rules.map((r) => (r.id === ruleId ? { ...r, thresholdValue: newThreshold } : r))
  return { ...state, rules }
}
