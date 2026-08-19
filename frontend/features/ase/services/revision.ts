// S9.11: REVISION — everything every other tab raised, closing the loop.
// Every queue item below is derived from a REAL signal already sitting in
// the graph (an unresolved conflict, a sub-60%-accuracy rule, an unbound
// Meaning field, a resolved-wrong prediction, a source with no
// corroboration) — never a second, narrated "things that need attention"
// list. The audit chain is a real hash-chained seal, computed here and
// re-verified by walking it, not decoration.

import { instant, sourceId, type Instant } from "./traced"
import { dependents, dependentsOfSource } from "./folds"
import { allUnboundFieldKeys, type ContextEngineState } from "./contextEngine"
import { needsTuning, type DetectionEngineState } from "./detection"
import type { Conflict } from "./conflict"
import type { PredictionState } from "./prediction"
import type { IdentityRecord } from "./identityRecord"
import type { IdentityCard } from "./identityCard"
import type { Rng } from "./rng"

// -- shared vocabulary --------------------------------------------------------

export type QueueSourceTab =
  | "model"
  | "identity"
  | "meaning"
  | "detection"
  | "prediction"
  | "exposure"
  | "trust"
export type Priority = "critical" | "standard" | "backlog"
export type OwnerState =
  | { kind: "unassigned" }
  | { kind: "assigned"; name: string }
  | { kind: "awaiting-second-opinion"; name: string }
export type OverruleReason =
  | "conditions-changed"
  | "local-knowledge"
  | "equipment-malfunction"
  | "person-refused"
  | "false-positive"
  | "other"
export const OVERRULE_REASON_LABEL: Record<OverruleReason, string> = {
  "conditions-changed": "Conditions changed",
  "local-knowledge": "Local knowledge",
  "equipment-malfunction": "Equipment malfunction",
  "person-refused": "Person refused",
  "false-positive": "False positive",
  other: "Other",
}
export type ResolutionStage =
  | "open"
  | "under-review"
  | "resolved-correct"
  | "resolved-wrong"
  | "overruled"
  | "closed"
export type QueueItemKind =
  | "conflict"
  | "model-conflict"
  | "tuning"
  | "unbound-field"
  | "prediction-wrong"
  | "prediction-pattern-missed"
  | "prediction-overruled"
  | "single-source"
  | "decision-challenged"
  | "budget-violation"
export type QueueAction =
  "approve" | "reject" | "correct" | "annotate" | "defer"

export interface QueueRecommendation {
  action: string
  why: string
  confidencePct: number
  ifNothing: string
}

export interface NamedPerson {
  machineId: string
  name: string
  serial: string
}

export interface ImpactPreview {
  ifApprove: string[]
  ifReject: string[]
  ifWaitHours: number
  ifWaitNote: string
  namedAffected: NamedPerson[]
  secondOrder: string[]
  humanBurdenNote: string | null
  newQueueItems: number
  rollbackNote: string
  calibrationImpact: string | null
}

export interface PatternWatchWindow {
  patternName: string
  windowHours: number
  expiredAt: Instant
}

export interface QueueItem {
  id: string
  kind: QueueItemKind
  priority: Priority
  fromTab: QueueSourceTab
  what: string
  about: string
  aboutMachineIds: string[]
  owner: OwnerState
  raisedAt: Instant
  blastRadius: number
  blockedByIds: string[]
  recommendation: QueueRecommendation
  whyAmISeeingThis: string
  resolutionStage: ResolutionStage
  requiresWitness: boolean
  impact: ImpactPreview
  patternWatchWindow: PatternWatchWindow | null
  conflict: Conflict | null
}

// -- audit chain (Record) ------------------------------------------------

export type AuditActionKind =
  | "approved"
  | "rejected"
  | "overruled"
  | "widened-model"
  | "corrected"
  | "annotated"
  | "deferred"
export interface AuditAttachment {
  kind: "voice-note" | "photo" | "transcript"
  label: string
}
export interface AuditRecordEntry {
  id: string
  at: Instant
  who: string
  actionKind: AuditActionKind
  actionLabel: string
  aboutMachineId: string | null
  aboutSerial: string | null
  aboutLabel: string
  whatChanged: string
  witness: string | null
  witnessPending: boolean
  attachments: AuditAttachment[]
  correctionOfId: string | null
  overruleReason: OverruleReason | null
  fromTab: QueueSourceTab | null
  seal: string
}

/** A small, deterministic hash chained to the previous entry's seal — an entry's seal changes if EITHER its own content or anything before it in the chain changes, which is what makes "green intact, red broken" a real check, not a colour someone picked. */
export function computeSeal(
  entry: Omit<AuditRecordEntry, "seal">,
  previousSeal: string
): string {
  const material = `${previousSeal}|${entry.id}|${entry.at}|${entry.who}|${entry.actionKind}|${entry.aboutSerial ?? ""}|${entry.whatChanged}|${entry.witness ?? ""}`
  let h = 0x811c9dc5
  for (let i = 0; i < material.length; i++) {
    h ^= material.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, "0")
}

/** Re-walks the whole chain and reports the first broken link, if any — what a VERIFY action actually does, not a canned "all good." */
export function verifyChain(entries: AuditRecordEntry[]): {
  intact: boolean
  brokenAtId: string | null
} {
  let previousSeal = "genesis"
  for (const entry of entries) {
    const recomputed = computeSeal(entry, previousSeal)
    if (recomputed !== entry.seal)
      return { intact: false, brokenAtId: entry.id }
    previousSeal = entry.seal
  }
  return { intact: true, brokenAtId: null }
}

function sealChain(
  entries: Omit<AuditRecordEntry, "seal">[]
): AuditRecordEntry[] {
  let previousSeal = "genesis"
  const sealed: AuditRecordEntry[] = []
  for (const e of entries) {
    const seal = computeSeal(e, previousSeal)
    sealed.push({ ...e, seal })
    previousSeal = seal
  }
  return sealed
}

// -- Learning ---------------------------------------------------------------

export interface LearningFigure {
  key: string
  label: string
  value: string
  deltaNote: string
}
export interface ModelChange {
  id: string
  what: string
  before: string
  after: string
  who: string
  measuredEffect: string
  madeThingsWorse: boolean
  revertImpact: string | null
}
export interface RegressionResult {
  id: string
  change: string
  tabsChecked: QueueSourceTab[]
  verdict: "pass" | "fail"
  note: string
}
export interface DriftSignal {
  id: string
  metric: string
  changePct: number
  direction: "up" | "down"
  period: string
  possibleCause: string
}
export interface DriverImportanceEntry {
  driver: string
  rankLastMonth: number
  rankNow: number
}
export interface HumanVsAse {
  humanOverruleCorrectPct: number
  humanOverruleN: number
  aseCorrectWhenNotOverruledPct: number
  aseN: number
}
export interface PredictionFeedback {
  wrongPredictions: { who: string; serial: string; implicatedDriver: string }[]
  missedPatterns: {
    pattern: string
    count: number
    expiredWatchWindows: number
  }[]
  overruledByReason: { reason: OverruleReason; count: number }[]
}
export interface QaSample {
  id: string
  what: string
  status: "pending" | "confirmed-correct" | "found-error"
}
export interface ModelVersion {
  version: string
  what: string
  recomputedCount: number
  at: Instant
}

// -- Timeline -----------------------------------------------------------

export type TimelineLayer = "system" | "external" | "upcoming" | "annotation"
export type TimelineSeverity = "low" | "medium" | "high" | "incident"
export interface TimelineEvent {
  id: string
  at: Instant
  layer: TimelineLayer
  severity: TimelineSeverity
  label: string
  detail: string
}
export interface EventCluster {
  id: string
  startAt: Instant
  endAt: Instant
  eventIds: string[]
  question: string
}
export interface Investigation {
  id: string
  openedAt: Instant
  by: string
  touched: string
  outcome: string
  durationMinutes: number
  concludedNoAction: boolean
}
export interface AsOfBelief {
  at: Instant
  machineId: string
  name: string
  serial: string
  believedPct: number
  outcome: string
  wasCorrect: boolean
}

export interface RevisionState {
  queue: QueueItem[]
  auditSeed: AuditRecordEntry[]
  retentionYears: number
  retentionCount: number
  overruleTally: { total: number; aseCorrectCount: number }
  learningFigures: LearningFigure[]
  modelChanges: ModelChange[]
  regressionResults: RegressionResult[]
  driftSignals: DriftSignal[]
  driverImportance: DriverImportanceEntry[]
  humanVsAse: HumanVsAse
  predictionFeedback: PredictionFeedback
  qaSamples: QaSample[]
  modelVersions: ModelVersion[]
  timelineEvents: TimelineEvent[]
  eventClusters: EventCluster[]
  investigations: Investigation[]
  asOfBeliefs: AsOfBelief[]
}

// -- builder ----------------------------------------------------------------

export interface BuildRevisionInput {
  conflicts: Conflict[]
  detectionEngine: DetectionEngineState
  contextEngine: ContextEngineState
  predictions: PredictionState
  identityRecords: Map<string, IdentityRecord>
  identityCards: Map<string, IdentityCard>
  rng: Rng
  buildNowMs: number
}

function personOf(
  identityRecords: Map<string, IdentityRecord>,
  machineId: string
): NamedPerson | null {
  const r = identityRecords.get(machineId)
  if (!r) return null
  return { machineId, name: r.who.fullLegalName.value, serial: r.serial.value }
}

export function buildRevisionState(input: BuildRevisionInput): RevisionState {
  const {
    conflicts,
    detectionEngine,
    contextEngine,
    predictions,
    identityRecords,
    rng,
    buildNowMs,
  } = input

  const queue: QueueItem[] = []

  // -- MODEL: the line-as-recorded conflict — "a record does not fit
  // the model" is literally true here, since S9.6's card carries a
  // declared value the canonical model itself refuses to store.
  const linePrefixConflict = conflicts.find(
    (c) => c.propertyLabel === "Line (as recorded)"
  )
  if (linePrefixConflict) {
    const affected = Array.from(identityRecords.entries()).find(
      ([, r]) => r.who.fullLegalName.value === linePrefixConflict.entityLabel
    )
    const affectedPerson = affected
      ? personOf(identityRecords, affected[0])
      : null
    const blastRadius = linePrefixConflict.resolved
      ? dependents(linePrefixConflict.resolved.id).length
      : 0
    queue.push({
      id: "queue-model-line-prefix",
      kind: "model-conflict",
      priority: "backlog",
      fromTab: "model",
      what: "a declared value the model does not carry a category for",
      about: "linePrefix, as recorded on the source document",
      aboutMachineIds: affectedPerson ? [affectedPerson.machineId] : [],
      owner: { kind: "unassigned" },
      raisedAt: instant(new Date(buildNowMs - 2 * 3600000).toISOString()),
      blastRadius,
      blockedByIds: [],
      recommendation: {
        action:
          "Accept the declared value as a document-quoted field, not a model category",
        why: "The CMMS and operator register disagree on a self-declared linePrefix — a real document mismatch, not a data error.",
        confidencePct: 74,
        ifNothing:
          "The Source Records card keeps showing an unresolved conflict badge for this one field.",
      },
      whyAmISeeingThis:
        "A source document carries a value the canonical identity model deliberately never stores as a category. Someone should confirm the Source Records card is handling it correctly.",
      resolutionStage: "open",
      requiresWitness: false,
      impact: {
        ifApprove: [
          "the Source Records card keeps the declared value, labelled as document-quoted",
          "no change to the canonical identity record",
        ],
        ifReject: ["the field is cleared pending a corrected document"],
        ifWaitHours: 4,
        ifWaitNote: "a low-stakes field — waiting costs nothing operationally",
        namedAffected: affectedPerson ? [affectedPerson] : [],
        secondOrder: [],
        humanBurdenNote: null,
        newQueueItems: 0,
        rollbackNote:
          "reversible at any time — this never touches the canonical record",
        calibrationImpact: null,
      },
      patternWatchWindow: null,
      conflict: linePrefixConflict,
    })
  }

  // -- IDENTITY: the mountains-climbed conflict — genuinely 'human-required',
  // nobody has decided.
  const mountainsConflict = conflicts.find(
    (c) => c.propertyLabel === "Mountains climbed"
  )
  if (mountainsConflict) {
    const affected = Array.from(identityRecords.entries()).find(
      ([, r]) => r.who.fullLegalName.value === mountainsConflict.entityLabel
    )
    const affectedPerson = affected
      ? personOf(identityRecords, affected[0])
      : null
    const blastRadius = dependents(mountainsConflict.a.id).length
    queue.push({
      id: "queue-identity-mountains",
      kind: "conflict",
      priority: "standard",
      fromTab: "identity",
      what: "a self-reported value disagrees with the register and needs a human call",
      about: affectedPerson
        ? `${affectedPerson.name} · mountains climbed`
        : mountainsConflict.entityLabel,
      aboutMachineIds: affectedPerson ? [affectedPerson.machineId] : [],
      owner: { kind: "unassigned" },
      raisedAt: instant(new Date(buildNowMs - 20 * 60000).toISOString()),
      blastRadius,
      blockedByIds: [],
      recommendation: {
        action:
          "Accept the register figure (more recently verified) over the self-report",
        why: "The register entry is 45 hours older but independently verified; the self-report has no supporting document.",
        confidencePct: 61,
        ifNothing:
          "This record stays flagged and cannot be auto-validated at the next checkpoint.",
      },
      whyAmISeeingThis:
        "This property's resolution policy is deliberately 'human required' — no automatic rule is trusted to pick a winner here.",
      resolutionStage: "open",
      requiresWitness: false,
      impact: {
        ifApprove: [
          "the register figure becomes the record of truth",
          "downstream prior-campaigns figures recompute",
        ],
        ifReject: [
          "the self-reported figure stands instead",
          "flagged for a second source next check-in",
        ],
        ifWaitHours: 2,
        ifWaitNote:
          "deferring costs nothing here — nothing downstream is time-critical on this field",
        namedAffected: affectedPerson ? [affectedPerson] : [],
        secondOrder: [],
        humanBurdenNote: null,
        newQueueItems: 1,
        rollbackNote:
          "reversible for 24 hours by changing the resolution policy again",
        calibrationImpact: null,
      },
      patternWatchWindow: null,
      conflict: mountainsConflict,
    })
  }

  // -- DETECTION: a sub-60%-accuracy rule fires more often than it should.
  const tuningRule =
    detectionEngine.rules.find(
      (r) => needsTuning(r) && r.id === "rule-pressure-mismatch"
    ) ?? detectionEngine.rules.find((r) => needsTuning(r))
  if (tuningRule) {
    queue.push({
      id: "queue-detection-tuning",
      kind: "tuning",
      priority: "standard",
      fromTab: "detection",
      what: "a rule fires more often than it should",
      about: tuningRule.label.toLowerCase(),
      aboutMachineIds: [],
      owner: { kind: "assigned", name: "S. Chen" },
      raisedAt: instant(new Date(buildNowMs - 20 * 60000).toISOString()),
      blastRadius: 12,
      blockedByIds: [],
      recommendation: {
        action:
          "Retune the threshold — see Detection → Tuning for the specific suggested value",
        why: `${tuningRule.label} is right only ${Math.round(tuningRule.accuracy * 100)}% of the time at its current threshold.`,
        confidencePct: 80,
        ifNothing:
          "The rule keeps firing at its current, unreliable threshold.",
      },
      whyAmISeeingThis:
        "Any rule below 60% accuracy is surfaced here automatically — the same threshold Detection uses for its own NEEDS TUNING badge.",
      resolutionStage: "open",
      requiresWitness: false,
      impact: {
        ifApprove: [
          "the threshold moves to the suggested value",
          "firing count and false-alarm rate both drop",
        ],
        ifReject: [
          "the rule keeps its current threshold",
          "flagged again on the next accuracy review",
        ],
        ifWaitHours: 6,
        ifWaitNote:
          "low urgency — a miscalibrated threshold degrades trust slowly, not suddenly",
        namedAffected: [],
        secondOrder: [
          "every open detection under this rule gets re-evaluated at the new threshold",
        ],
        humanBurdenNote: null,
        newQueueItems: 0,
        rollbackNote:
          "the previous threshold is one click away in Detection → Tuning",
        calibrationImpact: null,
      },
      patternWatchWindow: null,
      conflict: null,
    })
  }

  // -- MEANING: a field ASE does not understand (genuinely unbound).
  const unboundKeys = allUnboundFieldKeys(contextEngine)
  if (unboundKeys.length > 0) {
    const key = unboundKeys[0]
    queue.push({
      id: "queue-meaning-unbound",
      kind: "unbound-field",
      priority: "backlog",
      fromTab: "meaning",
      what: "a field ASE does not understand",
      about: key,
      aboutMachineIds: [],
      owner: { kind: "unassigned" },
      raisedAt: instant(new Date(buildNowMs - 60 * 60000).toISOString()),
      blastRadius: 0,
      blockedByIds: [],
      recommendation: {
        action: `Add a meaning rule for "${key}"`,
        why: "This field has arrived from a source but has no rule binding it to a business meaning yet.",
        confidencePct: 55,
        ifNothing:
          "Every reading carrying this field keeps arriving unbound, contributing nothing to coverage.",
      },
      whyAmISeeingThis:
        "Any field with no meaning rule at all is surfaced here — it never resolves itself.",
      resolutionStage: "open",
      requiresWitness: false,
      impact: {
        ifApprove: [
          `"${key}" becomes a bound field for every future reading that carries it`,
          "Meaning coverage rises",
        ],
        ifReject: ["the field stays unbound, explicitly ignored"],
        ifWaitHours: 24,
        ifWaitNote:
          "no operational cost to waiting — this is a coverage/completeness item, not a safety one",
        namedAffected: [],
        secondOrder: [],
        humanBurdenNote: null,
        newQueueItems: 0,
        rollbackNote: "a meaning rule can be removed at any time",
        calibrationImpact: null,
      },
      patternWatchWindow: null,
      conflict: null,
    })
  }

  // -- PREDICTION, three kinds -------------------------------------------
  const wrongCase = predictions.calibration.resolved.find((r) => !r.correct)
  if (wrongCase) {
    queue.push({
      id: "queue-prediction-wrong",
      kind: "prediction-wrong",
      priority: "standard",
      fromTab: "prediction",
      what: "a prediction resolved wrongly",
      about: `${wrongCase.who} ${wrongCase.serial}, ${wrongCase.withinHours}h`,
      aboutMachineIds: [],
      owner: { kind: "unassigned" },
      raisedAt: instant(new Date(buildNowMs - 35 * 60000).toISOString()),
      blastRadius: 1,
      blockedByIds: [],
      recommendation: {
        action:
          "Mark the vibration-exposure driver as implicated for this case",
        why: wrongCase.notes,
        confidencePct: 66,
        ifNothing:
          "The miss is recorded in Calibration but not traced to a specific driver for Learning to act on.",
      },
      whyAmISeeingThis:
        "Every resolved-wrong prediction needs a human to identify which driver over- or under-weighted, so Learning can track it.",
      resolutionStage: "resolved-wrong",
      requiresWitness: false,
      impact: {
        ifApprove: [
          "the vibration-exposure driver accuracy figure in Calibration updates",
          "this case is added to Learning's prediction feedback loop",
        ],
        ifReject: ["no driver is implicated — recorded as an unexplained miss"],
        ifWaitHours: 12,
        ifWaitNote:
          "no urgency — the case is already resolved, this only affects how it is attributed",
        namedAffected: [],
        secondOrder: [],
        humanBurdenNote: null,
        newQueueItems: 0,
        rollbackNote:
          "driver attribution can be corrected later without losing the original record",
        calibrationImpact: `Marking this prediction wrong moves the 70% bucket toward its true observed rate — currently ${predictions.calibration.reliability.find((b) => b.predictedPct === 70)?.observedPct ?? 66}% observed.`,
      },
      patternWatchWindow: null,
      conflict: null,
    })
  }

  const heroPrediction = Array.from(predictions.predictions.values())[0]
  if (heroPrediction) {
    const missedPattern =
      heroPrediction.patterns[1] ?? heroPrediction.patterns[0]
    if (missedPattern) {
      queue.push({
        id: "queue-prediction-pattern-missed",
        kind: "prediction-pattern-missed",
        priority: "standard",
        fromTab: "prediction",
        what: "a predicted pattern did not appear",
        about: missedPattern.name.toLowerCase(),
        aboutMachineIds: [heroPrediction.machineId],
        owner: { kind: "unassigned" },
        raisedAt: instant(new Date(buildNowMs - 60 * 60000).toISOString()),
        blastRadius: 1,
        blockedByIds: [],
        recommendation: {
          action: "Close the watch window as unfulfilled",
          why: `${missedPattern.name} was predicted within the forecast window and did not appear — a real negative signal, not nothing.`,
          confidencePct: 70,
          ifNothing:
            "The window stays open indefinitely instead of recording a clean non-appearance.",
        },
        whyAmISeeingThis:
          "A pattern that didn't appear is as much a learning signal as one that did — nothing else in the product records it.",
        resolutionStage: "closed",
        requiresWitness: false,
        impact: {
          ifApprove: [
            "the pattern is recorded as a non-appearance",
            "Learning's missed-pattern count for this pattern increments",
          ],
          ifReject: ["the window is extended instead of closed"],
          ifWaitHours: 1,
          ifWaitNote:
            "the window has already closed — waiting only delays recording it",
          namedAffected: [
            {
              machineId: heroPrediction.machineId,
              name: heroPrediction.name,
              serial: heroPrediction.serial,
            },
          ],
          secondOrder: [],
          humanBurdenNote: null,
          newQueueItems: 0,
          rollbackNote: "can be reopened if the pattern appears late",
          calibrationImpact: null,
        },
        patternWatchWindow: {
          patternName: missedPattern.name,
          windowHours: 2,
          expiredAt: instant(new Date(buildNowMs - 5 * 60000).toISOString()),
        },
        conflict: null,
      })
    }
  }

  const overruledCase = predictions.calibration.resolved.find((r) =>
    r.notes.toLowerCase().includes("overrul")
  )
  if (overruledCase) {
    queue.push({
      id: "queue-prediction-overruled",
      kind: "prediction-overruled",
      priority: "critical",
      fromTab: "prediction",
      what: "a recommendation was overruled",
      about: `${overruledCase.who} ${overruledCase.serial}, descent`,
      aboutMachineIds: [],
      owner: { kind: "unassigned" },
      raisedAt: instant(new Date(buildNowMs - 50 * 60000).toISOString()),
      blastRadius: 2,
      blockedByIds: [],
      recommendation: {
        action: "Record the structured overrule reason",
        why: "A human overrule with no structured reason cannot feed the human-versus-ASE figures in Learning.",
        confidencePct: 90,
        ifNothing:
          "This overrule is invisible to the human-versus-ASE tracking in Learning.",
      },
      whyAmISeeingThis:
        "Every overruled recommendation needs a structured reason recorded — free text alone is not enough for Learning to act on it.",
      resolutionStage: "overruled",
      requiresWitness: true,
      impact: {
        ifApprove: [
          "the overrule reason is recorded and feeds Learning's human-vs-ASE figures",
          "the queue item closes",
        ],
        ifReject: ["the overrule stands unexplained"],
        ifWaitHours: 1,
        ifWaitNote:
          "this already happened — waiting only delays recording it properly",
        namedAffected: [],
        secondOrder: [],
        humanBurdenNote: null,
        newQueueItems: 0,
        rollbackNote:
          "the recorded reason can be corrected, but never silently overwritten — see Record",
        calibrationImpact: null,
      },
      patternWatchWindow: null,
      conflict: null,
    })
  }

  // -- EXPOSURE: a conclusion rests on a single source, no corroboration.
  const weatherDependents = dependentsOfSource(sourceId("weather-feed"))
  if (weatherDependents.length > 0) {
    queue.push({
      id: "queue-exposure-single-source",
      kind: "single-source",
      priority: "backlog",
      fromTab: "exposure",
      what: "a conclusion rests on a single source",
      about: "metrology lab",
      aboutMachineIds: [],
      owner: { kind: "unassigned" },
      raisedAt: instant(new Date(buildNowMs - 60 * 60000).toISOString()),
      blastRadius: weatherDependents.length,
      blockedByIds: [],
      recommendation: {
        action: "Add a second weather source for corroboration",
        why: `${weatherDependents.length} facts currently depend on the metrology lab alone, with no independent source to cross-check against.`,
        confidencePct: 68,
        ifNothing:
          "Every one of those facts stays exposed to a single point of failure — if the metrology lab is wrong, nothing catches it.",
      },
      whyAmISeeingThis:
        "Any fact that traces back to exactly one source, with no independent corroboration, is surfaced here.",
      resolutionStage: "open",
      requiresWitness: false,
      impact: {
        ifApprove: [
          "a second weather source is requested from operations",
          `${weatherDependents.length} facts gain a corroboration path once it arrives`,
        ],
        ifReject: [
          "the single-source dependency is accepted as a known limitation",
        ],
        ifWaitHours: 12,
        ifWaitNote:
          "not urgent on its own — this is exposure to a risk, not an active problem",
        namedAffected: [],
        secondOrder: [
          "every detection and prediction driver that reads vibration or effectiveness inherits this same exposure",
        ],
        humanBurdenNote: `${weatherDependents.length} facts across the graph are affected — confirming this is not a small, contained item`,
        newQueueItems: 0,
        rollbackNote: "no action taken yet — nothing to roll back",
        calibrationImpact: null,
      },
      patternWatchWindow: null,
      conflict: null,
    })
  }

  // priority + age sort
  const priorityRank: Record<Priority, number> = {
    critical: 0,
    standard: 1,
    backlog: 2,
  }
  queue.sort(
    (a, b) =>
      priorityRank[a.priority] - priorityRank[b.priority] ||
      new Date(a.raisedAt).getTime() - new Date(b.raisedAt).getTime()
  )

  // -- RECORD: a seeded, coherent audit history, seals chained oldest-first.
  const unsealed: Omit<AuditRecordEntry, "seal">[] = [
    {
      id: "audit-1",
      at: instant(new Date(buildNowMs - 20 * 3600000).toISOString()),
      who: "S. Chen",
      actionKind: "approved",
      actionLabel: "approved a merge",
      aboutMachineId: null,
      aboutSerial: "•••7741",
      aboutLabel: "the worked-example machine",
      whatChanged: "three records became one, 14 conclusions recomputed",
      witness: "R. Gurung",
      witnessPending: false,
      attachments: [],
      correctionOfId: null,
      overruleReason: null,
      fromTab: "identity",
    },
    {
      id: "audit-2",
      at: instant(new Date(buildNowMs - 19.9 * 3600000).toISOString()),
      who: "S. Chen",
      actionKind: "widened-model",
      actionLabel: "widened the model",
      aboutMachineId: null,
      aboutSerial: null,
      aboutLabel: "linePrefix value",
      whatChanged: "one more declared value accepted, model v1.15",
      witness: null,
      witnessPending: false,
      attachments: [],
      correctionOfId: null,
      overruleReason: null,
      fromTab: "model",
    },
    {
      id: "audit-3",
      at: instant(new Date(buildNowMs - 15 * 3600000).toISOString()),
      who: "R. Gurung",
      actionKind: "overruled",
      actionLabel: "overruled a descent",
      aboutMachineId: null,
      aboutSerial: "•••2210",
      aboutLabel: "Tenzing Technician",
      whatChanged: "declined — local knowledge",
      witness: "S. Chen",
      witnessPending: false,
      attachments: [
        { kind: "voice-note", label: "voice note, 23s" },
        { kind: "photo", label: "line photo" },
      ],
      correctionOfId: null,
      overruleReason: "local-knowledge",
      fromTab: "prediction",
    },
    {
      id: "audit-4",
      at: instant(new Date(buildNowMs - 10 * 3600000).toISOString()),
      who: "S. Chen",
      actionKind: "corrected",
      actionLabel: "corrected an earlier entry",
      aboutMachineId: null,
      aboutSerial: "•••7741",
      aboutLabel: "the worked-example machine",
      whatChanged:
        "the merge's confidence figure was recorded as 94% originally; the fold actually resolves to 96% — corrected, original entry kept visible",
      witness: null,
      witnessPending: false,
      attachments: [],
      correctionOfId: "audit-1",
      overruleReason: null,
      fromTab: "identity",
    },
    {
      id: "audit-5",
      at: instant(new Date(buildNowMs - 6 * 3600000).toISOString()),
      who: "S. Chen",
      actionKind: "approved",
      actionLabel: "retuned a rule threshold",
      aboutMachineId: null,
      aboutSerial: null,
      aboutLabel: "pressure mismatch",
      whatChanged: "threshold moved, v1.14 → v1.15",
      witness: null,
      witnessPending: false,
      attachments: [],
      correctionOfId: null,
      overruleReason: null,
      fromTab: "detection",
    },
    {
      id: "audit-6",
      at: instant(new Date(buildNowMs - 3 * 3600000).toISOString()),
      who: "R. Gurung",
      actionKind: "annotated",
      actionLabel: "added an annotation",
      aboutMachineId: null,
      aboutSerial: "•••4412",
      aboutLabel: "the outlier machine",
      whatChanged:
        "noted: oxygen recovery trend matches last season’s pattern for this machine",
      witness: null,
      witnessPending: false,
      attachments: [],
      correctionOfId: null,
      overruleReason: null,
      fromTab: "prediction",
    },
    {
      id: "audit-7",
      at: instant(new Date(buildNowMs - 40 * 60000).toISOString()),
      who: "S. Chen",
      actionKind: "overruled",
      actionLabel: "overruled a review flag",
      aboutMachineId: null,
      aboutSerial: "•••1198",
      aboutLabel: "Ji-woo Choi",
      whatChanged: "assessed in person, cleared to continue",
      witness: null,
      witnessPending: true,
      attachments: [],
      correctionOfId: null,
      overruleReason: "conditions-changed",
      fromTab: "prediction",
    },
    // S9.12: Exposure writes into this SAME chain — no second audit trail of
    // its own. These two are real source events (Metrology lab is the one
    // genuinely degraded source in this dataset); Exposure's Activity view
    // is nothing more than `auditSeed.filter(e => e.fromTab === 'exposure')`.
    {
      id: "audit-8",
      at: instant(new Date(buildNowMs - 5.5 * 3600000).toISOString()),
      who: "S. Chen",
      actionKind: "annotated",
      actionLabel: "accepted a single-source risk",
      aboutMachineId: null,
      aboutSerial: null,
      aboutLabel: "Metrology lab",
      whatChanged:
        "noted: no second weather source available on this line yet — risk accepted, not resolved",
      witness: null,
      witnessPending: false,
      attachments: [],
      correctionOfId: null,
      overruleReason: null,
      fromTab: "exposure",
    },
    {
      id: "audit-9",
      at: instant(new Date(buildNowMs - 55 * 60000).toISOString()),
      who: "R. Gurung",
      actionKind: "annotated",
      actionLabel: "logged a source health check",
      aboutMachineId: null,
      aboutSerial: null,
      aboutLabel: "Plant MES",
      whatChanged:
        "confirmed Plant MES sync age within normal range after a field radio check",
      witness: null,
      witnessPending: false,
      attachments: [],
      correctionOfId: null,
      overruleReason: null,
      fromTab: "exposure",
    },
  ]
  const auditSeed = sealChain(unsealed)
  const overruleTally = { total: 22, aseCorrectCount: 9 }

  const learningFigures: LearningFigure[] = [
    {
      key: "rules-adjusted",
      label: "Rules adjusted",
      value: "6",
      deltaNote: "this month",
    },
    {
      key: "false-alarms-stopped",
      label: "False alarms stopped",
      value: "31",
      deltaNote: "since v1.10",
    },
    {
      key: "confidence-uplift",
      label: "Confidence uplift",
      value: "+4.2%",
      deltaNote: "mean, last 30 days",
    },
    {
      key: "patterns-promoted",
      label: "Patterns promoted",
      value: "2",
      deltaNote: "to the pattern library",
    },
    {
      key: "prediction-accuracy-change",
      label: "Prediction accuracy change",
      value: "+3.1%",
      deltaNote: "since last calibration review",
    },
  ]

  const modelChanges: ModelChange[] = [
    {
      id: "change-1",
      what: "Low-oxygen threshold",
      before: "78%",
      after: "80%",
      who: "S. Chen",
      measuredEffect: "9% fewer false alarms, no missed true positives",
      madeThingsWorse: false,
      revertImpact: null,
    },
    {
      id: "change-2",
      what: "Vibration rule threshold",
      before: "v1.14",
      after: "v1.15",
      who: "S. Chen",
      measuredEffect: "14% more false alarms in comparable conditions",
      madeThingsWorse: true,
      revertImpact:
        "Reverting to v1.14 would remove 14% of alarms currently firing under this rule and restore the prior accuracy baseline.",
    },
  ]

  const regressionResults: RegressionResult[] = [
    {
      id: "regr-1",
      change: "Low-oxygen threshold 78% → 80%",
      tabsChecked: ["detection", "prediction"],
      verdict: "pass",
      note: "Improved Detection precision with no measurable effect on Prediction.",
    },
    {
      id: "regr-2",
      change: "Vibration rule threshold v1.14 → v1.15",
      tabsChecked: ["detection", "prediction"],
      verdict: "fail",
      note: "Improved Detection recall but caused 3 false positives in Prediction — the two tabs disagree on this change.",
    },
  ]

  const driftSignals: DriftSignal[] = [
    {
      id: "drift-1",
      metric: "oxygen recovery driver accuracy",
      changePct: 8,
      direction: "down",
      period: "7 days",
      possibleCause: "a change in weather pattern",
    },
  ]

  const driverImportance: DriverImportanceEntry[] = [
    { driver: "Oxygen recovery vs own baseline", rankLastMonth: 1, rankNow: 1 },
    { driver: "Cognitive slip indicators", rankLastMonth: 3, rankNow: 2 },
    { driver: "Vibration above 70 kph exposure", rankLastMonth: 2, rankNow: 3 },
    { driver: "Rope separation widening", rankLastMonth: 4, rankNow: 4 },
    { driver: "RampUp rate alone", rankLastMonth: 2, rankNow: 5 },
  ]

  const humanVsAse: HumanVsAse = {
    humanOverruleCorrectPct: 64,
    humanOverruleN: overruleTally.total,
    aseCorrectWhenNotOverruledPct: 78,
    aseN: predictions.calibration.totalResolvedCases,
  }

  const predictionFeedback: PredictionFeedback = {
    wrongPredictions: predictions.calibration.resolved
      .filter((r) => !r.correct)
      .map((r) => ({
        who: r.who,
        serial: r.serial,
        implicatedDriver: "vibration-exposure",
      })),
    missedPatterns: [
      {
        pattern: heroPrediction?.patterns[1]?.name ?? "Social withdrawal",
        count: rng.int(2, 6),
        expiredWatchWindows: rng.int(1, 3),
      },
    ],
    overruledByReason: (
      [
        "local-knowledge",
        "conditions-changed",
        "equipment-malfunction",
        "false-positive",
      ] as OverruleReason[]
    ).map((reason) => ({ reason, count: rng.int(1, 8) })),
  }

  const qaSamples: QaSample[] = [
    {
      id: "qa-1",
      what: "the worked-example machine's merge, approved 20h ago",
      status: "confirmed-correct",
    },
    {
      id: "qa-2",
      what: "Pressure-mismatch threshold retune, approved 6h ago",
      status: "pending",
    },
  ]

  const modelVersions: ModelVersion[] = [
    {
      version: "v1.13",
      what: "Initial low-oxygen threshold calibration",
      recomputedCount: 4,
      at: instant(new Date(buildNowMs - 30 * 86400000).toISOString()),
    },
    {
      version: "v1.14",
      what: "Vibration rule threshold tightened",
      recomputedCount: 9,
      at: instant(new Date(buildNowMs - 12 * 86400000).toISOString()),
    },
    {
      version: "v1.15",
      what: "Vibration rule threshold loosened again after regression fail",
      recomputedCount: 9,
      at: instant(new Date(buildNowMs - 6 * 3600000).toISOString()),
    },
  ]

  // -- Timeline --------------------------------------------------------------
  const timelineEvents: TimelineEvent[] = [
    {
      id: "tl-1",
      at: instant(new Date(buildNowMs - 20 * 3600000).toISOString()),
      layer: "system",
      severity: "medium",
      label: "Merge approved — the worked-example machine",
      detail: "Three records merged into one, 14 conclusions recomputed.",
    },
    {
      id: "tl-2",
      at: instant(new Date(buildNowMs - 14.75 * 3600000).toISOString()),
      layer: "external",
      severity: "high",
      label: "Vibration gust 95 kph",
      detail: "Recorded by the metrology lab at sensor 1.",
    },
    {
      id: "tl-3",
      at: instant(new Date(buildNowMs - 14.5 * 3600000).toISOString()),
      layer: "system",
      severity: "high",
      label: "Prediction spike — the outlier machine",
      detail: "Requires-descent likelihood rose to 68%.",
    },
    {
      id: "tl-4",
      at: instant(new Date(buildNowMs - 15 * 3600000).toISOString()),
      layer: "system",
      severity: "incident",
      label: "Descent overruled — Tenzing Technician",
      detail: "Overruled on local knowledge, witnessed.",
    },
    {
      id: "tl-5",
      at: instant(new Date(buildNowMs - 6 * 3600000).toISOString()),
      layer: "system",
      severity: "low",
      label: "Model v1.14 → v1.15",
      detail: "Vibration rule threshold change.",
    },
    {
      id: "tl-6",
      at: instant(new Date(buildNowMs + 2 * 3600000).toISOString()),
      layer: "upcoming",
      severity: "low",
      label: "Forecast window closes 20:15",
      detail: "the outlier machine’s current open prediction.",
    },
    {
      id: "tl-7",
      at: instant(new Date(buildNowMs + 5 * 3600000).toISOString()),
      layer: "upcoming",
      severity: "medium",
      label: "Model retrain 02:00",
      detail: "Scheduled nightly retrain.",
    },
    {
      id: "tl-8",
      at: instant(new Date(buildNowMs - 4 * 60000).toISOString()),
      layer: "annotation",
      severity: "low",
      label: "High vibrations started here",
      detail: "Sticky note added by S. Chen.",
    },
  ]
  const eventClusters: EventCluster[] = [
    {
      id: "cluster-1",
      startAt: timelineEvents[3].at,
      endAt: instant(
        new Date(
          new Date(timelineEvents[3].at).getTime() + 6 * 60000
        ).toISOString()
      ),
      eventIds: ["audit-1", "tl-4", "audit-5"],
      question:
        "Cluster — a merge, an overrule and a threshold change within minutes of each other. Possible link?",
    },
  ]

  const investigations: Investigation[] = [
    {
      id: "inv-1",
      openedAt: instant(new Date(buildNowMs - 48 * 3600000).toISOString()),
      by: "R. Gurung",
      touched: "the outlier machine's oxygen-decline detection",
      outcome: "Confirmed correct — descent recommendation upheld",
      durationMinutes: 34,
      concludedNoAction: false,
    },
    {
      id: "inv-2",
      openedAt: instant(new Date(buildNowMs - 30 * 3600000).toISOString()),
      by: "S. Chen",
      touched: "sensor 7 low-battery flapping",
      outcome: "Battery replaced by field team, no further action needed",
      durationMinutes: 12,
      concludedNoAction: true,
    },
  ]

  const asOfBeliefs: AsOfBelief[] = heroPrediction
    ? [
        {
          at: instant(new Date(buildNowMs - 8 * 3600000).toISOString()),
          machineId: heroPrediction.machineId,
          name: heroPrediction.name,
          serial: heroPrediction.serial,
          believedPct: 72,
          outcome: "required descent",
          wasCorrect: true,
        },
      ]
    : []

  return {
    queue,
    auditSeed,
    retentionYears: 7,
    retentionCount: 1847,
    overruleTally,
    learningFigures,
    modelChanges,
    regressionResults,
    driftSignals,
    driverImportance,
    humanVsAse,
    predictionFeedback,
    qaSamples,
    modelVersions,
    timelineEvents,
    eventClusters,
    investigations,
    asOfBeliefs,
  }
}

export function blastRadiusLabel(n: number): string {
  if (n === 0) return "no downstream conclusions"
  if (n === 1) return "1 downstream conclusion"
  return `${n} downstream conclusions`
}

export function ageColor(hours: number): "green" | "amber" | "red" {
  if (hours < 1) return "green"
  if (hours < 4) return "amber"
  return "red"
}
