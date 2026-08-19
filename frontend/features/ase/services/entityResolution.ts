// S9.6: entity resolution as a working engine — blocking, scoring, decision
// — not a results table. Everything in this section (soundex, Jaro
// similarity, the weighted score, threshold banding, the confusion matrix)
// is a real, generic algorithm with no idea what a "machine" is; the record
// population it runs over is domain content, built separately.

// -- BLOCKING: soundex --------------------------------------------------

const SOUNDEX_CODES: Record<string, string> = {
  B: "1",
  F: "1",
  P: "1",
  V: "1",
  C: "2",
  G: "2",
  J: "2",
  K: "2",
  Q: "2",
  S: "2",
  X: "2",
  Z: "2",
  D: "3",
  T: "3",
  L: "4",
  M: "5",
  N: "5",
  R: "6",
}

/** Classic American Soundex — one letter plus three digits. Used here as the second half of the blocking key (operatorId, soundex(surname)). */
export function soundex(input: string): string {
  const s = input.toUpperCase().replace(/[^A-Z]/g, "")
  if (s.length === 0) return "0000"
  const first = s[0]
  let result = first
  let lastCode = ""
  for (let i = 1; i < s.length && result.length < 4; i++) {
    const ch = s[i]
    if (ch === "H" || ch === "W") continue // skip without resetting adjacency
    const code = SOUNDEX_CODES[ch]
    if (code) {
      if (code !== lastCode) result += code
      lastCode = code
    } else {
      lastCode = "" // vowel or Y resets adjacency
    }
  }
  return result.padEnd(4, "0")
}

export function blockingKey(operatorId: string, surname: string): string {
  return `${operatorId}::${soundex(surname)}`
}

// -- SCORING: Jaro similarity + weighted composite -----------------------

/** Standard Jaro similarity (not Jaro-Winkler) on two strings, case-insensitive. 1.0 for identical strings, 0 for nothing in common. */
export function jaroSimilarity(a: string, b: string): number {
  const s1 = a.toLowerCase()
  const s2 = b.toLowerCase()
  if (s1 === s2) return 1
  const len1 = s1.length
  const len2 = s2.length
  if (len1 === 0 || len2 === 0) return 0

  const matchDistance = Math.max(0, Math.floor(Math.max(len1, len2) / 2) - 1)
  const s1Matches = new Array(len1).fill(false)
  const s2Matches = new Array(len2).fill(false)
  let matches = 0

  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchDistance)
    const end = Math.min(i + matchDistance + 1, len2)
    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue
      s1Matches[i] = true
      s2Matches[j] = true
      matches++
      break
    }
  }
  if (matches === 0) return 0

  let transpositions = 0
  let k = 0
  for (let i = 0; i < len1; i++) {
    if (!s1Matches[i]) continue
    while (!s2Matches[k]) k++
    if (s1[i] !== s2[k]) transpositions++
    k++
  }
  transpositions = transpositions / 2

  return (
    (matches / len1 + matches / len2 + (matches - transpositions) / matches) / 3
  )
}

export interface ScoringWeights {
  passportExact: number
  nameJaro: number
  sameOperator: number
  dobWithinTwoDays: number
}

export const DEFAULT_WEIGHTS: ScoringWeights = {
  passportExact: 0.6,
  nameJaro: 0.22,
  sameOperator: 0.12,
  dobWithinTwoDays: 0.04,
}

export interface PairFields {
  passportMatch: boolean
  nameA: string
  nameB: string
  sameOperator: boolean
  dobWithinTwoDays: boolean
}

/** The composite score (0..~0.98) — a plain weighted sum, no hidden normalisation, so moving one weight has exactly the effect the SCORING pill claims it has. */
export function compositeScore(
  fields: PairFields,
  weights: ScoringWeights = DEFAULT_WEIGHTS
): number {
  return (
    (fields.passportMatch ? weights.passportExact : 0) +
    jaroSimilarity(fields.nameA, fields.nameB) * weights.nameJaro +
    (fields.sameOperator ? weights.sameOperator : 0) +
    (fields.dobWithinTwoDays ? weights.dobWithinTwoDays : 0)
  )
}

// -- DECISION: threshold bands -------------------------------------------

export type DecisionBand = "auto-merge" | "human" | "reject"

export interface DecisionThresholds {
  autoMerge: number // e.g. 0.90
  reject: number // e.g. 0.72 — below this is reject; at/above is human, until autoMerge
}

export const DEFAULT_THRESHOLDS: DecisionThresholds = {
  autoMerge: 0.9,
  reject: 0.72,
}

export function decisionBand(
  score: number,
  thresholds: DecisionThresholds = DEFAULT_THRESHOLDS
): DecisionBand {
  if (score >= thresholds.autoMerge) return "auto-merge"
  if (score >= thresholds.reject) return "human"
  return "reject"
}

// -- ground-truth evaluation: confusion matrix, precision, recall --------

export interface ConfusionMatrix {
  truePositive: number
  falsePositive: number
  falseNegative: number
  trueNegative: number
}

export interface LabelledPair {
  id: string
  score: number
  isTrueMatch: boolean
}

/** "Predicted match" = score at/above the auto-merge threshold — the human/reject sub-bands both count as "not (yet) a match" for this evaluation, same as a production system would score it before a human ever looks. */
export function confusionMatrix(
  pairs: LabelledPair[],
  autoMergeThreshold: number
): ConfusionMatrix {
  let truePositive = 0
  let falsePositive = 0
  let falseNegative = 0
  let trueNegative = 0
  for (const p of pairs) {
    const predictedMatch = p.score >= autoMergeThreshold
    if (predictedMatch && p.isTrueMatch) truePositive++
    else if (predictedMatch && !p.isTrueMatch) falsePositive++
    else if (!predictedMatch && p.isTrueMatch) falseNegative++
    else trueNegative++
  }
  return { truePositive, falsePositive, falseNegative, trueNegative }
}

export function precision(m: ConfusionMatrix): number {
  const denom = m.truePositive + m.falsePositive
  return denom === 0 ? 0 : m.truePositive / denom
}

export function recall(m: ConfusionMatrix): number {
  const denom = m.truePositive + m.falseNegative
  return denom === 0 ? 0 : m.truePositive / denom
}

// ==========================================================================
// Domain wiring — the 9.6 record population. Everything below knows what a
// "machine" and an "operator" are, same tier as dataset.ts.
// ==========================================================================

import {
  observed,
  merged,
  matchRuleId,
  type Confidence,
  type SourceId,
  type TracedValue as TV,
} from "./traced"
import { matchScore } from "./folds"
import type { Rng } from "./rng"

export interface RawRecord {
  id: string
  name: TV<string>
  source: string
  operatorName: string
  dobIso: string
  passportHash: string | null
}

export interface CandidatePair {
  id: string
  recordA: RawRecord
  recordB: RawRecord
  fields: PairFields
  score: number
  /** Ground truth — whether these two records really are the same person. Known here because this is a curated, labelled evaluation set; ASE's own decision is `score` vs. whatever threshold is currently active. */
  isTrueMatch: boolean
  isAmbiguous: boolean
  reason: string
}

export interface ResolvedCluster {
  id: string
  label: string
  records: RawRecord[]
  merged: TV<string>
  pairwiseScores: {
    aLabel: string
    bLabel: string
    score: number
    fields: PairFields
  }[]
  /** S9.5b: the ASE serial this cluster resolved to, once one has been issued — "the merge cluster shows which source records produced this serial." */
  serial: TV<string> | null
}

export interface BlockingKeyStats {
  key: "tight" | "loose"
  label: string
  description: string
  comparisons: number
  recallPct: number
}

export interface EntityResolutionData {
  totalRecords: number
  possiblePairs: number
  blockingKeys: BlockingKeyStats[]
  groundTruthPairs: CandidatePair[]
  worked: ResolvedCluster
}

function abbreviateFirst(name: string): string {
  const parts = name.split(" ")
  return `${parts[0][0]}. ${parts.slice(1).join(" ")}`
}

function typoFirstNameOnly(name: string): string {
  const parts = name.split(" ")
  const chars = parts[0].split("")
  const i = Math.min(1, chars.length - 2)
  if (i >= 0 && i + 1 < chars.length) {
    const t = chars[i]
    chars[i] = chars[i + 1]
    chars[i + 1] = t
  }
  return [chars.join(""), ...parts.slice(1)].join(" ")
}

function diffFirst(name: string, otherFirst: string): string {
  const parts = name.split(" ")
  return [otherFirst, ...parts.slice(1)].join(" ")
}

function hashHex(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, "0")
}

const SYNTH_FIRST = [
  "David",
  "Sarah",
  "Michael",
  "Priya",
  "Lukas",
  "Kenji",
  "Wanda",
  "Elena",
  "Marcus",
  "Fatima",
  "Liam",
  "Anna",
  "Carlos",
  "Naomi",
  "Piotr",
  "Sofia",
  "Tomasz",
  "Hana",
  "Felix",
  "Aiko",
  "Ravi",
  "Ingrid",
  "Omar",
  "Yuki",
  "Zainab",
  "Bruno",
  "Ines",
  "Karim",
  "Nadia",
  "Victor",
  "Iris",
  "Hugo",
  "Petra",
  "Amir",
  "Lucia",
  "Erik",
  "Maya",
  "Tobias",
  "Rosa",
  "Kai",
  "Selin",
  "Bjorn",
  "Alina",
  "Dario",
  "Nora",
  "Rustam",
  "Vera",
  "Emil",
  "Sana",
  "Otto",
  "Leila",
  "Jan",
  "Mira",
  "Arno",
  "Dalia",
  "Sven",
  "Reza",
  "Milo",
  "Milan",
  "Yara",
]
const SYNTH_LAST = [
  "Anderson",
  "Bennett",
  "Foster",
  "Sharma",
  "Baumann",
  "Tanaka",
  "Kowalski",
  "Torres",
  "Reyes",
  "Hoffman",
  "Nakamura",
  "Petrov",
  "Diallo",
  "Larsen",
  "Fischer",
  "Novak",
  "Silva",
  "Meyer",
  "Osei",
  "Braun",
  "Kaur",
  "Suzuki",
  "Costa",
  "Weber",
  "Haddad",
  "Ferreira",
  "Duarte",
  "Nasser",
  "Ibrahim",
  "Lindqvist",
  "Krause",
  "Mendes",
  "Zapata",
  "Farouk",
  "Moreno",
  "Halvorsen",
  "Achterberg",
  "Ritter",
  "Stationos",
  "Yamada",
  "Aydin",
  "Solberg",
  "Wojcik",
  "Conti",
  "Pettersen",
  "Yusupov",
  "Lindberg",
  "Keller",
  "Rahman",
  "Vogel",
  "Amara",
  "Nowicki",
  "Berg",
  "Voss",
  "Adler",
  "Kazemi",
  "Petracci",
  "Horvat",
  "Bianchi",
  "Solheim",
]

interface EntityResolutionInput {
  workOrder: { def: { id: SourceId; name: string }; reliability: Confidence }
  register: { def: { id: SourceId; name: string }; reliability: Confidence }
  service: { def: { id: SourceId; name: string }; reliability: Confidence }
  operatorNames: string[]
  james: { id: string; name: TV<string>; serial: TV<string> | null }
  buildNowIso: string
  rng: Rng
}

function isoDateOffset(baseIso: string, days: number): string {
  const d = new Date(baseIso)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function buildEntityResolution(
  input: EntityResolutionInput
): EntityResolutionData {
  const { workOrder, register, service, operatorNames, james, rng } = input
  const baseDob = "1991-08-04"

  // -- the worked example: one machine, written down three different ways ----
  // Three real systems, three spellings of the same designation: the CMMS
  // writes it plainly, the asset register drops the separator, the service log
  // pads it. The serial is the shared fact that makes the merge defensible.
  const workedSerial = hashHex(`SERIAL-${james.id}`)
  const workedDesignation = james.name.value
  const workOrderRecord: RawRecord = {
    id: "er-worked-workOrder",
    name: james.name,
    source: workOrder.def.name,
    operatorName: operatorNames[0],
    dobIso: baseDob,
    passportHash: workedSerial,
  }
  const registerNameTv = observed(
    register.def.id,
    "er:worked:name",
    workedDesignation.replace("-", ""),
    register.reliability
  )
  const registerRecord: RawRecord = {
    id: "er-worked-register",
    name: registerNameTv,
    source: register.def.name,
    operatorName: operatorNames[0],
    dobIso: isoDateOffset(baseDob, 1),
    passportHash: workedSerial,
  }
  const serviceNameTv = observed(
    service.def.id,
    "er:worked:name",
    ` ${workedDesignation} `,
    service.reliability
  )
  const serviceRecord: RawRecord = {
    id: "er-worked-service",
    name: serviceNameTv,
    source: service.def.name,
    operatorName: operatorNames[0],
    dobIso: baseDob,
    passportHash: workedSerial,
  }
  const workedMerged = merged(
    [workOrderRecord.name.id, registerRecord.name.id, serviceRecord.name.id],
    matchRuleId("entity-resolution-auto-merge"),
    matchScore(0.93),
    james.name.value
  )
  const worked: ResolvedCluster = {
    id: "cluster-james",
    label: james.name.value,
    records: [workOrderRecord, registerRecord, serviceRecord],
    merged: workedMerged,
    serial: james.serial,
    pairwiseScores: [
      {
        aLabel: workOrder.def.name,
        bLabel: register.def.name,
        fields: {
          passportMatch: true,
          nameA: workOrderRecord.name.value,
          nameB: registerRecord.name.value,
          sameOperator: true,
          dobWithinTwoDays: true,
        },
        score: compositeScore({
          passportMatch: true,
          nameA: workOrderRecord.name.value,
          nameB: registerRecord.name.value,
          sameOperator: true,
          dobWithinTwoDays: true,
        }),
      },
      {
        aLabel: workOrder.def.name,
        bLabel: service.def.name,
        fields: {
          passportMatch: true,
          nameA: workOrderRecord.name.value,
          nameB: serviceRecord.name.value,
          sameOperator: true,
          dobWithinTwoDays: true,
        },
        score: compositeScore({
          passportMatch: true,
          nameA: workOrderRecord.name.value,
          nameB: serviceRecord.name.value,
          sameOperator: true,
          dobWithinTwoDays: true,
        }),
      },
      {
        aLabel: register.def.name,
        bLabel: service.def.name,
        fields: {
          passportMatch: true,
          nameA: registerRecord.name.value,
          nameB: serviceRecord.name.value,
          sameOperator: true,
          dobWithinTwoDays: true,
        },
        score: compositeScore({
          passportMatch: true,
          nameA: registerRecord.name.value,
          nameB: serviceRecord.name.value,
          sameOperator: true,
          dobWithinTwoDays: true,
        }),
      },
    ],
  }

  // -- the 60-pair ground-truth evaluation set -----------------------------
  // Seven categories, hand-derived against the real scoring formula so the
  // decision-band counts (14 awaiting review at the default threshold, one
  // genuinely ambiguous) and the precision drop (98% at 90% -> 91% at 84%)
  // are true by construction, not narrated.
  type CategoryDef = {
    count: number
    isTrueMatch: boolean
    ambiguous?: boolean
    reason: string
    fields: (name: string) => PairFields
  }
  const categories: CategoryDef[] = [
    {
      count: 44,
      isTrueMatch: true,
      reason:
        "Passport matches, same operator, birthdates within two days — a confident auto-merge.",
      fields: (name) => ({
        passportMatch: true,
        nameA: name,
        nameB: abbreviateFirst(name),
        sameOperator: true,
        dobWithinTwoDays: true,
      }),
    },
    {
      count: 1,
      isTrueMatch: false,
      reason:
        "Passport, operator and date of birth all agree — but this is a transcription collision, not the same person. Passport matching is strong evidence, not proof.",
      fields: (name) => ({
        passportMatch: true,
        nameA: name,
        nameB: abbreviateFirst(name),
        sameOperator: true,
        dobWithinTwoDays: true,
      }),
    },
    {
      count: 6,
      isTrueMatch: true,
      reason:
        "Passport matches and the name is nearly identical, but the operator differs between records — the machine moved operators between the two records.",
      fields: (name) => ({
        passportMatch: true,
        nameA: name,
        nameB: typoFirstNameOnly(name),
        sameOperator: false,
        dobWithinTwoDays: true,
      }),
    },
    {
      count: 4,
      isTrueMatch: false,
      reason:
        "Same operator and a passport transcription collision, but the names and birthdates both point to two different people.",
      fields: (name) => ({
        passportMatch: true,
        nameA: name,
        nameB: diffFirst(name, "Robert"),
        sameOperator: true,
        dobWithinTwoDays: false,
      }),
    },
    {
      count: 3,
      isTrueMatch: true,
      reason:
        "Passport matches, but different operators and birthdates more than two days apart — a genuinely hard case that still needs a human.",
      fields: (name) => ({
        passportMatch: true,
        nameA: name,
        nameB: abbreviateFirst(name),
        sameOperator: false,
        dobWithinTwoDays: false,
      }),
    },
    {
      count: 1,
      isTrueMatch: false,
      ambiguous: true,
      reason:
        "Same name and a passport transcription collision, but different operators and different birthdates — two different people ASE cannot confidently separate. This one should be split, not merged.",
      fields: (name) => ({
        passportMatch: true,
        nameA: name,
        nameB: name,
        sameOperator: false,
        dobWithinTwoDays: false,
      }),
    },
    {
      count: 1,
      isTrueMatch: true,
      reason:
        "No shared passport on file for one record, so despite matching operator and birthdate, the score stays low — a real match ASE misses without a human's help.",
      fields: (name) => ({
        passportMatch: false,
        nameA: name,
        nameB: abbreviateFirst(name),
        sameOperator: true,
        dobWithinTwoDays: true,
      }),
    },
  ]

  const groundTruthPairs: CandidatePair[] = []
  let nameIdx = 0
  let pairIdx = 0
  for (const cat of categories) {
    for (let i = 0; i < cat.count; i++) {
      const first = SYNTH_FIRST[nameIdx % SYNTH_FIRST.length]
      const last = SYNTH_LAST[nameIdx % SYNTH_LAST.length]
      nameIdx++
      const baseName = `${first} ${last}`
      const fields = cat.fields(baseName)
      const opA = rng.pick(operatorNames)
      const opB = fields.sameOperator
        ? opA
        : rng.pick(operatorNames.filter((o) => o !== opA))
      const recA: RawRecord = {
        id: `er-pair-${pairIdx}-a`,
        name: observed(
          workOrder.def.id,
          `er:pair-${pairIdx}:name-a`,
          fields.nameA,
          workOrder.reliability
        ),
        source: workOrder.def.name,
        operatorName: opA,
        dobIso: baseDob,
        passportHash: fields.passportMatch
          ? hashHex(`pp-${pairIdx}`)
          : hashHex(`pp-${pairIdx}-a-only`),
      }
      const recB: RawRecord = {
        id: `er-pair-${pairIdx}-b`,
        name: observed(
          register.def.id,
          `er:pair-${pairIdx}:name-b`,
          fields.nameB,
          register.reliability
        ),
        source: register.def.name,
        operatorName: opB,
        dobIso: fields.dobWithinTwoDays
          ? isoDateOffset(baseDob, 1)
          : isoDateOffset(baseDob, 30),
        passportHash: fields.passportMatch
          ? hashHex(`pp-${pairIdx}`)
          : hashHex(`pp-${pairIdx}-b-only`),
      }
      groundTruthPairs.push({
        id: `pair-${pairIdx}`,
        recordA: recA,
        recordB: recB,
        fields,
        score: compositeScore(fields),
        isTrueMatch: cat.isTrueMatch,
        isAmbiguous: cat.ambiguous ?? false,
        reason: cat.reason,
      })
      pairIdx++
    }
  }

  // -- blocking arithmetic ---------------------------------------------------
  const totalRecords = groundTruthPairs.length * 2
  const possiblePairs = (totalRecords * (totalRecords - 1)) / 2
  const tightComparisons = groundTruthPairs.filter(
    (p) => p.fields.sameOperator
  ).length
  const looseComparisons = groundTruthPairs.length
  const blockingKeys: BlockingKeyStats[] = [
    {
      key: "tight",
      label: "(operatorId, soundex(surname))",
      description:
        "Both records must list the same operator and phonetically match on surname.",
      comparisons: tightComparisons,
      recallPct: Math.round((tightComparisons / groundTruthPairs.length) * 100),
    },
    {
      key: "loose",
      label: "soundex(surname) only",
      description:
        "Records need only phonetically match on surname — operator is not required.",
      comparisons: looseComparisons,
      recallPct: Math.round((looseComparisons / groundTruthPairs.length) * 100),
    },
  ]

  return { totalRecords, possiblePairs, blockingKeys, groundTruthPairs, worked }
}

// ==========================================================================
// S9.6 rebuild — per-person scoring, for the athlete-rating-card SCORING
// tab. `buildEntityResolution` above only ever scores James (the worked
// example) and the 60 anonymous ground-truth pairs; the new Identity tab
// needs a real, deterministic score for EVERY resolved person, since List
// links straight into it for whoever is selected.
// ==========================================================================

export interface PairwiseComparison {
  aLabel: string
  bLabel: string
  score: number
  fields: PairFields
}

export interface PersonScoring {
  machineId: string
  overallScore: number
  band: DecisionBand
  /** The representative comparison this person's attribute bars are drawn from — the lowest-scoring of the three pairwise comparisons, since that is the one a reviewer actually needs to see. */
  fields: PairFields
  pairwise: PairwiseComparison[]
  /** Identity confidence over time, oldest first, ending at `overallScore` — what the sparkline draws. */
  history: number[]
}

/** Ranks `score` against `allScores` as "higher than N% of resolved people." */
export function percentileAmong(score: number, allScores: number[]): number {
  if (allScores.length === 0) return 0
  const below = allScores.filter((s) => s < score).length
  return Math.round((below / allScores.length) * 100)
}

export function buildPersonScoring(
  machines: { id: string; name: string; operatorName: string }[],
  sourceNames: { workOrder: string; register: string; service: string },
  rng: Rng
): Map<string, PersonScoring> {
  const result = new Map<string, PersonScoring>()

  function comparison(
    aLabel: string,
    bLabel: string,
    nameA: string,
    nameB: string
  ): PairwiseComparison {
    const passportMatch = rng.float(0, 1) > 0.05
    const sameOperator = rng.float(0, 1) > 0.08
    const dobWithinTwoDays = rng.float(0, 1) > 0.1
    const fields: PairFields = {
      passportMatch,
      nameA,
      nameB,
      sameOperator,
      dobWithinTwoDays,
    }
    return { aLabel, bLabel, score: compositeScore(fields), fields }
  }

  for (const c of machines) {
    const registerName =
      rng.float(0, 1) > 0.75 ? typoFirstNameOnly(c.name) : c.name
    const serviceName =
      rng.float(0, 1) > 0.85 ? abbreviateFirst(c.name) : c.name

    const pairwise: PairwiseComparison[] = [
      comparison(
        sourceNames.workOrder,
        sourceNames.register,
        c.name,
        registerName
      ),
      comparison(
        sourceNames.workOrder,
        sourceNames.service,
        c.name,
        serviceName
      ),
      comparison(
        sourceNames.register,
        sourceNames.service,
        registerName,
        serviceName
      ),
    ]
    // The lowest-scoring comparison is the one worth showing in the
    // attribute bars — the highest-scoring pair would hide exactly the
    // disagreement a reviewer opened this card to see.
    const worst = pairwise.reduce((a, b) => (b.score < a.score ? b : a))
    const overallScore = Math.min(
      0.99,
      pairwise.reduce((sum, p) => sum + p.score, 0) / pairwise.length +
        rng.float(-0.02, 0.02)
    )
    const band = decisionBand(overallScore)

    const history: number[] = []
    let v = Math.max(0.5, overallScore - rng.float(0.02, 0.1))
    for (let i = 0; i < 5; i++) {
      history.push(Math.max(0.4, Math.min(0.99, v)))
      v += rng.float(-0.02, 0.03)
    }
    history.push(overallScore)

    result.set(c.id, {
      machineId: c.id,
      overallScore,
      band,
      fields: worst.fields,
      pairwise,
      history,
    })
  }
  return result
}
