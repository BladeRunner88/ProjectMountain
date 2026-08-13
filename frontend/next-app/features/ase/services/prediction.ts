// S9.10: PREDICTION — "what ASE expects next," built from the same graph
// every other tab reads, never a second, narrated dataset. Three framing
// rules govern everything in this file and are printed verbatim in the UI:
//   1. Operational risk, not diagnosis — outcomes are "requires descent" /
//      "requires review", never a medical condition.
//   2. Cognitive state is INFERRED, not measured — ASE does not read brain
//      activity; every cognitive figure below is built from observable
//      behaviour (radio latency, schedule slip, rope separation...).
//   3. Every cognitive figure is an INDEX against this person's OWN
//      baseline, never rendered as though a real quantity were measured.
//
// The hero case (Nima Tamang) reuses the EXACT SpO2 chain (90 baseline, 84
// then 81, the real supersession) and the EXACT wind reading (78 kph, the
// real "wind-precedes-oxygen-decline" pattern, 18-minute lead) that S9.7's
// Meaning tab and S9.9's Detection tab already built — narrative continuity
// the same way those two blocks reused each other's numbers, not a
// coincidence.

import { confidence, ruleAuthority } from './folds'
import { instant, modelId, predicted, type Instant, type TracedId, type TracedValue } from './traced'
import type { Rng } from './rng'
import type { ClimberFact } from './dataset'
import type { IdentityRecord } from './identityRecord'
import type { IdentityCard } from './identityCard'
import { statusFromAnomalyState } from './identityCard'
import type { DetectionEngineState } from './detection'
import type { NodeStatus } from './nodeLanguage'

// -- shared vocabulary --------------------------------------------------------

export type RiskLevel = 'critical' | 'elevated' | 'watch'
export type PredictedOutcome = 'requires-descent' | 'requires-review' | 'watch' | 'ready'
export type PredictionStatus = 'open' | 'acknowledged' | 'acted-on' | 'overruled' | 'resolved'
export type DriverKind = 'clinical' | 'learned' | 'operator'
export type Band = 'likely' | 'possible' | 'unlikely'
export type LoadLevel = 'low' | 'moderate' | 'high'

export const PREDICTED_LABEL: Record<PredictedOutcome, string> = {
  'requires-descent': 'REQUIRES DESCENT',
  'requires-review': 'REQUIRES REVIEW',
  watch: 'WATCH',
  ready: 'READY',
}

export interface Driver {
  id: string
  label: string
  kind: DriverKind
  contributionPct: number
  evidence: string
  authority: string
  confidencePct: number
  /** Set only for a learned (not clinical/operator) driver — "held in 47 of 52 similar cases." */
  heldOf: { holds: number; total: number } | null
}

export interface CognitiveIndicator {
  key: string
  label: string
  current: string
  vsBaseline: string
  /** Points of the 100-point baseline this indicator alone accounts for losing — every indicator's contributionPts sums exactly to (100 - decisionCapacity), a real invariant, not narrated. */
  contributionPts: number
  tooltip: string
}

export interface CascadeMetric {
  label: string
  valueText: string
  deltaText: string
}

export interface CascadeArrow {
  sentence: string
  authority: string
  confidencePct: number
  heldOf: { holds: number; total: number } | null
}

export type CascadeStageKey = 'environment' | 'body' | 'mind' | 'decisions'

export interface CascadeDecision {
  label: string
  tag: 'expected' | 'elevated' | 'critical'
}

export interface CascadeStage {
  key: CascadeStageKey
  label: string
  metrics: CascadeMetric[]
  arrow: CascadeArrow | null
  decisions: CascadeDecision[]
}

export interface RadarAxes {
  acclimatisation: number
  cardiacReserve: number
  oxygenEfficiency: number
  ascentDiscipline: number
  cognitiveState: number
  exposureLoad: number
}

export const RADAR_AXIS_LABEL: Record<keyof RadarAxes, string> = {
  acclimatisation: 'Acclimatisation',
  cardiacReserve: 'Cardiac reserve',
  oxygenEfficiency: 'Oxygen efficiency',
  ascentDiscipline: 'Ascent discipline',
  cognitiveState: 'Cognitive state',
  exposureLoad: 'Exposure load',
}

export interface DecisionPatternInstance {
  key: string
  name: string
  description: string
  triggers: string[]
  observableSigns: string[]
  seenInThisPersonCount: number
  seenInThisPersonMostRecent: string | null
  mitigation: string
  mitigationEffect: string
  likelihoodBand: Band
  sampleSize: number
}

export interface TimelinePoint {
  hourLabel: string
  capacity: number
  observed: boolean
  marker: 'turnaround' | 'critical-threshold' | 'partner-separation' | null
}

export interface HumanConnection {
  partnerClimberId: string | null
  partnerName: string | null
  partnerRisk: NodeStatus | null
  distanceM: number
  lastContactMinutesAgo: number
  cohesionScore: number
}

export interface ClusterMember {
  climberId: string
  name: string
  serial: string
  relation: 'self' | 'rope partner' | 'route mate'
  predicted: PredictedOutcome
  withinHours: number
  likelihoodPct: number
  risk: RiskLevel
}

export interface ReadingTrend {
  label: string
  points: number[]
  trend: 'rising' | 'falling' | 'steady'
}

export interface PersonPrediction {
  climberId: string
  name: string
  serial: string
  role: 'climber' | 'sherpa' | 'guide' | 'client'
  risk: RiskLevel
  position: {
    label: string
    altitudeM: number
    altitudeDeltaM: number
    movement: 'ascending' | 'stationary' | 'descending'
  }
  human: HumanConnection
  predicted: PredictedOutcome
  withinHours: number
  likelihoodPct: number
  likelihoodTraced: TracedValue<number>
  issuedAt: Instant
  resolvesAt: Instant
  status: PredictionStatus
  drivers: Driver[]
  cognitive: {
    indicators: CognitiveIndicator[]
    decisionCapacity: number
    environmentalLoad: LoadLevel
    physiologicalLoad: LoadLevel
    workingMemory: 'normal' | 'reduced' | 'impaired'
  }
  baseline: RadarAxes
  current: RadarAxes
  cascade: CascadeStage[]
  timeline: TimelinePoint[]
  patterns: DecisionPatternInstance[]
  recommendedAction: { action: string; why: string; confidencePct: number; ifNothing: string }
  cluster: ClusterMember[]
  readings: ReadingTrend[]
}

export interface CalibrationEntry {
  id: string
  date: string
  who: string
  serial: string
  predicted: PredictedOutcome
  withinHours: number
  likelihoodPct: number
  whatHappened: string
  correct: boolean
  notes: string
}

export interface DriverCalibrationRow {
  driver: string
  accuracyPct: number
  n: number
  note: string
}

export interface ReliabilityBucket {
  predictedPct: number
  observedPct: number
  n: number
}

export interface PatternLibraryEntry {
  key: string
  name: string
  description: string
  triggers: string[]
  observableMarkers: string[]
  frequencyPct: number
  accuracyWhenPredictedPct: number
  typicalTimeToAppear: string
  mitigation: string
}

export interface PredictionState {
  predictions: Map<string, PersonPrediction>
  order: string[]
  calibration: {
    reliability: ReliabilityBucket[]
    resolved: CalibrationEntry[]
    byDriver: DriverCalibrationRow[]
    totalResolvedCases: number
  }
  patternLibrary: PatternLibraryEntry[]
}

// -- pure helpers ---------------------------------------------------------

/** N non-negative integers that sum EXACTLY to `total` — how every "contributions must sum to X" invariant in this file is actually enforced, not narrated. Stick-breaking over `total`, deterministic given `rng`. */
export function distributeContributions(total: number, count: number, rng: Rng): number[] {
  if (count <= 0) return []
  if (count === 1) return [total]
  const cuts = Array.from({ length: count - 1 }, () => rng.int(0, total)).sort((a, b) => a - b)
  const parts: number[] = []
  let prev = 0
  for (const c of cuts) {
    parts.push(c - prev)
    prev = c
  }
  parts.push(total - prev)
  return parts
}

export function decisionBandForCapacity(capacity: number): 'READY' | 'WATCH' | 'IMPAIRED' | 'REQUIRES DESCENT' {
  if (capacity >= 80) return 'READY'
  if (capacity >= 60) return 'WATCH'
  if (capacity >= 40) return 'IMPAIRED'
  return 'REQUIRES DESCENT'
}

export function bandFromSampleRate(rate: number): Band {
  if (rate >= 0.55) return 'likely'
  if (rate >= 0.3) return 'possible'
  return 'unlikely'
}

const COGNITIVE_INDICATOR_DEFS: { key: string; label: string; tooltip: string }[] = [
  { key: 'radio-latency', label: 'Response latency to radio', tooltip: 'Time between a call and this person’s reply. A rising latency is one of the earliest, cheapest signals of cognitive slowing at altitude.' },
  { key: 'ascent-deviation', label: 'Deviation from ascent plan', tooltip: 'Minutes behind or ahead of the schedule filed with the operator. Large deviations correlate with impaired time-perception under hypoxia.' },
  { key: 'rest-pattern', label: 'Rest-stop pattern', tooltip: 'Regularity of planned rest stops. An erratic pattern often precedes a missed turnaround decision.' },
  { key: 'rope-separation', label: 'Separation from rope partner', tooltip: 'Distance from the person’s own rope partner. Widening separation is a classic social-withdrawal marker.' },
  { key: 'pace-variability', label: 'Pace variability, last hour', tooltip: 'How much a person’s moving pace swings minute to minute. High variability suggests inconsistent effort allocation, a judgement signal.' },
  { key: 'camp-overhold', label: 'Time held at camp vs plan', tooltip: 'Extra time spent at the last camp beyond what was planned. Can indicate impaired go/no-go decision-making as much as fatigue.' },
  { key: 'checkin-completeness', label: 'Radio check-in completeness', tooltip: 'Whether scheduled check-ins were completed in full or partially. Partial check-ins are an early communication-degradation signal.' },
  { key: 'decision-reversals', label: 'Decision reversals', tooltip: 'Times a stated plan (e.g. "turning around") was reversed within the hour. Reversals track indecision under cognitive load.' },
]

const DECISION_PATTERN_DEFS: { key: string; name: string; description: string; triggers: string[]; observableSigns: string[]; mitigation: string; mitigationEffect: string }[] = [
  {
    key: 'continuation-bias',
    name: 'Continuation bias',
    description: 'Continuing upward despite turnaround signals.',
    triggers: ['sunk cost', 'summit proximity', 'impaired risk assessment'],
    observableSigns: ["ignoring a partner's stop signal", 'skipping rest'],
    mitigation: 'A partner check-in every 10 minutes reduces this materially.',
    mitigationEffect: 'cuts continuation past a turnaround point by roughly half in comparable cases',
  },
  {
    key: 'social-withdrawal',
    name: 'Social withdrawal',
    description: 'Increasing distance and shorter radio responses.',
    triggers: ['fatigue', 'hypoxia', 'discomfort masking'],
    observableSigns: ['rope separation widening', 'terse or delayed radio replies'],
    mitigation: 'Scheduled proactive check-ins, not waiting for the person to call in.',
    mitigationEffect: 'restores check-in completeness in most comparable cases within an hour',
  },
  {
    key: 'risk-normalisation',
    name: 'Risk normalisation',
    description: 'Reinterpreting dangerous conditions as acceptable.',
    triggers: ['prior successful exposure', 'group pressure', 'fatigue-driven discounting'],
    observableSigns: ['dismissing a worsening weather call', 'downplaying a physiological reading to the guide'],
    mitigation: "A second, independent go/no-go voice — not the same person's own judgement.",
    mitigationEffect: 'measurably lowers continuation-past-threshold in comparable cases',
  },
  {
    key: 'decision-paralysis',
    name: 'Decision paralysis',
    description: 'Unable to make go or no-go calls at turnaround points.',
    triggers: ['conflicting signals', 'high cognitive load', 'fear of the wrong call'],
    observableSigns: ['repeated decision reversals', 'stalling at a decision point without radio contact'],
    mitigation: 'A pre-agreed, non-negotiable turnaround rule removes the decision in the moment.',
    mitigationEffect: 'removes the decision point entirely when set in advance',
  },
  {
    key: 'equipment-neglect',
    name: 'Equipment neglect',
    description: 'Skipping checks, faster transitions, loose gear.',
    triggers: ['fatigue', 'time pressure', 'reduced attentional capacity'],
    observableSigns: ['skipped equipment check', 'unusually fast camp transitions'],
    mitigation: 'A buddy equipment check, independent of the person’s own.',
    mitigationEffect: 'catches most equipment lapses before they become consequential',
  },
]

// The reference library (Calibration tab) — generic, person-independent
// entries. Frequency/accuracy/typical-time figures are the model's own
// aggregate stats, distinct from any one person's pattern instances above.
export const PATTERN_LIBRARY: PatternLibraryEntry[] = [
  { key: 'summit-fever-continuation', name: 'Summit-fever continuation', description: 'Continuing upward past a planned turnaround as the summit nears.', triggers: ['summit proximity', 'sunk cost', 'group momentum'], observableMarkers: ['ignoring turnaround time', 'accelerating pace near the top'], frequencyPct: 24, accuracyWhenPredictedPct: 79, typicalTimeToAppear: '1–2 h before a missed turnaround', mitigation: 'A hard, pre-agreed turnaround time enforced by the guide, not the climber.' },
  { key: 'hypoxic-social-withdrawal', name: 'Hypoxic social withdrawal', description: 'Reduced communication and widening rope separation under low oxygen.', triggers: ['SpO2 decline', 'fatigue', 'cold'], observableMarkers: ['shorter radio replies', 'rope separation widening'], frequencyPct: 31, accuracyWhenPredictedPct: 74, typicalTimeToAppear: '20–40 min after SpO2 crosses 80%', mitigation: 'Proactive, scheduled check-ins rather than waiting for a call-in.' },
  { key: 'fatigue-equipment-neglect', name: 'Fatigue equipment neglect', description: 'Skipped gear checks and faster, less careful camp transitions.', triggers: ['cumulative fatigue', 'time pressure'], observableMarkers: ['skipped checks', 'faster transitions', 'loose gear reported by partner'], frequencyPct: 18, accuracyWhenPredictedPct: 68, typicalTimeToAppear: 'after 3+ consecutive push days', mitigation: 'Independent buddy equipment check at every transition.' },
  { key: 'cold-induced-decision-paralysis', name: 'Cold-induced decision paralysis', description: 'Inability to commit to a go/no-go call as core temperature drops.', triggers: ['falling core temperature estimate', 'wind chill', 'wet gear'], observableMarkers: ['decision reversals', 'stalling without radio contact'], frequencyPct: 12, accuracyWhenPredictedPct: 71, typicalTimeToAppear: 'as estimated core temp nears 35.5°C', mitigation: 'Pre-agreed non-negotiable turnaround rule.' },
  { key: 'group-think-amplification', name: 'Group-think amplification', description: "One person's risk tolerance shifts the whole group's threshold.", triggers: ['strong personality in group', 'schedule pressure'], observableMarkers: ['risk perception converging across the group', 'dissent going quiet on the radio'], frequencyPct: 9, accuracyWhenPredictedPct: 62, typicalTimeToAppear: 'variable — often only visible in hindsight', mitigation: 'A second, independent go/no-go voice outside the group.' },
  { key: 'partner-separation-cascade', name: 'Partner separation cascade', description: 'Growing rope separation that compounds into a full communication breakdown.', triggers: ['pace mismatch', 'fatigue asymmetry between partners'], observableMarkers: ['rope separation widening past 10 m', 'contact age climbing'], frequencyPct: 21, accuracyWhenPredictedPct: 68, typicalTimeToAppear: '30–60 min after separation first widens', mitigation: 'A hard separation limit that triggers an automatic check-in.' },
  { key: 'turnaround-threshold-blindness', name: 'Turnaround threshold blindness', description: "Failing to recognise a turnaround point that's already been reached.", triggers: ['summit fixation', 'impaired time perception'], observableMarkers: ['schedule slip past the stated turnaround time with no radio call'], frequencyPct: 27, accuracyWhenPredictedPct: 79, typicalTimeToAppear: 'at or shortly after the planned turnaround time', mitigation: 'An externally-enforced, alarm-based turnaround time.' },
  { key: 'altitude-risk-normalisation', name: 'Altitude risk normalisation', description: 'Reinterpreting objectively dangerous readings or conditions as acceptable.', triggers: ['prior successful exposure to similar risk', 'fatigue-driven discounting'], observableMarkers: ['dismissing a worsening reading to the guide', 'downplaying symptoms'], frequencyPct: 16, accuracyWhenPredictedPct: 65, typicalTimeToAppear: 'gradual, over hours', mitigation: 'A second, independent read of the same vitals, not self-reported.' },
]

// -- calibration (global, person-independent) --------------------------------

function buildCalibration(): PredictionState['calibration'] {
  const reliability: ReliabilityBucket[] = [
    { predictedPct: 10, observedPct: 8, n: 14 },
    { predictedPct: 20, observedPct: 17, n: 11 },
    { predictedPct: 30, observedPct: 26, n: 9 },
    { predictedPct: 40, observedPct: 37, n: 12 },
    { predictedPct: 50, observedPct: 48, n: 15 },
    { predictedPct: 60, observedPct: 55, n: 13 },
    { predictedPct: 70, observedPct: 66, n: 18 },
    { predictedPct: 80, observedPct: 74, n: 14 },
    { predictedPct: 90, observedPct: 81, n: 9 },
    { predictedPct: 100, observedPct: 90, n: 3 },
  ]
  const totalResolvedCases = reliability.reduce((sum, b) => sum + b.n, 0)

  // Deliberately includes one confident miss and one correct call a human
  // overruled — the spec's own line: "those two rows buy more trust than a
  // hundred right ones."
  const resolved: CalibrationEntry[] = [
    { id: 'cal-1', date: '2026-07-28', who: 'Marta Fernández', serial: '•••6031', predicted: 'requires-descent', withinHours: 5, likelihoodPct: 82, whatHappened: 'Descended to Camp II at 4 h 40 m, oxygen recovered fully.', correct: true, notes: 'Textbook case — driver breakdown matched the resolved outcome closely.' },
    { id: 'cal-2', date: '2026-07-26', who: 'Bilal Baig', serial: '•••7754', predicted: 'requires-descent', withinHours: 6, likelihoodPct: 74, whatHappened: 'Continued to Camp III without incident; SpO2 recovered on its own overnight.', correct: false, notes: "A confident miss. Oxygen recovery rate was slower than baseline but never crossed the clinical floor — the model over-weighted the wind-exposure driver for this person's own acclimatisation profile." },
    { id: 'cal-3', date: '2026-07-24', who: 'Ji-woo Choi', serial: '•••1198', predicted: 'requires-review', withinHours: 8, likelihoodPct: 58, whatHappened: 'Lead guide overruled the review flag — assessed in person as fatigued but sound, continued ascent, no incident.', correct: true, notes: 'A correct call a human overruled anyway: the guide’s in-person read agreed with the eventual outcome, not the flag itself, but got there independently. Recorded here in full, not filtered out.' },
    { id: 'cal-4', date: '2026-07-22', who: 'Rohan Kapoor', serial: '•••5567', predicted: 'watch', withinHours: 12, likelihoodPct: 34, whatHappened: 'Escalated to requires-review at hour 9 as cognitive indicators worsened; descended voluntarily at hour 11.', correct: true, notes: 'Watch correctly flagged early deterioration before it became urgent.' },
    { id: 'cal-5', date: '2026-07-19', who: 'Saltanat Nurlanov', serial: '•••3342', predicted: 'requires-descent', withinHours: 4, likelihoodPct: 71, whatHappened: 'Descended at 3 h 50 m as predicted.', correct: true, notes: '' },
    { id: 'cal-6', date: '2026-07-17', who: 'Tomasz Zieliński', serial: '•••8820', predicted: 'requires-review', withinHours: 10, likelihoodPct: 61, whatHappened: 'Reviewed by operator at hour 7, cleared to continue, no further incident.', correct: true, notes: '' },
    { id: 'cal-7', date: '2026-07-15', who: 'Zainab Malik', serial: '•••4471', predicted: 'watch', withinHours: 14, likelihoodPct: 22, whatHappened: 'Remained stable through the full window, resolved as ready.', correct: true, notes: '' },
    { id: 'cal-8', date: '2026-07-12', who: 'Emma Whitfield', serial: '•••9903', predicted: 'requires-descent', withinHours: 6, likelihoodPct: 66, whatHappened: 'Descended at hour 5, but for a different reason (equipment failure) than the predicted driver set.', correct: false, notes: 'Right outcome, wrong mechanism — counted as a partial miss in the by-driver breakdown, not a clean hit.' },
  ]

  const byDriver: DriverCalibrationRow[] = [
    { driver: 'Oxygen recovery vs own baseline', accuracyPct: 89, n: 42, note: 'Most reliable single signal.' },
    { driver: 'Wind above 70 kph exposure', accuracyPct: 76, n: 38, note: 'Can miss sudden changes.' },
    { driver: 'Cognitive slip indicators', accuracyPct: 71, n: 31, note: 'Inferential, improving with data.' },
    { driver: 'Rope separation widening', accuracyPct: 68, n: 28, note: 'Often a lagging indicator.' },
    { driver: 'Ascent rate alone', accuracyPct: 54, n: 35, note: 'Weak without context.' },
  ]

  return { reliability, resolved, byDriver, totalResolvedCases }
}

// -- per-person prediction builder --------------------------------------------

interface BuildPersonInput {
  climberId: string
  name: string
  serial: string
  record: IdentityRecord
  card: IdentityCard
  rng: Rng
  buildNowMs: number
  isHero: boolean
  ropePartner: { climberId: string; name: string; status: NodeStatus } | null
  routeMates: { climberId: string; name: string; card: IdentityCard; record: IdentityRecord }[]
  /** Only set for the hero (Nima Tamang) — the real SpO2/wind TracedValues to derive from, so the drivers are actually traceable, not narrated. */
  realEvidence: {
    spo2Baseline: TracedValue<number>
    spo2Current: TracedValue<number>
    windCurrent: TracedValue<number> | null
    windHeldOf: { holds: number; total: number }
    windLeadMinutes: number
  } | null
}

function pickRole(rng: Rng): 'climber' | 'sherpa' | 'guide' | 'client' {
  return rng.pick(['climber', 'climber', 'climber', 'sherpa', 'guide', 'client'] as const)
}

function buildPersonPrediction(input: BuildPersonInput): PersonPrediction {
  const { climberId, name, serial, record, card, rng, buildNowMs, isHero, ropePartner, routeMates, realEvidence } = input

  const anomalyStatus = statusFromAnomalyState(record.derived.anomalyState.value)
  const risk: RiskLevel = anomalyStatus === 'anomaly' ? 'critical' : anomalyStatus === 'watch' ? 'elevated' : 'watch'

  // -- likelihood / outcome, a real `predicted()` derivation ------------------
  const froms: TracedId[] = realEvidence ? [realEvidence.spo2Baseline.id, realEvidence.spo2Current.id] : [card.confidencePct.id]
  const likelihoodPct = isHero ? 68 : risk === 'critical' ? rng.int(58, 79) : risk === 'elevated' ? rng.int(30, 52) : rng.int(8, 26)
  const predictedOutcome: PredictedOutcome = likelihoodPct >= 60 ? 'requires-descent' : likelihoodPct >= 35 ? 'requires-review' : likelihoodPct >= 15 ? 'watch' : 'ready'
  const withinHours = isHero ? 6 : predictedOutcome === 'requires-descent' ? rng.int(2, 7) : predictedOutcome === 'requires-review' ? rng.int(6, 14) : rng.int(10, 20)
  const horizonMins = withinHours * 60
  const likelihoodTraced = predicted(froms, modelId('ase-decision-capacity-forecaster-v1'), horizonMins, likelihoodPct)

  const issuedAt = instant(new Date(buildNowMs - rng.int(1, 12) * 60000).toISOString())
  const resolvesAt = instant(new Date(buildNowMs + horizonMins * 60000).toISOString())

  // -- drivers ------------------------------------------------------------
  const drivers: Driver[] = []
  if (isHero && realEvidence) {
    const spo2DeltaPct = Math.round(((realEvidence.spo2Baseline.value - realEvidence.spo2Current.value) / realEvidence.spo2Baseline.value) * 100)
    drivers.push({
      id: 'driver-oxygen-recovery',
      label: `Oxygen recovery ${spo2DeltaPct}% slower than this person's own Camp II baseline`,
      kind: 'clinical',
      contributionPct: 31,
      evidence: `Camp II ${realEvidence.spo2Baseline.value}%, current ${realEvidence.spo2Current.value}%, trend falling`,
      authority: 'Clinical reference (Lake Louise acclimatisation guidance)',
      confidencePct: Math.round(confidence(realEvidence.spo2Current) * 100),
      heldOf: null,
    })
    drivers.push({
      id: 'driver-wind-exposure',
      label: 'Exposure to wind above 70 kph for 40 minutes',
      kind: 'clinical',
      contributionPct: 22,
      evidence: 'wind log, 78 kph sustained since the last full reading',
      authority: 'Operator SOP v3 — exposed-ridge limit',
      confidencePct: realEvidence.windCurrent ? Math.round(confidence(realEvidence.windCurrent) * 100) : 90,
      heldOf: null,
    })
    drivers.push({
      id: 'driver-learned-wind-oxygen',
      label: `Learned pattern — wind above 70 kph precedes oxygen decline by ${realEvidence.windLeadMinutes} minutes`,
      kind: 'learned',
      contributionPct: 15,
      evidence: `held in ${realEvidence.windHeldOf.holds} of ${realEvidence.windHeldOf.total} similar cases`,
      authority: 'Pattern Learning — wind-precedes-oxygen-decline',
      confidencePct: 78,
      heldOf: realEvidence.windHeldOf,
    })
    drivers.push({
      id: 'driver-cognitive-slip',
      label: 'Cognitive slip — latency +40 s, schedule +50 min, rope separation 12 m',
      kind: 'learned',
      contributionPct: 12,
      evidence: 'behavioural inference panel',
      authority: 'Pattern Learning — behavioural inference',
      confidencePct: 71,
      heldOf: null,
    })
    drivers.push({
      id: 'driver-ascent-discipline',
      label: 'Ascent discipline — continued 50 min past turnaround while partner stopped',
      kind: 'operator',
      contributionPct: 8,
      evidence: 'track against planned schedule',
      authority: 'Operator SOP v3',
      confidencePct: 84,
      heldOf: null,
    })
  } else {
    const driverPool: { label: string; kind: DriverKind; evidence: string; authority: string }[] = [
      { label: 'Oxygen recovery below this person’s own baseline', kind: 'clinical', evidence: 'sensor mesh, last 3 readings', authority: 'Clinical reference (Lake Louise acclimatisation guidance)' },
      { label: 'Resting heart rate elevated against baseline', kind: 'clinical', evidence: 'medical log vs sensor mesh', authority: 'Field correction — expedition physician, 2026-01' },
      { label: 'Ascent rate faster than the body can adjust', kind: 'clinical', evidence: 'position log, last 24 h', authority: 'Wilderness Medical Society ascent-rate guidance' },
      { label: 'Schedule slip against the filed ascent plan', kind: 'operator', evidence: 'track against planned schedule', authority: 'Operator SOP v3' },
      { label: 'Rope separation widening from partner', kind: 'learned', evidence: 'position deltas, last hour', authority: 'Pattern Learning — partner-separation-cascade' },
    ]
    const count = risk === 'watch' ? 2 : rng.int(3, 4)
    const chosen = [...driverPool].sort(() => rng.float(-1, 1)).slice(0, count)
    const shares = distributeContributions(Math.min(likelihoodPct, 78), chosen.length, rng)
    chosen.forEach((d, i) => {
      drivers.push({
        id: `driver-${climberId}-${i}`,
        label: d.label,
        kind: d.kind,
        contributionPct: Math.max(3, shares[i]),
        evidence: d.evidence,
        authority: d.authority,
        confidencePct: Math.round(ruleAuthority(rng.float(0.55, 0.95)) * 100),
        heldOf: d.kind === 'learned' ? { holds: rng.int(20, 45), total: rng.int(46, 60) } : null,
      })
    })
  }

  // -- cognitive indicators — contributionPts sum EXACTLY to the deficit -----
  const decisionCapacity = isHero ? 45 : Math.max(10, Math.min(95, 100 - likelihoodPct - rng.int(-10, 15)))
  const deficit = 100 - decisionCapacity
  const shares = distributeContributions(deficit, COGNITIVE_INDICATOR_DEFS.length, rng)
  const indicators: CognitiveIndicator[] = COGNITIVE_INDICATOR_DEFS.map((def, i) => {
    const pts = shares[i]
    let current: string
    let vsBaseline: string
    switch (def.key) {
      case 'radio-latency':
        current = isHero ? '48 s' : `${rng.int(15, 55)} s`
        vsBaseline = isHero ? '+22 s' : `+${rng.int(2, 30)} s`
        break
      case 'ascent-deviation':
        current = isHero ? '+50 min' : `+${rng.int(5, 60)} min`
        vsBaseline = current
        break
      case 'rest-pattern':
        current = isHero ? 'erratic' : rng.pick(['regular', 'slightly irregular', 'erratic'])
        vsBaseline = 'was regular'
        break
      case 'rope-separation':
        current = isHero ? '12 m' : `${rng.int(2, 15)} m`
        vsBaseline = isHero ? '+8 m' : `+${rng.int(1, 10)} m`
        break
      case 'pace-variability':
        current = isHero ? 'high' : rng.pick(['low', 'moderate', 'high'])
        vsBaseline = isHero ? '+40%' : `+${rng.int(5, 45)}%`
        break
      case 'camp-overhold':
        current = isHero ? '+2 h' : `+${rng.float(0.2, 2.5).toFixed(1)} h`
        vsBaseline = current
        break
      case 'checkin-completeness':
        current = isHero ? 'partial' : rng.pick(['full', 'mostly full', 'partial'])
        vsBaseline = 'was full'
        break
      case 'decision-reversals':
        current = isHero ? '2' : String(rng.int(0, 3))
        vsBaseline = 'was 0'
        break
      default:
        current = '—'
        vsBaseline = '—'
    }
    return { key: def.key, label: def.label, current, vsBaseline, contributionPts: pts, tooltip: def.tooltip }
  })

  const environmentalLoad: LoadLevel = risk === 'critical' ? 'high' : risk === 'elevated' ? 'moderate' : 'low'
  const physiologicalLoad: LoadLevel = decisionCapacity < 55 ? 'high' : decisionCapacity < 75 ? 'moderate' : 'low'
  const workingMemory: 'normal' | 'reduced' | 'impaired' = decisionCapacity < 45 ? 'impaired' : decisionCapacity < 70 ? 'reduced' : 'normal'

  // -- 6-axis radar: baseline (this person, Camp II) vs current ---------------
  const baseline: RadarAxes = { acclimatisation: rng.int(70, 90), cardiacReserve: rng.int(70, 90), oxygenEfficiency: rng.int(75, 92), ascentDiscipline: rng.int(75, 95), cognitiveState: rng.int(80, 95), exposureLoad: rng.int(15, 30) }
  const deteriorationFactor = risk === 'critical' ? 0.45 : risk === 'elevated' ? 0.7 : 0.9
  const current: RadarAxes = {
    acclimatisation: Math.round(baseline.acclimatisation * deteriorationFactor),
    cardiacReserve: Math.round(baseline.cardiacReserve * (deteriorationFactor + 0.1)),
    oxygenEfficiency: isHero ? 62 : Math.round(baseline.oxygenEfficiency * deteriorationFactor),
    ascentDiscipline: Math.round(baseline.ascentDiscipline * (deteriorationFactor + 0.05)),
    cognitiveState: decisionCapacity,
    exposureLoad: Math.round(baseline.exposureLoad / deteriorationFactor),
  }

  // -- cascade: environment -> body -> mind -> decisions -----------------------
  const cascade: CascadeStage[] = [
    {
      key: 'environment',
      label: 'Environment',
      metrics: isHero
        ? [
            { label: 'Wind', valueText: '78 kph', deltaText: '↑ 12' },
            { label: 'Temperature', valueText: '-22°C', deltaText: '↓ 3' },
            { label: 'Visibility', valueText: '400 m', deltaText: '↓ 200' },
            { label: 'Freezing level', valueText: 'rose 200 m', deltaText: '' },
            { label: 'Pressure', valueText: '412 hPa', deltaText: '↓ 8' },
            { label: 'Solar radiation', valueText: '180 W/m²', deltaText: '' },
          ]
        : [
            { label: 'Wind', valueText: `${rng.int(30, 65)} kph`, deltaText: rng.bool() ? '↑ 6' : '↓ 4' },
            { label: 'Temperature', valueText: `${rng.int(-25, -10)}°C`, deltaText: '↓ 2' },
            { label: 'Visibility', valueText: `${rng.int(400, 2000)} m`, deltaText: '' },
          ],
      arrow: { sentence: 'Sustained wind above 70 kph raises exertion and slows oxygen recovery.', authority: 'clinical reference', confidencePct: 90, heldOf: null },
      decisions: [],
    },
    {
      key: 'body',
      label: 'Body',
      metrics: isHero
        ? [
            { label: 'Blood oxygen', valueText: `${realEvidence?.spo2Current.value ?? 81}%`, deltaText: '↓ 3' },
            { label: 'Heart rate', valueText: '134 bpm', deltaText: '↑ 12' },
            { label: 'Oxygen recovery', valueText: '40% slower than baseline', deltaText: '' },
            { label: 'Sleep quality', valueText: 'down 35%', deltaText: '' },
            { label: 'Core temperature estimate', valueText: '35.8°C', deltaText: '' },
            { label: 'Fluid intake', valueText: '0.8 L below plan', deltaText: '' },
          ]
        : [
            { label: 'Blood oxygen', valueText: `${rng.int(75, 92)}%`, deltaText: '↓ 2' },
            { label: 'Heart rate', valueText: `${rng.int(85, 125)} bpm`, deltaText: '↑ 6' },
            { label: 'Oxygen recovery', valueText: `${rng.int(5, 30)}% slower than baseline`, deltaText: '' },
          ],
      arrow: { sentence: 'Oxygen below 80% for more than 20 minutes measurably slows response time and degrades judgement at altitude.', authority: 'clinical reference', confidencePct: 92, heldOf: null },
      decisions: [],
    },
    {
      key: 'mind',
      label: 'Mind',
      metrics: isHero
        ? [
            { label: 'Response latency', valueText: '↑ 40 s', deltaText: '' },
            { label: 'Schedule slip', valueText: '+50 min', deltaText: '' },
            { label: 'Rest pattern', valueText: 'erratic', deltaText: '' },
            { label: 'Rope separation', valueText: 'widened to 12 m', deltaText: '' },
            { label: 'Decision reversals', valueText: '2 in the last hour', deltaText: '' },
            { label: 'Communication completeness', valueText: 'declining', deltaText: '' },
          ]
        : [
            { label: 'Response latency', valueText: `↑ ${rng.int(5, 30)} s`, deltaText: '' },
            { label: 'Schedule slip', valueText: `+${rng.int(0, 30)} min`, deltaText: '' },
            { label: 'Rope separation', valueText: `${rng.int(2, 10)} m`, deltaText: '' },
          ],
      arrow: {
        sentence: 'Slower judgement shows up as missed turnaround decisions and wider rope separation.',
        authority: `learned pattern, held ${isHero && realEvidence ? realEvidence.windHeldOf.holds : 33} of ${isHero && realEvidence ? realEvidence.windHeldOf.total : 45} times`,
        confidencePct: 74,
        heldOf: isHero && realEvidence ? realEvidence.windHeldOf : { holds: 33, total: 45 },
      },
      decisions: [],
    },
    {
      key: 'decisions',
      label: 'Decisions',
      metrics: [],
      arrow: null,
      decisions: isHero
        ? [
            { label: 'Ascent continued past turnaround', tag: 'critical' },
            { label: 'Rest stops shortened', tag: 'elevated' },
            { label: 'Route deviation', tag: 'elevated' },
            { label: 'Equipment check skipped', tag: 'critical' },
            { label: 'Partner communication reduced', tag: 'elevated' },
            { label: 'Turnaround deferred', tag: 'critical' },
          ]
        : [
            { label: 'Rest stops shortened', tag: risk === 'critical' ? 'elevated' : 'expected' },
            { label: 'Partner communication reduced', tag: risk === 'critical' ? 'critical' : 'expected' },
          ],
    },
  ]

  // -- timeline: hour by hour, observed then projected -------------------------
  const hours = ['16:00', '17:00', '18:00', '19:00', '20:00', '21:00']
  const timeline: TimelinePoint[] = hours.map((h, i) => {
    const observed = i <= 1
    const projected = observed ? baseline.cognitiveState - i * (baseline.cognitiveState - decisionCapacity) * 0.3 : decisionCapacity - (i - 1) * 4
    let marker: TimelinePoint['marker'] = null
    if (i === 3) marker = 'turnaround'
    if (i === 4) marker = 'critical-threshold'
    if (i === 5) marker = 'partner-separation'
    return { hourLabel: h, capacity: Math.max(5, Math.round(observed ? baseline.cognitiveState - i * 3 : projected)), observed, marker }
  })

  // -- patterns (person-scoped instances, banded not percentaged) --------------
  const patterns: DecisionPatternInstance[] = DECISION_PATTERN_DEFS.map((def, i) => {
    const libEntry = PATTERN_LIBRARY[i]
    const rate = decisionCapacity < 50 ? libEntry.frequencyPct / 100 + 0.25 : libEntry.frequencyPct / 100
    return {
      key: def.key,
      name: def.name,
      description: def.description,
      triggers: def.triggers,
      observableSigns: def.observableSigns,
      seenInThisPersonCount: isHero && i === 0 ? 2 : rng.int(0, 2),
      seenInThisPersonMostRecent: isHero && i === 0 ? 'Camp III last week' : rng.bool(0.3) ? `${rng.pick(['Camp I', 'Camp II', 'Camp III'])} ${rng.int(1, 3)} weeks ago` : null,
      mitigation: def.mitigation,
      mitigationEffect: def.mitigationEffect,
      likelihoodBand: bandFromSampleRate(rate),
      sampleSize: libEntry.frequencyPct >= 20 ? rng.int(28, 42) : rng.int(14, 27),
    }
  })

  // -- human connection ---------------------------------------------------
  const human: HumanConnection = ropePartner
    ? {
        partnerClimberId: ropePartner.climberId,
        partnerName: ropePartner.name,
        partnerRisk: ropePartner.status,
        distanceM: isHero ? 12 : rng.int(2, 40),
        lastContactMinutesAgo: isHero ? 22 : rng.int(3, 90),
        cohesionScore: isHero ? 41 : rng.int(40, 95),
      }
    : { partnerClimberId: null, partnerName: null, partnerRisk: null, distanceM: 0, lastContactMinutesAgo: 0, cohesionScore: 0 }

  // -- recommended action ---------------------------------------------------
  const recommendedAction = {
    action: predictedOutcome === 'requires-descent' ? `Recommend descent to Camp II within ${Math.min(2, withinHours)} hours.` : predictedOutcome === 'requires-review' ? `Recommend an in-person review within ${withinHours} hours.` : 'Continue monitoring — recheck at the next scheduled window.',
    why: `Oxygen recovery is ${isHero ? '40%' : `${rng.int(10, 40)}%`} below your baseline. At the current rate, decision capacity falls below the safe threshold by ${timeline[4].hourLabel}.`,
    confidencePct: isHero ? 89 : Math.round(ruleAuthority(rng.float(0.6, 0.92)) * 100),
    ifNothing: `${likelihoodPct}% probability of requiring emergency descent within ${withinHours} hours.`,
  }

  // -- cluster --------------------------------------------------------------
  const cluster: ClusterMember[] = [{ climberId, name, serial, relation: 'self', predicted: predictedOutcome, withinHours, likelihoodPct, risk }]
  if (ropePartner) {
    cluster.push({
      climberId: ropePartner.climberId,
      name: ropePartner.name,
      serial: '',
      relation: 'rope partner',
      predicted: ropePartner.status === 'anomaly' ? 'requires-review' : 'watch',
      withinHours: rng.int(3, 8),
      likelihoodPct: ropePartner.status === 'anomaly' ? rng.int(35, 55) : rng.int(15, 34),
      risk: ropePartner.status === 'anomaly' ? 'elevated' : 'watch',
    })
  }
  for (const mate of routeMates.slice(0, 2)) {
    const mateAnomaly = statusFromAnomalyState(mate.record.derived.anomalyState.value)
    cluster.push({
      climberId: mate.climberId,
      name: mate.name,
      serial: '',
      relation: 'route mate',
      predicted: mateAnomaly === 'anomaly' ? 'requires-review' : mateAnomaly === 'watch' ? 'watch' : 'ready',
      withinHours: rng.int(6, 14),
      likelihoodPct: mateAnomaly === 'anomaly' ? rng.int(35, 50) : mateAnomaly === 'watch' ? rng.int(15, 30) : rng.int(5, 14),
      risk: mateAnomaly === 'anomaly' ? 'elevated' : 'watch',
    })
  }

  // -- readings (Profile's "last three readings") -----------------------------
  const readings: ReadingTrend[] = isHero && realEvidence
    ? [{ label: 'Blood oxygen', points: [realEvidence.spo2Baseline.value, realEvidence.spo2Baseline.value - 3, realEvidence.spo2Current.value], trend: 'falling' }]
    : [{ label: 'Blood oxygen', points: [rng.int(85, 94), rng.int(80, 90), rng.int(75, 88)], trend: rng.bool() ? 'falling' : 'steady' }]

  const status: PredictionStatus = isHero ? 'open' : rng.pick(['open', 'open', 'open', 'acknowledged'] as const)

  return {
    climberId,
    name,
    serial,
    role: pickRole(rng),
    risk,
    position: {
      label: card.footer.camp.value,
      altitudeM: card.footer.altitudeM.value,
      altitudeDeltaM: rng.int(-40, 120),
      movement: rng.pick(['ascending', 'stationary', 'descending'] as const),
    },
    human,
    predicted: predictedOutcome,
    withinHours,
    likelihoodPct,
    likelihoodTraced,
    issuedAt,
    resolvesAt,
    status,
    drivers,
    cognitive: { indicators, decisionCapacity, environmentalLoad, physiologicalLoad, workingMemory },
    baseline,
    current,
    cascade,
    timeline,
    patterns,
    recommendedAction,
    cluster,
    readings,
  }
}

// -- top-level builder ----------------------------------------------------

export interface BuildPredictionsInput {
  climbers: ClimberFact[]
  identityRecords: Map<string, IdentityRecord>
  identityCards: Map<string, IdentityCard>
  detectionEngine: DetectionEngineState
  nimaClimberId: string
  nimaSpo2Baseline: TracedValue<number>
  nimaSpo2Current: TracedValue<number>
  rng: Rng
  buildNowMs: number
}

export function buildPredictions(input: BuildPredictionsInput): PredictionState {
  const { climbers, identityRecords, identityCards, detectionEngine, nimaClimberId, nimaSpo2Baseline, nimaSpo2Current, rng, buildNowMs } = input

  const windDetection = detectionEngine.detections.find((d) => d.ruleId === 'rule-dangerous-wind')
  const windRule = detectionEngine.rules.find((r) => r.id === 'rule-dangerous-wind')

  function personFor(climberId: string) {
    const record = identityRecords.get(climberId)
    const card = identityCards.get(climberId)
    if (!record || !card) return null
    return { record, card, name: record.who.fullLegalName.value, serial: record.serial.value }
  }

  function ropePartnerFor(card: IdentityCard) {
    const assoc = card.associates.find((a) => a.kind === 'rope_partner' && a.climberId)
    if (!assoc?.climberId) return null
    const p = personFor(assoc.climberId)
    if (!p) return null
    return { climberId: assoc.climberId, name: p.name, status: assoc.status }
  }

  function routeMatesFor(climberId: string, routeName: string) {
    const mates: { climberId: string; name: string; card: IdentityCard; record: IdentityRecord }[] = []
    for (const [id, card] of identityCards) {
      if (id === climberId) continue
      if (card.routeName.value !== routeName) continue
      const record = identityRecords.get(id)
      if (!record) continue
      mates.push({ climberId: id, name: record.who.fullLegalName.value, card, record })
    }
    return mates
  }

  // -- pick who has an open prediction: the hero plus everyone the graph
  // already flagged watch/anomaly, topped up with a deterministic sample so
  // List always has enough rows to be worth building a dashboard for.
  const flagged = climbers
    .map((c) => c.id)
    .filter((id) => id !== nimaClimberId)
    .filter((id) => {
      const record = identityRecords.get(id)
      if (!record) return false
      return statusFromAnomalyState(record.derived.anomalyState.value) !== 'nominal'
    })
  const extra = climbers.map((c) => c.id).filter((id) => id !== nimaClimberId && !flagged.includes(id))
  const shuffledExtra = [...extra].sort(() => rng.float(-1, 1))
  const selectedIds = [nimaClimberId, ...flagged, ...shuffledExtra].slice(0, 9)

  const predictions = new Map<string, PersonPrediction>()
  const order: string[] = []

  for (const climberId of selectedIds) {
    const p = personFor(climberId)
    if (!p) continue
    const isHero = climberId === nimaClimberId
    const ropePartner = ropePartnerFor(p.card)
    const routeMates = routeMatesFor(climberId, p.card.routeName.value)

    const realEvidence = isHero
      ? {
          spo2Baseline: nimaSpo2Baseline,
          spo2Current: nimaSpo2Current,
          windCurrent: windDetection?.valueTraced ?? null,
          windHeldOf: { holds: 47, total: 52 },
          windLeadMinutes: windRule?.patternLeadMinutes ?? 18,
        }
      : null

    const prediction = buildPersonPrediction({
      climberId,
      name: p.name,
      serial: p.serial,
      record: p.record,
      card: p.card,
      rng,
      buildNowMs,
      isHero,
      ropePartner,
      routeMates,
      realEvidence,
    })
    predictions.set(climberId, prediction)
    order.push(climberId)
  }

  // Sort order by risk severity, then within-hours ascending — List's own
  // default sort, computed once here so every consumer sees the same order.
  const riskRank: Record<RiskLevel, number> = { critical: 0, elevated: 1, watch: 2 }
  order.sort((a, b) => {
    const pa = predictions.get(a)!
    const pb = predictions.get(b)!
    return riskRank[pa.risk] - riskRank[pb.risk] || pa.withinHours - pb.withinHours
  })

  return { predictions, order, calibration: buildCalibration(), patternLibrary: PATTERN_LIBRARY }
}

// Re-exported so consumers building "cognitive score = 100 - sum(contributions)"
// checks (tests, mostly) don't need to reimplement the invariant by hand.
export function sumContributions(indicators: CognitiveIndicator[]): number {
  return indicators.reduce((sum, i) => sum + i.contributionPts, 0)
}
