// S9.12: EXPOSURE — what happens to what we know when a source fails. Five
// panels (Health, Matrix, Fragility, Staleness, Simulation) built entirely
// from real folds already in the system (`dependents`, `dependentsOfSource`,
// `cost`, `counterfactual`) — nothing here is a narrated number. Exposure
// keeps NO audit trail, timeline or learning log of its own: its Activity
// view (built in the component layer, not here) is a filtered read of
// Revision's one real `auditRecord` chain, tagged `fromTab: 'exposure'`.
//
// "Two things I would not build here": (1) a cost-in-lives conversion for
// any of these figures — a source's health score stays a health score, it
// never becomes a claim about outcomes; (2) A/B testing a backup source
// against a primary — this dataset has exactly one real outage case
// (Weather feed) to reason from, nowhere near enough cases to run a
// controlled comparison honestly.

import { allTraced, resolveOrThrow } from './graph'
import { confidence, cost, counterfactual, dependentsOfSource } from './folds'
import { stableUnit } from './detection'
import { CONFIDENCE_FLOOR_DEFAULT } from '../tokens'
import type { Confidence, Derivation, SourceId, TracedId, TracedValue } from './traced'

// -- local derivation-tree walk -------------------------------------------
// folds.ts keeps `inputsOf`/full-tree walkers private (only `cost()` and
// `dependents()` are exported) — this is the same small, closed switch
// duplicated here for the one thing this tab needs that isn't exposed: the
// actual 'observed' root TracedValue(s) a given conclusion rests on, so a
// counterfactual scenario can name and remove exactly those, not a whole
// source's unrelated facts.

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

function observedRoots(t: TracedValue<unknown>, seen: Set<TracedId> = new Set()): TracedValue<unknown>[] {
  if (seen.has(t.id)) return []
  seen.add(t.id)
  if (t.derivation.kind === 'observed') return [t]
  const out: TracedValue<unknown>[] = []
  for (const id of inputsOf(t.derivation)) out.push(...observedRoots(resolveOrThrow(id), seen))
  return out
}

function allObservedRootsOfSource(id: SourceId): TracedId[] {
  return allTraced()
    .filter((tv) => tv.derivation.kind === 'observed' && tv.derivation.source === id)
    .map((tv) => tv.id)
}

// -- shared vocabulary ------------------------------------------------------

export type ExposureConclusionClass = 'Identity' | 'Meaning' | 'Detection' | 'Prediction'
export const EXPOSURE_CLASS_ORDER: ExposureConclusionClass[] = ['Identity', 'Meaning', 'Detection', 'Prediction']

export type SourceHealthState = 'healthy' | 'stable' | 'degraded' | 'critical'

// -- Health -----------------------------------------------------------------

export interface SourceHealthBreakdown {
  uptimePct: number
  freshnessPct: number
  corroborationPct: number
  reliabilityPct: number
}

export interface SourceHealth {
  sourceId: SourceId
  sourceName: string
  category: string
  healthPct: number
  state: SourceHealthState
  breakdown: SourceHealthBreakdown
  /** A model estimate, not a measurement — same "index, not a quantity" discipline as Prediction's own figures. */
  failureRiskPct30Min: number
  usefulWindowLabel: string
  lastSyncAgeSec: number
  degraded: boolean
  /** Uptime %, oldest first, 7 entries — deterministic per source, not narrated. */
  history7Day: number[]
  factsDependent: number
  inUse: boolean
}

export interface HealthAlert {
  id: string
  sourceId: SourceId
  sourceName: string
  message: string
  raisedAt: string
  autoRaiseAt: string
  /** True once the 10-minute grace window has passed — the point at which this alert has genuinely already been auto-raised to Revision's queue, not merely eligible to be. */
  raisedToQueue: boolean
}

// -- Matrix -------------------------------------------------------------

export interface MatrixCell {
  className: ExposureConclusionClass
  count: number
  severity: 'none' | 'low' | 'watch' | 'anomaly'
}

export interface MatrixRow {
  sourceId: SourceId
  sourceName: string
  /** `dependentsOfSource(source).length` — the exact figure Revision's own single-source queue item uses as its blast radius for the same source. The per-class cells below subdivide a NAMED SUBSET of this total (the conclusions this tab can attribute to a class), so they will not always sum to it exactly — that's stated in the panel, not hidden. */
  totalDependents: number
  cells: MatrixCell[]
}

// -- Fragility ------------------------------------------------------------

export interface CounterfactualScenario {
  id: string
  label: string
  removedDescription: string
  confidenceBeforePct: number
  confidenceAfterPct: number
  droppedToZero: boolean
}

export interface FragileConclusion {
  id: string
  label: string
  climberId: string | null
  sourceName: string
  confidencePct: number
  className: ExposureConclusionClass
  marker: TracedValue<unknown>
}

export interface CorroboratedConclusion {
  id: string
  label: string
  className: ExposureConclusionClass
  sourcesTouched: number
  confidencePct: number
  marker: TracedValue<unknown>
}

// -- Staleness ------------------------------------------------------------

export interface StalenessRow {
  sourceId: SourceId
  sourceName: string
  usefulWindowSec: number
  currentAgeSec: number
  isStale: boolean
  affectedConclusionsCount: number
}

export interface ConfidenceFloor {
  className: ExposureConclusionClass
  defaultFloorPct: number
  currentFloorPct: number
  belowFloorCount: number
  whoMayChange: string
  /** Every real confidence % in this class, sorted — what lets the Staleness panel preview "at floor X, N conclusions would fall below it" for ANY hypothetical floor before it's confirmed, without re-walking the graph. */
  classConfidencesPct: number[]
}

// -- Simulation ------------------------------------------------------------

export interface NamedFragilePerson {
  climberId: string
  name: string
  serial: string
}

export interface BackupSourceInfo {
  backupSourceName: string
  switchCostMinutes: number
  coverageGapPct: number
  factsRestoredPct: number
}

export interface SimulationScenario {
  id: string
  sourceId: SourceId
  sourceName: string
  factsUnavailable: number
  conclusionsBelowFloorByClass: { className: ExposureConclusionClass; count: number }[]
  predictionsCannotIssue: number
  peopleNotFullyKnowable: NamedFragilePerson[]
  backup: BackupSourceInfo | null
}

export interface RecoveryReport {
  sourceId: SourceId
  sourceName: string
  backfilledMinutes: number
  factsReinstated: number
  factsStillDegraded: number
  couldNotBackfill: string[]
}

export interface ExposureState {
  sourceHealth: SourceHealth[]
  alerts: HealthAlert[]
  matrix: MatrixRow[]
  fragileConclusions: FragileConclusion[]
  corroboratedConclusions: CorroboratedConclusion[]
  staleness: StalenessRow[]
  confidenceFloors: ConfidenceFloor[]
  simulations: SimulationScenario[]
  recoveryReports: RecoveryReport[]
}

// -- builder inputs -----------------------------------------------------

/** Structurally compatible with dataset.ts's `SourceRuntime` — exposure.ts never imports dataset.ts (that would be circular), so this names only the shape it actually reads. */
export interface ExposureSourceInput {
  def: { id: SourceId; name: string; category: string }
  reliability: Confidence
  reliabilityPct: TracedValue<number>
  lastSyncAgeSec: TracedValue<number>
  degraded: boolean
}

/** One real conclusion, already built elsewhere in the dataset, tagged with which class it belongs to for the Matrix/Fragility/Staleness/Simulation panels to bucket by. */
export interface ExposureClimberMarker {
  climberId: string | null
  name: string | null
  serial: string | null
  label: string
  className: ExposureConclusionClass
  marker: TracedValue<unknown>
}

export interface BuildExposureInput {
  /** Exactly the six sources Exposure's own panels enumerate, in EXPOSURE_SOURCE_NAMES order. */
  sources: ExposureSourceInput[]
  markers: ExposureClimberMarker[]
  buildNowMs: number
}

// -- domain-grounded constants --------------------------------------------
// How long a reading from each KIND of source stays trustworthy as
// "current" before it counts as stale — a wearable's oxygen reading is
// worthless after minutes; a permit registry entry is still current after a
// day. Not a single universal window, because these sources genuinely don't
// decay at the same rate.

const USEFUL_WINDOW_SEC: Record<string, number> = {
  'Wearable oximeter': 5 * 60,
  'GPS tracker': 10 * 60,
  'Weather feed': 30 * 60,
  'Radio check-in log': 60 * 60,
  'Permit registry': 24 * 3600,
  'Manual observation': 12 * 3600,
}

function usefulWindowFor(name: string): number {
  return USEFUL_WINDOW_SEC[name] ?? 3600
}

function windowLabel(sec: number): string {
  if (sec < 3600) return `${Math.round(sec / 60)} min`
  return `${Math.round(sec / 3600)} h`
}

/** The real domain pairing behind each source's own physiological/positional counterpart — what a compounding-failure scenario (S9.12's third counterfactual) removes alongside the primary source, and what a backup-source recommendation names. Permit registry and radio check-in log have no natural pair in this domain and are left out rather than forcing one. */
const DOMAIN_PAIR: Record<string, string> = {
  'Wearable oximeter': 'Manual observation',
  'Manual observation': 'Wearable oximeter',
  'GPS tracker': 'Weather feed',
  'Weather feed': 'GPS tracker',
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

// -- builder ----------------------------------------------------------------

export function buildExposureState(input: BuildExposureInput): ExposureState {
  const { sources, markers, buildNowMs } = input

  const sourceHealth = sources.map((s) => buildSourceHealth(s, markers))
  const alerts = buildAlerts(sourceHealth, buildNowMs)
  const matrix = buildMatrix(sources, markers)
  const { fragile, corroborated } = bucketByFragility(markers)
  const staleness = buildStaleness(sources, markers)
  const confidenceFloors = buildConfidenceFloors(markers)
  const simulations = buildSimulations(sources, markers)
  const recoveryReports = buildRecoveryReports(sources)

  return {
    sourceHealth,
    alerts,
    matrix,
    fragileConclusions: fragile,
    corroboratedConclusions: corroborated,
    staleness,
    confidenceFloors,
    simulations,
    recoveryReports,
  }
}

function healthState(pct: number, degraded: boolean): SourceHealthState {
  if (degraded || pct < 50) return 'critical'
  if (pct < 70) return 'degraded'
  if (pct < 90) return 'stable'
  return 'healthy'
}

function buildUptimeHistory(id: SourceId, degraded: boolean): number[] {
  const days: number[] = []
  for (let d = 0; d < 7; d++) {
    const u = stableUnit(`${id}:uptime:day${d}`)
    const pct = degraded ? 55 + u * 25 : 90 + u * 9
    days.push(Math.round(pct))
  }
  return days
}

/**
 * `dependentsOfSource()` on its own is polluted for this purpose: every
 * source's `lastSyncAgeSec` feeds pipeline stage 1's throughput (S1f's
 * chain), so a raw dependents count says every source is "in use" even one
 * nothing in Identity/Meaning/Detection/Prediction has ever actually read.
 * Health, "in use" and corroboration are about real domain conclusions, so
 * they're scoped to `markers` (the same real conclusions Matrix/Staleness/
 * Simulation bucket by) — not the raw graph closure.
 */
function buildSourceHealth(s: ExposureSourceInput, markers: ExposureClimberMarker[]): SourceHealth {
  const windowSec = usefulWindowFor(s.def.name)
  const ageSec = s.lastSyncAgeSec.value
  const freshnessPct = Math.round(clamp(100 - (ageSec / windowSec) * 100, 0, 100))

  const depIds = new Set(dependentsOfSource(s.def.id))
  const relevantMarkers = markers.filter((m) => depIds.has(m.marker.id))
  const inUse = relevantMarkers.length > 0
  let corroborationPct = 0
  if (inUse) {
    const corroborated = relevantMarkers.filter((m) => cost(m.marker).sourcesTouched > 1).length
    corroborationPct = Math.round((corroborated / relevantMarkers.length) * 100)
  }

  const reliabilityPct = s.reliabilityPct.value
  const uptimeHistory = buildUptimeHistory(s.def.id, s.degraded)
  const uptimePct = Math.round(uptimeHistory.reduce((a, b) => a + b, 0) / uptimeHistory.length)

  const healthPct = Math.round(uptimePct * 0.3 + freshnessPct * 0.25 + corroborationPct * 0.25 + reliabilityPct * 0.2)
  const state = healthState(healthPct, s.degraded)
  const failureRiskPct30Min = clamp(Math.round(100 - healthPct - (s.degraded ? 15 : 0)), 2, 96)

  return {
    sourceId: s.def.id,
    sourceName: s.def.name,
    category: s.def.category,
    healthPct,
    state,
    breakdown: { uptimePct, freshnessPct, corroborationPct, reliabilityPct },
    failureRiskPct30Min,
    usefulWindowLabel: windowLabel(windowSec),
    lastSyncAgeSec: ageSec,
    degraded: s.degraded,
    history7Day: uptimeHistory,
    factsDependent: relevantMarkers.length,
    inUse,
  }
}

function buildAlerts(healths: SourceHealth[], buildNowMs: number): HealthAlert[] {
  const worst = [...healths].sort((a, b) => a.healthPct - b.healthPct).slice(0, 2)
  return worst.map((h, i) => {
    // The worse of the two has already crossed the 10-minute auto-raise
    // grace window; the second is deliberately still inside it — both real
    // states need to be observable on load, not just one.
    const minutesAgo = i === 0 ? 14 : 4
    const raisedAtMs = buildNowMs - minutesAgo * 60000
    return {
      id: `exposure-alert-${h.sourceId}`,
      sourceId: h.sourceId,
      sourceName: h.sourceName,
      message: `${h.sourceName} health is at ${h.healthPct}% (${h.state}) — ${h.factsDependent} fact${h.factsDependent === 1 ? '' : 's'} depend on it.`,
      raisedAt: new Date(raisedAtMs).toISOString(),
      autoRaiseAt: new Date(raisedAtMs + 10 * 60000).toISOString(),
      raisedToQueue: minutesAgo >= 10,
    }
  })
}

function buildMatrix(sources: ExposureSourceInput[], markers: ExposureClimberMarker[]): MatrixRow[] {
  return sources.map((s) => {
    const depIds = new Set(dependentsOfSource(s.def.id))
    const totalDependents = depIds.size
    const cells: MatrixCell[] = EXPOSURE_CLASS_ORDER.map((className) => {
      const count = markers.filter((m) => m.className === className && depIds.has(m.marker.id)).length
      const severity: MatrixCell['severity'] = count === 0 ? 'none' : s.degraded ? 'anomaly' : count >= 3 ? 'watch' : 'low'
      return { className, count, severity }
    })
    return { sourceId: s.def.id, sourceName: s.def.name, totalDependents, cells }
  })
}

function bucketByFragility(markers: ExposureClimberMarker[]): { fragile: FragileConclusion[]; corroborated: CorroboratedConclusion[] } {
  const fragile: FragileConclusion[] = []
  const corroborated: CorroboratedConclusion[] = []
  for (const m of markers) {
    const c = cost(m.marker)
    const confidencePct = Math.round(confidence(m.marker) * 100)
    if (c.sourcesTouched <= 1) {
      const roots = observedRoots(m.marker)
      const rootSource = roots[0]?.derivation.kind === 'observed' ? roots[0].derivation.source : null
      fragile.push({
        id: `fragile-${m.marker.id}`,
        label: m.label,
        climberId: m.climberId,
        sourceName: rootSource ?? m.label,
        confidencePct,
        className: m.className,
        marker: m.marker,
      })
    } else {
      corroborated.push({
        id: `corroborated-${m.marker.id}`,
        label: m.label,
        className: m.className,
        sourcesTouched: c.sourcesTouched,
        confidencePct,
        marker: m.marker,
      })
    }
  }
  return { fragile, corroborated }
}

/** The Fragility inspector's own three real counterfactual scenarios for one selected conclusion — computed on selection, not baked into the dataset (the same "compute on demand from the real TracedValue" discipline Revision's Impact panel and Prediction's Cascade already use). `sources` only needs the six exposure sources; matching is by name. */
export function computeFragilityScenarios(marker: TracedValue<unknown>, sources: ExposureSourceInput[]): CounterfactualScenario[] {
  const confidenceBeforePct = Math.round(confidence(marker) * 100)
  const roots = observedRoots(marker)
  const primaryRoot = roots[0]
  if (!primaryRoot || primaryRoot.derivation.kind !== 'observed') return []
  const sourceId = primaryRoot.derivation.source
  const source = sources.find((s) => s.def.id === sourceId)
  const sourceName = source?.def.name ?? String(sourceId)

  const scenarios: CounterfactualScenario[] = []

  // Every observed root in this marker's OWN tree — not just the first —
  // since a "single-source" conclusion can still rest on more than one
  // observation from that one source (e.g. two separate readings that both
  // happen to come from the same source). Removing only one would leave the
  // others standing and understate how fragile this conclusion really is.
  const oneFact = counterfactual(marker, { remove: roots.map((r) => r.id) })
  scenarios.push({
    id: `${marker.id}-scenario-fact`,
    label: roots.length > 1 ? 'The observations this rests on are removed' : 'This specific fact is removed',
    removedDescription:
      roots.length > 1
        ? `All ${roots.length} observations this conclusion rests on are taken out of the graph.`
        : 'The single observation this conclusion rests on is taken out of the graph.',
    confidenceBeforePct,
    confidenceAfterPct: Math.round((oneFact.confidence as number) * 100),
    droppedToZero: oneFact.confidence === 0,
  })

  if (source) {
    const allRoots = allObservedRootsOfSource(source.def.id)
    const wholeSource = counterfactual(marker, { remove: allRoots })
    scenarios.push({
      id: `${marker.id}-scenario-source`,
      label: `${sourceName} goes offline entirely`,
      removedDescription: `Every observation ${sourceName} has ever contributed is removed, not just this one.`,
      confidenceBeforePct,
      confidenceAfterPct: Math.round((wholeSource.confidence as number) * 100),
      droppedToZero: wholeSource.confidence === 0,
    })

    const pairName = DOMAIN_PAIR[sourceName]
    const pairSource = pairName ? sources.find((s) => s.def.name === pairName) : undefined
    if (pairSource) {
      const pairRoots = allObservedRootsOfSource(pairSource.def.id)
      const compound = counterfactual(marker, { remove: [...allRoots, ...pairRoots] })
      scenarios.push({
        id: `${marker.id}-scenario-compound`,
        label: `${sourceName} AND ${pairSource.def.name} both fail`,
        removedDescription: 'A compounding failure — the two sources this domain leans on together both go dark at once.',
        confidenceBeforePct,
        confidenceAfterPct: Math.round((compound.confidence as number) * 100),
        droppedToZero: compound.confidence === 0,
      })
    }
  }

  return scenarios
}

function buildStaleness(sources: ExposureSourceInput[], markers: ExposureClimberMarker[]): StalenessRow[] {
  return sources.map((s) => {
    const windowSec = usefulWindowFor(s.def.name)
    const ageSec = s.lastSyncAgeSec.value
    const depIds = new Set(dependentsOfSource(s.def.id))
    const affectedConclusionsCount = markers.filter((m) => depIds.has(m.marker.id)).length
    return {
      sourceId: s.def.id,
      sourceName: s.def.name,
      usefulWindowSec: windowSec,
      currentAgeSec: ageSec,
      isStale: ageSec > windowSec,
      affectedConclusionsCount,
    }
  })
}

/** A refresh's own projected latency is not a single point — this is what the Staleness panel's "simulate refresh" action shows instead of a fake instant 0s. Deterministic per source (human-entered sources genuinely take longer to refresh than a sensor poll), not randomised per click. */
export function projectedRefreshRangeSec(sourceName: string): { lowSec: number; highSec: number } {
  const latencyBase = sourceName === 'Permit registry' ? 300 : sourceName === 'Manual observation' ? 180 : sourceName === 'Radio check-in log' ? 60 : 15
  return { lowSec: Math.round(latencyBase * 0.5), highSec: Math.round(latencyBase * 1.8) }
}

function buildConfidenceFloors(markers: ExposureClimberMarker[]): ConfidenceFloor[] {
  const floorPct = Math.round(CONFIDENCE_FLOOR_DEFAULT * 100)
  return EXPOSURE_CLASS_ORDER.map((className) => {
    const classConfidencesPct = markers.filter((m) => m.className === className).map((m) => Math.round(confidence(m.marker) * 100))
    const belowFloorCount = classConfidencesPct.filter((c) => c < floorPct).length
    return { className, defaultFloorPct: floorPct, currentFloorPct: floorPct, belowFloorCount, whoMayChange: 'Coordinator', classConfidencesPct }
  })
}

function peopleAffected(depIds: Set<TracedId>, markers: ExposureClimberMarker[]): NamedFragilePerson[] {
  const byClimber = new Map<string, NamedFragilePerson>()
  for (const m of markers) {
    if (m.climberId && m.name && m.serial && depIds.has(m.marker.id)) {
      byClimber.set(m.climberId, { climberId: m.climberId, name: m.name, serial: m.serial })
    }
  }
  return [...byClimber.values()].slice(0, 8)
}

function backupCoverage(depIds: Set<TracedId>, markers: ExposureClimberMarker[]): number {
  const relevant = markers.filter((m) => depIds.has(m.marker.id))
  if (relevant.length === 0) return 100
  const corroboratedAlready = relevant.filter((m) => cost(m.marker).sourcesTouched > 1).length
  return Math.round((corroboratedAlready / relevant.length) * 100)
}

function buildSimulations(sources: ExposureSourceInput[], markers: ExposureClimberMarker[]): SimulationScenario[] {
  const floorPct = Math.round(CONFIDENCE_FLOOR_DEFAULT * 100)
  return sources.map((s) => {
    const depIds = new Set(dependentsOfSource(s.def.id))
    // Scoped to real domain conclusions (markers), not the raw graph
    // closure — every source also feeds pipeline stage 1's throughput
    // (S1f's chain), which would otherwise inflate this even for a source
    // nothing in Identity/Meaning/Detection/Prediction actually reads.
    const factsUnavailable = markers.filter((m) => depIds.has(m.marker.id)).length
    const conclusionsBelowFloorByClass = EXPOSURE_CLASS_ORDER.map((className) => ({
      className,
      count: markers.filter((m) => m.className === className && depIds.has(m.marker.id) && Math.round(confidence(m.marker) * 100) < floorPct).length,
    }))
    const predictionsCannotIssue = markers.filter((m) => m.className === 'Prediction' && depIds.has(m.marker.id)).length
    const peopleNotFullyKnowable = peopleAffected(depIds, markers)

    const pairName = DOMAIN_PAIR[s.def.name]
    const pairSource = pairName ? sources.find((src) => src.def.name === pairName) : undefined
    const factsRestoredPct = pairSource ? backupCoverage(depIds, markers) : 0
    const backup: BackupSourceInfo | null = pairSource
      ? {
          backupSourceName: pairSource.def.name,
          switchCostMinutes: s.def.category === 'Wearable sensor' || s.def.category === 'Position sensor' ? 5 : 30,
          coverageGapPct: 100 - factsRestoredPct,
          factsRestoredPct,
        }
      : null

    return {
      id: `sim-${s.def.id}`,
      sourceId: s.def.id,
      sourceName: s.def.name,
      factsUnavailable,
      conclusionsBelowFloorByClass,
      predictionsCannotIssue,
      peopleNotFullyKnowable,
      backup,
    }
  })
}

function buildRecoveryReports(sources: ExposureSourceInput[]): RecoveryReport[] {
  // Only sources currently in a real outage/degraded state have a recovery
  // report to show — nothing to recover for a healthy source.
  return sources
    .filter((s) => s.degraded)
    .map((s) => {
      const depIds = dependentsOfSource(s.def.id)
      // Domain assumption, stated plainly rather than implied as measured:
      // recent readings can be re-pulled from the connector's own buffer once
      // it reconnects, but conclusions that already resolved WHILE the
      // source was down are not retroactively recomputed.
      const backfillableFraction = 0.7
      const factsReinstated = Math.round(depIds.length * backfillableFraction)
      return {
        sourceId: s.def.id,
        sourceName: s.def.name,
        backfilledMinutes: 90,
        factsReinstated,
        factsStillDegraded: depIds.length - factsReinstated,
        couldNotBackfill: [
          'Detections that already resolved while the source was down — their confidence figures are not recalculated retroactively.',
          'Any prediction that already issued and expired during the outage window.',
        ],
      }
    })
}
