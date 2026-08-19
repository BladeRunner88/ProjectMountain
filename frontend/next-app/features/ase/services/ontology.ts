// S9.5: the Model tab reads the ontology as data — not as a set of tab
// components that happen to know about machines and lines. Every fact
// shown here is either a real TracedValue (folded confidence, walkable
// provenance, a real conflict badge from S9.4) or an explicitly-labelled
// schema-level description with no per-instance claim attached. Nothing is
// invented to fill a column.
//
// This file is domain content, same tier as dataset.ts (it knows what a
// "machine" and a "line" are) — it just organises that content around the
// ontology's own shape (kinds, facts, relationships, versions) instead of
// around dataset.ts's build-time construction order. It takes no dataset.ts
// imports, only structural shapes, so the two files can't form a cycle.

import { dependents, sourceReliability } from "./folds"
import {
  derivationFnId,
  derived,
  observed,
  sourceId,
  type Confidence,
  type SourceId,
  type TracedValue,
} from "./traced"
import type { Conflict } from "./conflict"
import type { IdentityRecord } from "./identityRecord"

// A dedicated source for facts ABOUT the ontology itself (e.g. "can ASE
// answer this question") — not one of the five domain sources, since these
// aren't readings from a system, they're the registry's own self-knowledge.
const ONTOLOGY_REGISTRY = sourceId("ontology-registry")

export type ThingKind =
  "country" | "plant" | "line" | "operator" | "machine" | "sensor"

export interface ThingKindDef {
  kind: ThingKind
  label: string
  count: number
  line: string
}

export interface CompetencyQuestion {
  id: string
  question: string
  canAnswer: TracedValue<boolean>
  /** The live query itself — called fresh at render time, never memoised into static copy, so the number on screen is always the graph's current answer. */
  query: () => string
}

export interface SourceCitation {
  id: string
  property: string
  standard: string
  note: string
  inHouse: boolean
}

export type RelationshipColor = "nominal" | "watch"

export interface RelationshipDef {
  id: string
  from: ThingKind
  to: ThingKind
  label: string
  cardinality: string
  color: RelationshipColor
  note?: string
}

export interface PropertyFact {
  id: string
  kind: ThingKind
  property: string
  own: boolean
  source: string
  transform: string
  missingPct: number
  traced: TracedValue<unknown> | null
  conflictId: string | null
}

export interface ValidityRule {
  id: string
  rule: string
}

export interface ValidityCheckPlace {
  place: "code" | "arrival" | "storage"
  description: string
}

export interface RecordMisfit {
  id: string
  kind: ThingKind
  label: string
  reason: string
  traced: TracedValue<unknown>
}

/** One real instance, of any kind — what RECORDS renders as a virtualised table row. Every one is a genuine per-instance TracedValue, not a placeholder. */
export interface ThingRecord {
  id: string
  kind: ThingKind
  label: string
  traced: TracedValue<string>
  why: string
}

export interface OntologyVersion {
  id: string
  version: string
  date: string
  whatChanged: string
  why: string
  who: string
  diff: { added: string[]; removed: string[]; changed: string[] }
  /** Real dependents() count, computed fresh at render time from the real TracedId this version introduced or changed. */
  conclusionsAffected: () => number
}

export interface Ontology {
  things: ThingKindDef[]
  questions: CompetencyQuestion[]
  inScope: string[]
  outOfScope: string[]
  plannedNext: string[]
  sources: SourceCitation[]
  whatWeGotWrong: string[]
  facts: PropertyFact[]
  relationships: RelationshipDef[]
  validityRules: ValidityRule[]
  validityChecks: ValidityCheckPlace[]
  validityMismatch: string
  misfits: RecordMisfit[]
  records: ThingRecord[]
  versions: OntologyVersion[]
  serialCollisionCount: number
}

interface OntologyMachine {
  id: string
  name: TracedValue<string>
  status: TracedValue<"clean" | "flagged">
  findingId: string | null
}

interface OntologyFinding {
  id: string
  kind: string
  entityLabel: string
  traced: TracedValue<boolean>
}

interface OntologySource {
  def: { id: SourceId; name: string }
  reliability: Confidence
  reliabilityPct: TracedValue<number>
}

export interface OntologyBuildInput {
  sources: OntologySource[]
  machines: OntologyMachine[]
  conflicts: Conflict[]
  findings: OntologyFinding[]
  meanConfidencePct: number
  entitiesTracked: number
  plantCountryPairs: { name: string; country: string }[]
  lineNames: string[]
  lineOperatorNames: string[][]
  /** One machine's real identity record — used only to show the Serial fact and its derivation on the Machine type; the other 49 aren't needed for the ontology. */
  exampleIdentityRecord: IdentityRecord | null
  /** S9.5b: how many serial issuances collided and had to increment — reported here, not buried. */
  serialCollisionCount: number
}

function findConflict(
  conflicts: Conflict[],
  propertyLabel: string
): Conflict | undefined {
  return conflicts.find((c) => c.propertyLabel === propertyLabel)
}

function sourceByName(sources: OntologySource[], name: string): OntologySource {
  const s = sources.find((x) => x.def.name === name)
  if (!s) throw new Error(`ontology.ts: no source named "${name}"`)
  return s
}

export function buildOntology(input: OntologyBuildInput): Ontology {
  const { sources, machines, conflicts, findings, meanConfidencePct } = input
  const workOrder = sourceByName(sources, "CMMS")
  const register = sourceByName(sources, "Plant MES")
  // S9.12: the line-sensor-network facts below (freshness, line
  // monitoring) point at the Plant MES now that sensor mesh has split —
  // it's the closest surviving fit for "the line sensor network itself,"
  // as opposed to any one physiological or weather reading.
  const sensorMesh = sourceByName(sources, "Plant MES")

  const countries = [...new Set(input.plantCountryPairs.map((r) => r.country))]

  // -- THINGS -----------------------------------------------------------------
  const things: ThingKindDef[] = [
    {
      kind: "country",
      label: "Countries",
      count: countries.length,
      line: "The nations these campaigns operate in — Nepal, Pakistan, China (Tibet), the United States, Switzerland.",
    },
    {
      kind: "plant",
      label: "Plants",
      count: input.plantCountryPairs.length,
      line: "A named massif or park inside one country — Khumbu, Denali, the Matterhorn group and the rest.",
    },
    {
      kind: "line",
      label: "Lines",
      count: input.lineNames.length,
      line: "One specific climbing line up a mountain — a distinct thing from the plant it climbs through.",
    },
    {
      kind: "operator",
      label: "Operators",
      count: input.lineOperatorNames.flat().length,
      line: "A guiding company licensed to run campaigns on one line.",
    },
    {
      kind: "machine",
      label: "Machines",
      count: machines.length,
      line: "A person on an campaign — the entity every workOrder, register and service record ultimately resolves to.",
    },
    {
      kind: "sensor",
      label: "Sensors",
      count: input.lineNames.length,
      line: "One fixed environmental sensor per line, reporting into the sensor mesh.",
    },
  ]

  // -- Representative, per-property TracedValues for kinds with no
  // per-instance tracking elsewhere in the app. Labelled "Example:" in the
  // UI — these are real observed()/derived() calls with real confidence and
  // provenance, just not repeated 14 or 30 times over. Machine's facts below
  // are the real thing, per-instance, because the rest of the app already
  // tracks every machine individually.
  const examplePlant = input.plantCountryPairs[0]
  const plantNameTv = observed(
    workOrder.def.id,
    "plant:name",
    examplePlant.name,
    workOrder.reliability
  )
  const countryCodeTv = observed(
    workOrder.def.id,
    "country:iso_3166_alpha2",
    examplePlant.country === "Nepal" ? "NP" : "XX",
    workOrder.reliability
  )
  const exampleLine = input.lineNames[11] ?? input.lineNames[0] // Hörnli Ridge
  const lineNameTv = observed(
    workOrder.def.id,
    "line:name",
    exampleLine,
    workOrder.reliability
  )
  const lineGradeTv = observed(
    workOrder.def.id,
    "line:uiaa_grade",
    "AD",
    workOrder.reliability
  )
  const exampleOperator = input.lineOperatorNames[0][0] // Khumbu Vertical
  const operatorNameTv = observed(
    register.def.id,
    "operator:name",
    exampleOperator,
    register.reliability
  )
  const operatorTypeTv = observed(
    register.def.id,
    "operator:sub_type",
    "Guiding company",
    register.reliability
  )
  const sensorFreshnessTv = observed(
    sensorMesh.def.id,
    "sensor:last_sync_seconds_ago",
    32,
    sensorMesh.reliability
  )

  // -- QUESTIONS ----------------------------------------------------------
  const dobConflict = findConflict(conflicts, "Date of birth")
  const hrConflict = findConflict(conflicts, "Baseline vibration")
  const mountainsConflict = findConflict(conflicts, "Mountains climbed")
  const silentSensorFinding = findings.find((f) => f.kind === "silent_sensor")

  const questions: CompetencyQuestion[] = [
    {
      id: "q-flagged",
      question: "How many machines are currently flagged for review?",
      canAnswer: derived(
        machines.map((c) => c.status.id),
        derivationFnId("question-flagged-machines"),
        true
      ),
      query: () => {
        const n = machines.filter((c) => c.findingId !== null).length
        return `Uses machine status — currently ${n} machine${n === 1 ? "" : "s"} flagged.`
      },
    },
    {
      id: "q-duplicates",
      question:
        "Which identities have been merged from more than one source record?",
      canAnswer: derived(
        findings
          .filter((f) => f.kind === "duplicate_identity")
          .map((f) => f.traced.id),
        derivationFnId("question-duplicate-identities"),
        true
      ),
      query: () => {
        const dup = findings.filter((f) => f.kind === "duplicate_identity")
        return `Uses merge history — currently ${dup.length} identit${dup.length === 1 ? "y" : "ies"} merged from three source records each${dup.length > 0 ? ` (e.g. ${dup[0].entityLabel})` : ""}.`
      },
    },
    {
      id: "q-readings",
      question:
        "Whose readings disagree between the service log and the sensor baseline right now?",
      canAnswer: hrConflict
        ? derived(
            [hrConflict.a.id, hrConflict.b.id],
            derivationFnId("question-reading-conflict"),
            true
          )
        : observed(
            ONTOLOGY_REGISTRY,
            "can-answer:reading-conflict",
            false,
            sourceReliability(1)
          ),
      query: () =>
        hrConflict
          ? `Uses conflict resolution — currently ${hrConflict.entityLabel}'s resting vibration is in dispute.`
          : "No reading conflict currently open.",
    },
    {
      id: "q-silent-sensor",
      question: "Which line sensor has gone silent?",
      canAnswer: silentSensorFinding
        ? derived(
            [silentSensorFinding.traced.id],
            derivationFnId("question-silent-sensor"),
            true
          )
        : observed(
            ONTOLOGY_REGISTRY,
            "can-answer:silent-sensor",
            false,
            sourceReliability(1)
          ),
      query: () =>
        silentSensorFinding
          ? `Uses sensor last-sync age — currently the ${silentSensorFinding.entityLabel}, silent 15 minutes.`
          : "Every sensor is currently reporting.",
    },
    {
      id: "q-dob",
      question:
        "What is a machine's confidence-folded date of birth, and which source won?",
      canAnswer: dobConflict?.resolved
        ? derived(
            [dobConflict.resolved.id],
            derivationFnId("question-dob"),
            true
          )
        : observed(
            ONTOLOGY_REGISTRY,
            "can-answer:dob",
            false,
            sourceReliability(1)
          ),
      query: () =>
        dobConflict?.resolved
          ? `Uses conflict-resolved value — ${dobConflict.entityLabel}, resolved via ${dobConflict.policy.strategy.replace("-", " ")}.`
          : "No date-of-birth conflict currently resolved.",
    },
    {
      id: "q-degraded-sources",
      question: "Which sources are currently degraded?",
      canAnswer: derived(
        sources.map((s) => s.reliabilityPct.id),
        derivationFnId("question-degraded-sources"),
        true
      ),
      query: () => {
        const degraded = sources.filter((s) => s.reliability < 0.7)
        return degraded.length > 0
          ? `Uses source reliability — currently ${degraded.map((s) => s.def.name).join(", ")} at ${Math.round(degraded[0].reliability * 100)}%.`
          : "Uses source reliability — every source is currently within its normal range."
      },
    },
    {
      id: "q-entity-count",
      question:
        "How many entities does ASE track in total, and how does that break down?",
      canAnswer: observed(
        ONTOLOGY_REGISTRY,
        "can-answer:entity-count",
        true,
        sourceReliability(0.99)
      ),
      query: () =>
        `Uses the thing-kind catalog — ${input.entitiesTracked} entities across 5 kinds, plus ${input.lineNames.length} line sensors tracked separately.`,
    },
    {
      id: "q-mean-confidence",
      question: "What is the mean confidence across every resolved machine?",
      canAnswer: observed(
        ONTOLOGY_REGISTRY,
        "can-answer:mean-confidence",
        true,
        sourceReliability(0.99)
      ),
      query: () =>
        `Uses the resolved-status fold — currently ${meanConfidencePct}%.`,
    },
    {
      id: "q-needs-human",
      question:
        "Which machines are waiting on a human because a conflict could not be resolved automatically?",
      canAnswer: derived(
        conflicts.flatMap((c) => [c.a.id, c.b.id]),
        derivationFnId("question-needs-human"),
        true
      ),
      query: () => {
        const pending = conflicts.filter((c) => c.resolved === null)
        return pending.length > 0
          ? `Uses conflict status — currently ${pending.map((c) => `${c.entityLabel} (${c.propertyLabel})`).join(", ")}.`
          : "Uses conflict status — nothing is currently waiting on a human."
      },
    },
    {
      id: "q-insurance",
      question:
        "Does a machine's insurance and evacuation cover meet the line's minimum requirement?",
      // S9.5b: the identity record's WHAT A RESPONDER NEEDS block models
      // insurance and evacuation cover directly, flipping this from S9.5's NO.
      canAnswer: input.exampleIdentityRecord
        ? derived(
            [
              input.exampleIdentityRecord.responder.insurancePolicy.id,
              input.exampleIdentityRecord.responder.evacuationCover.id,
            ],
            derivationFnId("question-insurance"),
            true
          )
        : observed(
            ONTOLOGY_REGISTRY,
            "can-answer:insurance",
            false,
            sourceReliability(1)
          ),
      query: () =>
        input.exampleIdentityRecord
          ? `Uses the identity record's WHAT A RESPONDER NEEDS block — ${input.exampleIdentityRecord.responder.insurancePolicy.value}, ${String(input.exampleIdentityRecord.responder.evacuationCover.value).toLowerCase()}.`
          : "insurance and evacuation cover — not modelled.",
    },
  ]

  // -- SOURCES --------------------------------------------------------------
  const sourcesCited: SourceCitation[] = [
    {
      id: "src-person",
      property: "Machine (as a person)",
      standard: "schema.org",
      note: "Person — name, identifying fields.",
      inHouse: false,
    },
    {
      id: "src-place",
      property: "Plant / Line (as a place)",
      standard: "schema.org",
      note: "Place — named geographic feature.",
      inHouse: false,
    },
    {
      id: "src-country",
      property: "Country codes",
      standard: "ISO 3166",
      note: "Alpha-2 country codes.",
      inHouse: false,
    },
    {
      id: "src-time",
      property: "Every timestamp",
      standard: "ISO 8601",
      note: "Instant and duration formatting throughout.",
      inHouse: false,
    },
    {
      id: "src-coords",
      property: "Sensor / line coordinates",
      standard: "WGS84",
      note: "The reference frame every position is recorded in.",
      inHouse: false,
    },
    {
      id: "src-grade",
      property: "Line grade",
      standard: "UIAA",
      note: "The line-difficulty scale.",
      inHouse: false,
    },
    {
      id: "src-oee",
      property: "Blood-oxygen floor",
      standard: "Clinical reference (Lake Louise runIn guidance)",
      note: "The threshold a reading is compared against.",
      inHouse: false,
    },
    {
      id: "src-operator-type",
      property: "Operator sub-type",
      standard: "In-house",
      note: "No external standard distinguishes operator business models finely enough for this domain — built in-house, deliberately narrow (see WHAT WE GOT WRONG).",
      inHouse: true,
    },
  ]

  // -- WHAT WE GOT WRONG ------------------------------------------------------
  const whatWeGotWrong: string[] = [
    "Lines and plants are drawn as one dot in the graph but are two different things here.",
    "Operators have only one sub-type — either add more or remove the distinction.",
    "Rope partnerships are stored twice, once from each side.",
  ]

  // -- FACTS ------------------------------------------------------------------
  const james = machines[0]
  const nationalityConflict = findConflict(
    conflicts,
    "Nationality on workOrder"
  )
  const pressureConflict = findConflict(conflicts, "Ambient pressure")

  const facts: PropertyFact[] = [
    // Machine — own facts, real per-instance TracedValues.
    ...(input.exampleIdentityRecord
      ? [
          {
            id: "fact-machine-serial",
            kind: "machine" as const,
            property: "Serial (S9.5b)",
            own: true,
            source:
              "Derived — passport hash + date of birth + given name at first registration",
            transform: input.exampleIdentityRecord.serialCollided
              ? "issued (collision resolved by increment)"
              : "issued",
            missingPct: 0,
            traced: input.exampleIdentityRecord.serial,
            conflictId: null,
          },
        ]
      : []),
    {
      id: "fact-machine-name",
      kind: "machine",
      property: "Name",
      own: true,
      source: "CMMS",
      transform: "normalised / merged",
      missingPct: 0,
      traced: james.name,
      conflictId: null,
    },
    {
      id: "fact-machine-status",
      kind: "machine",
      property: "Status",
      own: true,
      source: "CMMS",
      transform: "observed",
      missingPct: 0,
      traced: james.status,
      conflictId: null,
    },
    {
      id: "fact-machine-dob",
      kind: "machine",
      property: "Date of birth",
      own: true,
      source: "CMMS vs Plant MES",
      transform: "conflict-resolved (source-priority)",
      missingPct: 0,
      traced: dobConflict?.resolved ?? null,
      conflictId: dobConflict?.id ?? null,
    },
    {
      id: "fact-machine-vibration",
      kind: "machine",
      property: "Baseline vibration",
      own: true,
      source: "Service contractor vs OT historian",
      transform: "conflict-resolved (most-recent)",
      missingPct: 0,
      traced: hrConflict?.resolved ?? null,
      conflictId: hrConflict?.id ?? null,
    },
    {
      id: "fact-machine-nationality",
      kind: "machine",
      property: "Nationality on workOrder",
      own: true,
      source: "CMMS vs Plant MES (free text)",
      transform: "conflict-resolved (highest-confidence)",
      missingPct: 0,
      traced: nationalityConflict?.resolved ?? null,
      conflictId: nationalityConflict?.id ?? null,
    },
    {
      id: "fact-machine-mountains",
      kind: "machine",
      property: "Mountains climbed",
      own: true,
      source: "Plant MES vs the machine’s own declaration",
      transform: "unresolved (human-required)",
      missingPct: 100,
      traced: mountainsConflict?.a ?? null,
      conflictId: mountainsConflict?.id ?? null,
    },
    // Machine — relationship facts (schema-level; no dedicated per-instance edge yet).
    {
      id: "fact-machine-rel-operator",
      kind: "machine",
      property: "Guided by → Operator",
      own: false,
      source: "Plant MES",
      transform: "structural (n:1)",
      missingPct: 0,
      traced: null,
      conflictId: null,
    },
    {
      id: "fact-machine-rel-rope",
      kind: "machine",
      property: "Rope partner ↔ Machine",
      own: false,
      source: "Plant MES",
      transform: "structural (n:n, stored redundantly)",
      missingPct: 0,
      traced: null,
      conflictId: null,
    },

    // Line
    {
      id: "fact-line-name",
      kind: "line",
      property: "Name",
      own: true,
      source: "CMMS",
      transform: "observed",
      missingPct: 0,
      traced: lineNameTv,
      conflictId: null,
    },
    {
      id: "fact-line-grade",
      kind: "line",
      property: "UIAA grade",
      own: true,
      source: "CMMS",
      transform: "observed",
      missingPct: 0,
      traced: lineGradeTv,
      conflictId: null,
    },
    {
      id: "fact-line-rel-plant",
      kind: "line",
      property: "Traverses → Plant",
      own: false,
      source: "CMMS",
      transform: "structural (n:1)",
      missingPct: 0,
      traced: null,
      conflictId: null,
    },
    {
      id: "fact-line-rel-sensor",
      kind: "line",
      property: "Monitored by → Sensor",
      own: false,
      source: "Plant MES",
      transform: "structural (1:1)",
      missingPct: 0,
      traced: null,
      conflictId: null,
    },

    // Operator
    {
      id: "fact-operator-name",
      kind: "operator",
      property: "Name",
      own: true,
      source: "Plant MES",
      transform: "observed",
      missingPct: 0,
      traced: operatorNameTv,
      conflictId: null,
    },
    {
      id: "fact-operator-type",
      kind: "operator",
      property: "Sub-type",
      own: true,
      source: "Plant MES",
      transform: "observed",
      missingPct: 0,
      traced: operatorTypeTv,
      conflictId: null,
    },
    {
      id: "fact-operator-rel-line",
      kind: "operator",
      property: "Operates on → Line",
      own: false,
      source: "Plant MES",
      transform: "structural (n:1)",
      missingPct: 0,
      traced: null,
      conflictId: null,
    },
    {
      id: "fact-operator-rel-machine",
      kind: "operator",
      property: "Guides → Machine",
      own: false,
      source: "Plant MES",
      transform: "structural (1:n)",
      missingPct: 0,
      traced: null,
      conflictId: null,
    },

    // Sensor
    {
      id: "fact-sensor-freshness",
      kind: "sensor",
      property: "Last sync",
      own: true,
      source: "Plant MES",
      transform: "observed",
      missingPct: 0,
      traced: sensorFreshnessTv,
      conflictId: null,
    },
    {
      id: "fact-sensor-pressure",
      kind: "sensor",
      property: "Ambient pressure",
      own: true,
      source: "Metrology lab (two units)",
      transform: "conflict-resolved (range-merge)",
      missingPct: 0,
      traced: pressureConflict?.resolved ?? null,
      conflictId: pressureConflict?.id ?? null,
    },
    {
      id: "fact-sensor-rel-line",
      kind: "sensor",
      property: "Monitors → Line",
      own: false,
      source: "Plant MES",
      transform: "structural (1:1)",
      missingPct: 0,
      traced: null,
      conflictId: null,
    },

    // Plant
    {
      id: "fact-plant-name",
      kind: "plant",
      property: "Name",
      own: true,
      source: "CMMS",
      transform: "observed",
      missingPct: 0,
      traced: plantNameTv,
      conflictId: null,
    },
    {
      id: "fact-plant-rel-country",
      kind: "plant",
      property: "In → Country",
      own: false,
      source: "CMMS",
      transform: "structural (n:1)",
      missingPct: 0,
      traced: null,
      conflictId: null,
    },
    {
      id: "fact-plant-rel-line",
      kind: "plant",
      property: "Traversed by → Line",
      own: false,
      source: "CMMS",
      transform: "structural (1:n)",
      missingPct: 0,
      traced: null,
      conflictId: null,
    },

    // Country
    {
      id: "fact-country-code",
      kind: "country",
      property: "ISO code",
      own: true,
      source: "CMMS",
      transform: "observed",
      missingPct: 0,
      traced: countryCodeTv,
      conflictId: null,
    },
    {
      id: "fact-country-rel-plant",
      kind: "country",
      property: "Contains → Plant",
      own: false,
      source: "CMMS",
      transform: "structural (1:n)",
      missingPct: 0,
      traced: null,
      conflictId: null,
    },
  ]

  // -- connection registry (relationships) -------------------------------
  const relationships: RelationshipDef[] = [
    {
      id: "rel-country-plant",
      from: "country",
      to: "plant",
      label: "contains",
      cardinality: "1:n",
      color: "nominal",
    },
    {
      id: "rel-plant-line",
      from: "line",
      to: "plant",
      label: "traverses",
      cardinality: "n:1",
      color: "nominal",
      note: "Plant and Line render as one dot in the graph today — see WHAT WE GOT WRONG.",
    },
    {
      id: "rel-line-sensor",
      from: "line",
      to: "sensor",
      label: "monitored by",
      cardinality: "1:1",
      color: "nominal",
    },
    {
      id: "rel-line-operator",
      from: "operator",
      to: "line",
      label: "operates on",
      cardinality: "n:1",
      color: "nominal",
    },
    {
      id: "rel-operator-machine",
      from: "operator",
      to: "machine",
      label: "guides",
      cardinality: "1:n",
      color: "nominal",
    },
    {
      id: "rel-machine-machine",
      from: "machine",
      to: "machine",
      label: "rope partner",
      cardinality: "n:n",
      color: "watch",
      note: "Stored on both sides independently — see WHAT WE GOT WRONG.",
    },
  ]

  // -- VALIDITY -----------------------------------------------------------
  const validityRules: ValidityRule[] = [
    {
      id: "rule-oee",
      rule: "A machine's effectiveness reading must fall between 40% and 100%.",
    },
    {
      id: "rule-vibration",
      rule: "A machine's resting vibration must fall between 30 and 220 beats per minute.",
    },
    {
      id: "rule-grade",
      rule: "A line's UIAA grade must be one of the recognised UIAA scale values.",
    },
    {
      id: "rule-country",
      rule: "A country code must be a valid ISO 3166 alpha-2 value.",
    },
    {
      id: "rule-nationality",
      rule: "A machine's nationality on workOrder must be one of the values in the stored enum list.",
    },
  ]
  const validityChecks: ValidityCheckPlace[] = [
    {
      place: "code",
      description:
        "The TypeScript type for nationality is a plain string — the application code itself places no limit on what value it accepts.",
    },
    {
      place: "arrival",
      description:
        "CMMS and Plant MES both send free-text nationality values as they were entered by the issuing office.",
    },
    {
      place: "storage",
      description:
        "The stored nationality enum is a fixed list, last updated in January of last year.",
    },
  ]
  const validityMismatch =
    "The stored list is missing two nationality values added in January — new records using them are rejected at storage."

  // -- RECORDS (misfits) -------------------------------------------------
  // Found through the finding it drives, not by name. The machine that owns
  // the outlier is a structural fact; its designation is just a label.
  const outlierFinding = findings.find(
    (f) => f.kind === "physiological_outlier"
  )
  const outlierMachine = machines.find(
    (c) => c.findingId === outlierFinding?.id
  )
  const misfits: RecordMisfit[] = []
  if (nationalityConflict) {
    misfits.push({
      id: "misfit-nationality",
      kind: "machine",
      label: `${nationalityConflict.entityLabel} — Nationality on workOrder`,
      reason: `The operator register's free-text value ("${String(nationalityConflict.b.value)}") isn't in the stored nationality enum — the exact storage-layer gap named in VALIDITY.`,
      traced: nationalityConflict.b,
    })
  }
  if (outlierMachine && outlierFinding) {
    misfits.push({
      id: "misfit-oee",
      kind: "machine",
      label: `${outlierMachine.name.value} — Effectiveness`,
      reason:
        "A reading far below this machine’s own runIn baseline — inside the valid range, but outside what the model treats as routine.",
      traced: outlierMachine.status,
    })
  }
  if (mountainsConflict) {
    misfits.push({
      id: "misfit-mountains",
      kind: "machine",
      label: `${mountainsConflict.entityLabel} — Mountains climbed`,
      reason:
        "Two disagreeing counts and no policy that can pick a winner automatically — the model has no fact here until a human decides.",
      traced: mountainsConflict.a,
    })
  }

  // -- RECORDS (the full instance catalog) -----------------------------------
  // Real, individual TracedValues for every country/plant/line/operator/
  // sensor name — not the single "Example:" exemplar FACTS uses, a genuine
  // per-instance observation for each of the 113 + 14 things, so RECORDS'
  // virtualised table (>100 rows) is virtualising something real.
  function slug(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
  }
  const records: ThingRecord[] = []
  for (const country of countries) {
    records.push({
      id: `record-country-${slug(country)}`,
      kind: "country",
      label: country,
      traced: observed(
        workOrder.def.id,
        "country:name",
        country,
        workOrder.reliability
      ),
      why: "A country these campaigns operate in.",
    })
  }
  for (const plant of input.plantCountryPairs) {
    records.push({
      id: `record-plant-${slug(plant.name)}`,
      kind: "plant",
      label: plant.name,
      traced: observed(
        workOrder.def.id,
        "plant:name",
        plant.name,
        workOrder.reliability
      ),
      why: `In ${plant.country}.`,
    })
  }
  for (const lineName of input.lineNames) {
    records.push({
      id: `record-line-${slug(lineName)}`,
      kind: "line",
      label: lineName,
      traced: observed(
        workOrder.def.id,
        "line:name",
        lineName,
        workOrder.reliability
      ),
      why: "One specific climbing line, traversing one plant.",
    })
  }
  for (const operatorName of input.lineOperatorNames.flat()) {
    records.push({
      id: `record-operator-${slug(operatorName)}`,
      kind: "operator",
      label: operatorName,
      traced: observed(
        register.def.id,
        "operator:name",
        operatorName,
        register.reliability
      ),
      why: "A guiding company licensed on one line.",
    })
  }
  for (const c of machines) {
    records.push({
      id: `record-machine-${c.id}`,
      kind: "machine",
      label: c.name.value,
      traced: c.name,
      why: c.findingId
        ? "Flagged for review."
        : "Clean — nothing currently flagged.",
    })
  }
  for (const plant of input.plantCountryPairs) {
    records.push({
      id: `record-sensor-${slug(plant.name)}`,
      kind: "sensor",
      label: `${plant.name} sensor`,
      traced: observed(
        sensorMesh.def.id,
        "sensor:name",
        `${plant.name} sensor`,
        sensorMesh.reliability
      ),
      why: "One fixed environmental sensor, monitoring one line.",
    })
  }

  // -- VERSIONS -------------------------------------------------------------
  const versions: OntologyVersion[] = [
    {
      id: "v1.0",
      version: "1.0",
      date: "2025-11-03",
      whatChanged:
        "Initial ontology: Country, Plant, Line, Operator and Machine.",
      why: "Establish the base entity model for campaign safety.",
      who: "ASE ontology team",
      diff: {
        added: ["Country", "Plant", "Line", "Operator", "Machine"],
        removed: [],
        changed: [],
      },
      conclusionsAffected: () => dependents(james.status.id).length,
    },
    {
      id: "v1.1",
      version: "1.1",
      date: "2025-12-08",
      whatChanged:
        "Added the Sensor kind and line-level ambient-pressure readings.",
      why: "Line sensors came online and needed a first-class place in the model, not a bag of loose readings.",
      who: "ASE ontology team",
      diff: {
        added: ["Sensor", "Sensor.ambientPressure"],
        removed: [],
        changed: [],
      },
      conclusionsAffected: () =>
        pressureConflict?.resolved
          ? dependents(pressureConflict.resolved.id).length
          : 0,
    },
    {
      id: "v1.2",
      version: "1.2",
      date: "2026-02-14",
      whatChanged:
        "Added conflict-policy resolution to four Machine properties (date of birth, resting vibration, nationality on workOrder, mountains climbed).",
      why: "Sources disagree constantly; picking a winner silently was hiding the disagreement instead of resolving it.",
      who: "ASE ontology team",
      diff: {
        added: [],
        removed: [],
        changed: [
          "Machine.dateOfBirth",
          "Machine.restingHeartRate",
          "Machine.nationalityOnWorkOrder",
          "Machine.mountainsClimbed",
        ],
      },
      conclusionsAffected: () =>
        dobConflict?.resolved ? dependents(dobConflict.resolved.id).length : 0,
    },
    {
      id: "v1.3",
      version: "1.3",
      date: "2026-05-20",
      whatChanged: "Added Line.uiaaGrade and Operator.subType.",
      why: "Line difficulty and operator classification were asked for by name in the competency questions and had nowhere to live.",
      who: "ASE ontology team",
      diff: {
        added: ["Line.uiaaGrade", "Operator.subType"],
        removed: [],
        changed: [],
      },
      conclusionsAffected: () =>
        dependents(lineGradeTv.id).length +
        dependents(operatorTypeTv.id).length,
    },
  ]

  return {
    things,
    questions,
    inScope: [
      "Who is on which line, under which operator, right now.",
      "Whether a machine record has been resolved from more than one source, and which sources.",
      "Whether a reading is within, or outside, this machine’s own baseline.",
      "Insurance and evacuation cover, via the identity record (S9.5b).",
    ],
    outOfScope: [
      "Financial or billing records.",
      "Weather forecasting beyond the current feed reading.",
    ],
    plannedNext: [
      'Operator sub-types beyond "Guiding company".',
      "A first-class Line↔Plant distinction in the graph view.",
      "A single-sided rope-partnership relationship.",
    ],
    sources: sourcesCited,
    whatWeGotWrong,
    facts,
    relationships,
    validityRules,
    validityChecks,
    validityMismatch,
    misfits,
    records,
    versions,
    serialCollisionCount: input.serialCollisionCount,
  }
}

/** EXPORT MODEL: the ontology as portable data — swap this file's content for a different domain's and the rest of the Control Room understands a different world. Strips the live TracedValue/closure plumbing down to plain, JSON-safe description. */
export function exportOntology(ontology: Ontology): string {
  const portable = {
    things: ontology.things,
    questions: ontology.questions.map((q) => ({
      id: q.id,
      question: q.question,
      canAnswer: q.canAnswer.value,
    })),
    inScope: ontology.inScope,
    outOfScope: ontology.outOfScope,
    plannedNext: ontology.plannedNext,
    sources: ontology.sources,
    whatWeGotWrong: ontology.whatWeGotWrong,
    facts: ontology.facts.map((f) => ({
      id: f.id,
      kind: f.kind,
      property: f.property,
      own: f.own,
      source: f.source,
      transform: f.transform,
      missingPct: f.missingPct,
      hasConflict: f.conflictId !== null,
    })),
    relationships: ontology.relationships,
    validityRules: ontology.validityRules,
    validityChecks: ontology.validityChecks,
    validityMismatch: ontology.validityMismatch,
    versions: ontology.versions.map((v) => ({
      id: v.id,
      version: v.version,
      date: v.date,
      whatChanged: v.whatChanged,
      why: v.why,
      who: v.who,
      diff: v.diff,
    })),
  }
  return JSON.stringify(portable, null, 2)
}
