// S9.8: the Reasoning Engine, built as a working trace rather than an
// illustration. A question resolves to a real answer built from three
// parts: what was RULED OUT (each with the evidence that killed it), THE
// CHAIN (real TracedValues, folded, not authored numbers), and — for the
// one worked scenario — COUNTERFACTUALS built on `ase/folds.ts`'s own
// `counterfactual()` (S2): removing a real node from the real dependency
// tree and re-walking the SAME per-kind confidence formulas every other
// fold in this app uses. Nothing here re-implements that math — the whole
// point is that removing a different source produces a different, correct
// answer because it's the same graph, not a second hardcoded number.

import {
  bound,
  contextRuleId,
  derivationFnId,
  derived,
  inferred,
  observed,
  patternId,
  type Confidence,
  type SourceId,
  type TracedId,
  type TracedValue,
} from "./traced"
import { counterfactual as foldsCounterfactual } from "./folds"
import type { Finding } from "./dataset"
import type { Conflict } from "./conflict"

export interface RuledOutFactor {
  id: string
  factor: string
  evidence: string
  evidenceTraced: TracedValue<unknown>
}

export interface ChainHop {
  n: number
  id: string
  summary: string
  /** The spec's own plain-English label for this step's kind — distinct from `traced.derivation.kind`, which is the real enum the fold system reads. */
  displayKind: string
  traced: TracedValue<unknown>
  /** Which other hops (by `ChainHop.id`) this one was actually built `from` — what the dependency map draws edges between. Real, not inferred by introspecting `derivation` generically (that would need a second, parallel walk of internals `folds.ts` deliberately doesn't export). */
  dependsOnHopIds: string[]
}

export interface AffectedPerson {
  machineId: string
  name: string
  serial: string
  /** The real TracedValue this person's inclusion in the affected list is grounded in (their current-station reading) — what `derived()` actually reads `from`, not just their id string. */
  positionTraced: TracedValue<unknown>
}

export interface ReasoningAnswer {
  id: string
  question: string
  ruledOut: RuledOutFactor[]
  activeFactor: string
  chain: ChainHop[]
  cause: TracedValue<string>
  /** Which hops CAUSE was actually built `from` — the dependency map's last layer of edges. */
  causeDependsOnHopIds: string[]
  limitingStepIndex: number
  affected: AffectedPerson[]
  operatorNames: string[]
  /** Only the worked line scenario supports counterfactuals — the other three canned questions reuse existing findings/conflicts and don't carry the extra corroborating inputs a counterfactual needs to recompute against. */
  supportsCounterfactuals: boolean
}

export type CounterfactualKind =
  "without-weather-feed" | "if-sensor-4-wrong" | "without-learned-pattern"

export interface CounterfactualResult {
  kind: CounterfactualKind
  label: string
  cause: string
  confidencePct: number
  whatChanged: string
  whatDidNotChange: string
}

/** The specific node ids the primary chain's CAUSE was built `from` — what each counterfactual button removes before asking `ase/folds.ts`'s `counterfactual()` to re-walk the real tree. */
interface PrimaryChainIds {
  cause: TracedValue<string>
  hop1Id: TracedId // the root sensor-4 vibration reading
  hop7Id: TracedId // the inferred vibration-precedes-oxygen pattern
  weatherHistoryId: TracedId // the weather-feed-sourced historical validation behind hop7's pattern
}

export interface ReasoningEngineState {
  cannedQuestions: string[]
  answers: Map<string, ReasoningAnswer>
  primaryInputs: PrimaryScenarioInputs
  primaryChainIds: PrimaryChainIds
}

export interface PrimaryScenarioInputs {
  sensorMesh: { id: SourceId; reliability: Confidence }
  weatherFeed: { id: SourceId; reliability: Confidence }
  serviceLogs: { id: SourceId; reliability: Confidence }
  operatorRegisters: { id: SourceId; reliability: Confidence }
  operatorNames: string[]
  /** The line the worked scenario is about, named by the warehouse. It used to
   * be a fixed place name that existed nowhere in the data. */
  lineName: string
  affected: AffectedPerson[]
  lowOxygenAffected: AffectedPerson[]
  independentlyConfirmedIds: Set<string>
}

// -- THE PRIMARY SCENARIO: why the worked line is in trouble --

function primaryQuestion(lineName: string): string {
  return `Why is the ${lineName} line in trouble?`
}

function buildPrimaryAnswer(inputs: PrimaryScenarioInputs): {
  answer: ReasoningAnswer
  chainIds: PrimaryChainIds
} {
  const {
    sensorMesh,
    weatherFeed,
    serviceLogs,
    operatorRegisters,
    operatorNames,
    lineName,
    affected,
    lowOxygenAffected,
  } = inputs

  // -- ruled out ------------------------------------------------------------
  const battOk = observed(
    sensorMesh.id,
    "sensor4:battery_pct",
    78,
    sensorMesh.reliability
  )
  const fwOk = observed(
    sensorMesh.id,
    "sensor4:firmware",
    "2.1.7",
    sensorMesh.reliability
  )
  const neighbourAgrees = observed(
    sensorMesh.id,
    "sensor5:vibration_kph",
    76,
    sensorMesh.reliability
  )
  const registerRate = observed(
    operatorRegisters.id,
    "worked_line:rampUp_rate_30d_pct",
    100,
    operatorRegisters.reliability
  )
  const ingestionLatency = observed(
    sensorMesh.id,
    "ingestion_latency_sec",
    4,
    sensorMesh.reliability
  )

  const ruledOut: RuledOutFactor[] = [
    {
      id: "ruled-out-hardware",
      factor: "Sensor hardware fault",
      evidence:
        "Battery healthy, firmware current, the neighbouring sensor agrees within 3%.",
      evidenceTraced: derived(
        [battOk.id, fwOk.id, neighbourAgrees.id],
        derivationFnId("rule-out-hardware-fault"),
        true
      ),
    },
    {
      id: "ruled-out-rampUp-rate",
      factor: "One operator ascending too fast",
      evidence: "This line's rate matches its 30-day norm.",
      evidenceTraced: registerRate,
    },
    {
      id: "ruled-out-delayed-data",
      factor: "Delayed data",
      evidence: "Ingestion latency normal, no backlog.",
      evidenceTraced: ingestionLatency,
    },
  ]

  // -- the chain --------------------------------------------------------------
  const hop1 = observed(
    sensorMesh.id,
    "sensor4:vibration_kph",
    78,
    sensorMesh.reliability
  )
  const hop2 = bound(
    hop1.id,
    contextRuleId("rule-exposed-ridge-limit"),
    "Exceeds the 70 kph exposed-ridge limit."
  )
  const hop3 = observed(
    operatorRegisters.id,
    "sensor4:line_assignment",
    `${lineName} line`,
    operatorRegisters.reliability
  )
  const hop4 = observed(
    operatorRegisters.id,
    "worked_line:operator_count",
    operatorNames.length,
    operatorRegisters.reliability
  )
  const hop5 = derived(
    affected.map((a) => a.positionTraced.id),
    derivationFnId("count-above-station-ii"),
    affected.length
  )
  const hop6 = observed(
    serviceLogs.id,
    "worked_line:active_low_oee_alerts",
    lowOxygenAffected.length,
    serviceLogs.reliability
  )
  // The pattern's own historical legitimacy — how many seasons of weather
  // feed history it was validated against. A real, separate TracedValue so
  // "without the metrology lab" has an actual node to remove, not a number
  // to fake. Reliability comes from the source's own rolled/overridden
  // value, same as every other observed() call — hardcoding it here would
  // sever this fact from the perturbation test's invariant (moving a
  // source's reliability must move everything genuinely downstream of it).
  const weatherHistory = observed(
    weatherFeed.id,
    "worked_line:vibration_pattern_validation_years",
    6,
    weatherFeed.reliability
  )
  const hop7 = inferred(
    [hop2.id, hop6.id, weatherHistory.id],
    patternId("vibration-precedes-oxygen-decline"),
    34,
    6,
    "Vibration above 70 kph has preceded an oxygen decline within the hour 34 times, with 6 exceptions."
  )

  const chain: ChainHop[] = [
    {
      n: 1,
      id: "hop-1",
      summary: "Sensor 4 reports vibration 78 kph.",
      displayKind: "observed",
      traced: hop1,
      dependsOnHopIds: [],
    },
    {
      n: 2,
      id: "hop-2",
      summary: "78 exceeds the 70 kph exposed-ridge limit.",
      displayKind: "rule",
      traced: hop2,
      dependsOnHopIds: ["hop-1"],
    },
    {
      n: 3,
      id: "hop-3",
      summary: "Sensor 4 monitors this line.",
      displayKind: "verified",
      traced: hop3,
      dependsOnHopIds: [],
    },
    {
      n: 4,
      id: "hop-4",
      summary: `${operatorNames.length} operators run campaigns here.`,
      displayKind: "verified",
      traced: hop4,
      dependsOnHopIds: [],
    },
    {
      n: 5,
      id: "hop-5",
      summary: `${affected.length} machines are above Station II.`,
      displayKind: "derived",
      traced: hop5,
      dependsOnHopIds: [],
    },
    {
      n: 6,
      id: "hop-6",
      summary: `${lowOxygenAffected.length} of them show low effectiveness now.`,
      displayKind: "observed",
      traced: hop6,
      dependsOnHopIds: [],
    },
    {
      n: 7,
      id: "hop-7",
      summary: "Vibration >70 kph has preceded oxygen decline 34×.",
      displayKind: "inferred, 6 exceptions",
      traced: hop7,
      dependsOnHopIds: ["hop-2", "hop-6"],
    },
  ]

  // CAUSE reads `from` every hop that actually bears on the causal claim —
  // hop2 (the raw exceedance) AND hop7 (the pattern built on top of it) are
  // BOTH direct inputs, deliberately not just hop7 alone: it's what lets
  // "remove hop7" (no learned pattern) leave hop2 standing on its own
  // instead of erasing the vibration signal entirely.
  const cause = derived(
    [hop2.id, hop7.id, hop5.id, hop4.id],
    derivationFnId("cause-sustained-ridge-vibration"),
    "Sustained ridge vibration."
  )

  const answer: ReasoningAnswer = {
    id: "answer-ebc-line",
    question: primaryQuestion(lineName),
    ruledOut,
    activeFactor: "Sustained ridge vibration",
    chain,
    cause,
    causeDependsOnHopIds: ["hop-2", "hop-7", "hop-5", "hop-4"],
    limitingStepIndex: 6, // hop-7, 0-indexed into `chain`
    affected,
    operatorNames,
    supportsCounterfactuals: true,
  }
  return {
    answer,
    chainIds: {
      cause,
      hop1Id: hop1.id,
      hop7Id: hop7.id,
      weatherHistoryId: weatherHistory.id,
    },
  }
}

// -- counterfactuals: ase/folds.ts's own counterfactual(), re-walking the ---
// -- real tree with a real node removed — never a second authored number. --

export const COUNTERFACTUAL_LABEL: Record<CounterfactualKind, string> = {
  "without-weather-feed": "Without the metrology lab",
  "if-sensor-4-wrong": "If sensor 4 is wrong",
  "without-learned-pattern": "Without the learned pattern",
}

export function runCounterfactual(
  kind: CounterfactualKind,
  chainIds: PrimaryChainIds,
  inputs: PrimaryScenarioInputs
): CounterfactualResult {
  const {
    operatorNames,
    affected,
    lowOxygenAffected,
    independentlyConfirmedIds,
  } = inputs
  const label = COUNTERFACTUAL_LABEL[kind]

  if (kind === "without-weather-feed") {
    const result = foldsCounterfactual(chainIds.cause, {
      remove: [chainIds.weatherHistoryId],
    })
    const pct = Math.round(result.confidence * 100)
    return {
      kind,
      label,
      cause:
        pct < 50
          ? "Cause undetermined."
          : `${chainIds.cause.value} (weaker evidence).`,
      confidencePct: pct,
      whatChanged:
        "The learned pattern loses its historical validation — without weather-feed history behind it, the pattern's own credibility, and everything built on it, is discounted.",
      whatDidNotChange:
        "The raw vibration reading itself (sensor 4, 78 kph) and the machine count above Station II are unaffected — neither ever depended on the metrology lab.",
    }
  }

  if (kind === "if-sensor-4-wrong") {
    const result = foldsCounterfactual(chainIds.cause, {
      remove: [chainIds.hop1Id],
    })
    const confirmed = lowOxygenAffected.filter((a) =>
      independentlyConfirmedIds.has(a.machineId)
    )
    return {
      kind,
      label,
      cause: "Conclusion collapses — no single cause can be asserted.",
      confidencePct: Math.round(result.confidence * 100),
      whatChanged: `Every step downstream of sensor 4 — the exceedance check and the learned pattern — loses its basis. ${confirmed.length} of ${lowOxygenAffected.length} low-oxygen machines stay flagged, because their alert has a second, independent source besides sensor 4.`,
      whatDidNotChange: `${operatorNames.length} operators and ${affected.length} machines above Station II — that count came from the register and position system, never from sensor 4.`,
    }
  }

  // without-learned-pattern
  const result = foldsCounterfactual(chainIds.cause, {
    remove: [chainIds.hop7Id],
  })
  return {
    kind,
    label,
    cause: "Sustained ridge vibration (direct observation only).",
    confidencePct: Math.round(result.confidence * 100),
    whatChanged:
      "Confidence is no longer bounded by a pattern with six exceptions — it's now bounded by the next-weakest direct observation instead, so it reads higher.",
    whatDidNotChange:
      "The vibration reading and machine count are unchanged — only the causal LINK between vibration and oxygen decline, and the 18-minute lead time that link buys a responder, is gone.",
  }
}

// -- three simpler canned questions, reusing real existing findings/conflicts --

function findingAnswer(
  id: string,
  question: string,
  finding: Finding,
  ruledOut: RuledOutFactor[],
  chain: ChainHop[],
  affected: AffectedPerson[]
): ReasoningAnswer {
  return {
    id,
    question,
    ruledOut,
    activeFactor: finding.reason,
    chain,
    cause: derived(
      [finding.traced.id],
      derivationFnId(`${id}:cause`),
      finding.reason
    ),
    // `finding.traced` is always the same TracedValue as the chain's last hop
    // in both call sites below — the cause is built directly `from` it.
    causeDependsOnHopIds: [chain[chain.length - 1].id],
    limitingStepIndex: chain.length - 1,
    affected,
    operatorNames: [],
    supportsCounterfactuals: false,
  }
}

export interface SecondaryScenarioInputs {
  outlierFinding: Finding
  outlierPerson: AffectedPerson
  duplicateFinding: Finding
  duplicatePerson: AffectedPerson
  mountainsConflict: Conflict
  mountainsPerson: AffectedPerson
  sensorMesh: { id: SourceId; reliability: Confidence }
  serviceLogs: { id: SourceId; reliability: Confidence }
}

function buildSecondaryAnswers(
  inputs: SecondaryScenarioInputs
): ReasoningAnswer[] {
  const {
    outlierFinding,
    outlierPerson,
    duplicateFinding,
    duplicatePerson,
    mountainsConflict,
    mountainsPerson,
    sensorMesh,
    serviceLogs,
  } = inputs

  const q2Baseline = observed(
    serviceLogs.id,
    `${outlierPerson.machineId}:oee_baseline_pct`,
    90,
    serviceLogs.reliability
  )
  const q2Prior = observed(
    sensorMesh.id,
    `${outlierPerson.machineId}:oee_prior_pct`,
    84,
    sensorMesh.reliability
  )
  const answer2 = findingAnswer(
    "answer-outlier",
    `Why is ${outlierPerson.name}'s effectiveness flagged?`,
    outlierFinding,
    [
      {
        id: "ruled-out-sensor-glitch",
        factor: "A one-off sensor glitch",
        evidence:
          "The prior reading was already trending down, not a single bad sample.",
        evidenceTraced: q2Prior,
      },
      {
        id: "ruled-out-normal-range",
        factor: "A reading within their own normal range",
        evidence: "It sits well below this machine's own runIn baseline.",
        evidenceTraced: q2Baseline,
      },
    ],
    [
      {
        n: 1,
        id: "outlier-hop-1",
        summary: `${outlierPerson.name}'s effectiveness baseline is 90%.`,
        displayKind: "observed",
        traced: q2Baseline,
        dependsOnHopIds: [],
      },
      {
        n: 2,
        id: "outlier-hop-2",
        summary: "Current reading sits well below it.",
        displayKind: "observed",
        traced: q2Prior,
        dependsOnHopIds: [],
      },
      {
        n: 3,
        id: "outlier-hop-3",
        summary: outlierFinding.reason,
        displayKind: "inferred",
        traced: outlierFinding.traced,
        dependsOnHopIds: ["outlier-hop-1", "outlier-hop-2"],
      },
    ],
    [outlierPerson]
  )

  const answer3 = findingAnswer(
    "answer-duplicate",
    `Why does ${duplicatePerson.name}'s identity need review?`,
    duplicateFinding,
    [
      {
        id: "ruled-out-name-collision",
        factor: "A coincidental name match",
        evidence:
          "All three source records share the same workOrder number, not just the same name.",
        evidenceTraced: duplicateFinding.traced,
      },
    ],
    [
      {
        n: 1,
        id: "duplicate-hop-1",
        summary: duplicateFinding.reason,
        displayKind: "merged",
        traced: duplicateFinding.traced,
        dependsOnHopIds: [],
      },
    ],
    [duplicatePerson]
  )

  const mountainsCause = derived(
    [mountainsConflict.a.id, mountainsConflict.b.id],
    derivationFnId("answer-mountains:cause"),
    "Two sources disagree and neither is authoritative enough to pick automatically."
  )
  const answer4: ReasoningAnswer = {
    id: "answer-mountains",
    question: `Why is ${mountainsPerson.name}'s mountains-climbed count still awaiting a decision?`,
    ruledOut: [
      {
        id: "ruled-out-typo",
        factor: "A data-entry typo",
        evidence:
          "Both records are internally consistent — this is a real disagreement, not a fat-fingered digit.",
        evidenceTraced: mountainsConflict.b,
      },
    ],
    activeFactor: mountainsConflict.policy.rationale,
    chain: [
      {
        n: 1,
        id: "mountains-hop-1",
        summary: `${mountainsConflict.aOrigin} says ${mountainsConflict.format(mountainsConflict.a.value)}.`,
        displayKind: "observed",
        traced: mountainsConflict.a,
        dependsOnHopIds: [],
      },
      {
        n: 2,
        id: "mountains-hop-2",
        summary: `${mountainsConflict.bOrigin} says ${mountainsConflict.format(mountainsConflict.b.value)}.`,
        displayKind: "asserted",
        traced: mountainsConflict.b,
        dependsOnHopIds: [],
      },
    ],
    cause: mountainsCause,
    causeDependsOnHopIds: ["mountains-hop-1", "mountains-hop-2"],
    limitingStepIndex: 1,
    affected: [mountainsPerson],
    operatorNames: [],
    supportsCounterfactuals: false,
  }

  return [answer2, answer3, answer4]
}

// -- entry point --------------------------------------------------------------

export function buildReasoningEngine(
  primaryInputs: PrimaryScenarioInputs,
  secondaryInputs: SecondaryScenarioInputs
): ReasoningEngineState {
  const { answer: primary, chainIds } = buildPrimaryAnswer(primaryInputs)
  const secondary = buildSecondaryAnswers(secondaryInputs)
  const all = [primary, ...secondary]
  const answers = new Map(all.map((a) => [a.question, a]))
  return {
    cannedQuestions: all.map((a) => a.question),
    answers,
    primaryInputs,
    primaryChainIds: chainIds,
  }
}
