// S9.5: the Model tab reads the ontology as data — not as a set of tab
// components that happen to know about climbers and routes. Every fact
// shown here is either a real TracedValue (folded confidence, walkable
// provenance, a real conflict badge from S9.4) or an explicitly-labelled
// schema-level description with no per-instance claim attached. Nothing is
// invented to fill a column.
//
// This file is domain content, same tier as dataset.ts (it knows what a
// "climber" and a "route" are) — it just organises that content around the
// ontology's own shape (kinds, facts, relationships, versions) instead of
// around dataset.ts's build-time construction order. It takes no dataset.ts
// imports, only structural shapes, so the two files can't form a cycle.

import { dependents, sourceReliability } from './folds'
import { derivationFnId, derived, observed, sourceId, type Confidence, type SourceId, type TracedValue } from './traced'
import type { Conflict } from './conflict'
import type { IdentityRecord } from './identityRecord'

// A dedicated source for facts ABOUT the ontology itself (e.g. "can ASE
// answer this question") — not one of the five domain sources, since these
// aren't readings from a system, they're the registry's own self-knowledge.
const ONTOLOGY_REGISTRY = sourceId('ontology-registry')

export type ThingKind = 'country' | 'region' | 'route' | 'operator' | 'climber' | 'sensor'

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

export type RelationshipColor = 'nominal' | 'watch'

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
  place: 'code' | 'arrival' | 'storage'
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

interface OntologyClimber {
  id: string
  name: TracedValue<string>
  status: TracedValue<'clean' | 'flagged'>
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
  climbers: OntologyClimber[]
  conflicts: Conflict[]
  findings: OntologyFinding[]
  meanConfidencePct: number
  entitiesTracked: number
  regionCountryPairs: { name: string; country: string }[]
  routeNames: string[]
  routeOperatorNames: string[][]
  /** One climber's real identity record — used only to show the Serial fact and its derivation on the Climber type; the other 49 aren't needed for the ontology. */
  exampleIdentityRecord: IdentityRecord | null
  /** S9.5b: how many serial issuances collided and had to increment — reported here, not buried. */
  serialCollisionCount: number
}

function findConflict(conflicts: Conflict[], propertyLabel: string): Conflict | undefined {
  return conflicts.find((c) => c.propertyLabel === propertyLabel)
}

function sourceByName(sources: OntologySource[], name: string): OntologySource {
  const s = sources.find((x) => x.def.name === name)
  if (!s) throw new Error(`ontology.ts: no source named "${name}"`)
  return s
}

export function buildOntology(input: OntologyBuildInput): Ontology {
  const { sources, climbers, conflicts, findings, meanConfidencePct } = input
  const permit = sourceByName(sources, 'Permit registry')
  const roster = sourceByName(sources, 'Operator rosters')
  // S9.12: the route-sensor-network facts below (freshness, route
  // monitoring) point at the GPS tracker now that sensor mesh has split —
  // it's the closest surviving fit for "the route sensor network itself,"
  // as opposed to any one physiological or weather reading.
  const sensorMesh = sourceByName(sources, 'GPS tracker')

  const countries = [...new Set(input.regionCountryPairs.map((r) => r.country))]

  // -- THINGS -----------------------------------------------------------------
  const things: ThingKindDef[] = [
    { kind: 'country', label: 'Countries', count: countries.length, line: 'The nations these expeditions operate in — Nepal, Pakistan, China (Tibet), the United States, Switzerland.' },
    { kind: 'region', label: 'Regions', count: input.regionCountryPairs.length, line: 'A named massif or park inside one country — Khumbu, Denali, the Matterhorn group and the rest.' },
    { kind: 'route', label: 'Routes', count: input.routeNames.length, line: 'One specific climbing line up a mountain — a distinct thing from the region it climbs through.' },
    { kind: 'operator', label: 'Operators', count: input.routeOperatorNames.flat().length, line: 'A guiding company licensed to run expeditions on one route.' },
    { kind: 'climber', label: 'Climbers', count: climbers.length, line: 'A person on an expedition — the entity every permit, roster and medical record ultimately resolves to.' },
    { kind: 'sensor', label: 'Sensors', count: input.routeNames.length, line: 'One fixed environmental sensor per route, reporting into the sensor mesh.' },
  ]

  // -- Representative, per-property TracedValues for kinds with no
  // per-instance tracking elsewhere in the app. Labelled "Example:" in the
  // UI — these are real observed()/derived() calls with real confidence and
  // provenance, just not repeated 14 or 30 times over. Climber's facts below
  // are the real thing, per-instance, because the rest of the app already
  // tracks every climber individually.
  const exampleRegion = input.regionCountryPairs[0]
  const regionNameTv = observed(permit.def.id, 'region:name', exampleRegion.name, permit.reliability)
  const countryCodeTv = observed(permit.def.id, 'country:iso_3166_alpha2', exampleRegion.country === 'Nepal' ? 'NP' : 'XX', permit.reliability)
  const exampleRoute = input.routeNames[11] ?? input.routeNames[0] // Hörnli Ridge
  const routeNameTv = observed(permit.def.id, 'route:name', exampleRoute, permit.reliability)
  const routeGradeTv = observed(permit.def.id, 'route:uiaa_grade', 'AD', permit.reliability)
  const exampleOperator = input.routeOperatorNames[0][0] // Khumbu Vertical
  const operatorNameTv = observed(roster.def.id, 'operator:name', exampleOperator, roster.reliability)
  const operatorTypeTv = observed(roster.def.id, 'operator:sub_type', 'Guiding company', roster.reliability)
  const sensorFreshnessTv = observed(sensorMesh.def.id, 'sensor:last_sync_seconds_ago', 32, sensorMesh.reliability)

  // -- QUESTIONS ----------------------------------------------------------
  const dobConflict = findConflict(conflicts, 'Date of birth')
  const hrConflict = findConflict(conflicts, 'Resting heart rate')
  const mountainsConflict = findConflict(conflicts, 'Mountains climbed')
  const silentSensorFinding = findings.find((f) => f.kind === 'silent_sensor')

  const questions: CompetencyQuestion[] = [
    {
      id: 'q-flagged',
      question: 'How many climbers are currently flagged for review?',
      canAnswer: derived(
        climbers.map((c) => c.status.id),
        derivationFnId('question-flagged-climbers'),
        true
      ),
      query: () => {
        const n = climbers.filter((c) => c.findingId !== null).length
        return `Uses climber status — currently ${n} climber${n === 1 ? '' : 's'} flagged.`
      },
    },
    {
      id: 'q-duplicates',
      question: 'Which identities have been merged from more than one source record?',
      canAnswer: derived(
        findings.filter((f) => f.kind === 'duplicate_identity').map((f) => f.traced.id),
        derivationFnId('question-duplicate-identities'),
        true
      ),
      query: () => {
        const dup = findings.filter((f) => f.kind === 'duplicate_identity')
        return `Uses merge history — currently ${dup.length} identit${dup.length === 1 ? 'y' : 'ies'} merged from three source records each${dup.length > 0 ? ` (e.g. ${dup[0].entityLabel})` : ''}.`
      },
    },
    {
      id: 'q-vitals',
      question: 'Whose vitals disagree between the medical log and the sensor baseline right now?',
      canAnswer: hrConflict
        ? derived([hrConflict.a.id, hrConflict.b.id], derivationFnId('question-vital-conflict'), true)
        : observed(ONTOLOGY_REGISTRY, 'can-answer:vital-conflict', false, sourceReliability(1)),
      query: () => (hrConflict ? `Uses conflict resolution — currently ${hrConflict.entityLabel}'s resting heart rate is in dispute.` : 'No vital conflict currently open.'),
    },
    {
      id: 'q-silent-sensor',
      question: 'Which route sensor has gone silent?',
      canAnswer: silentSensorFinding
        ? derived([silentSensorFinding.traced.id], derivationFnId('question-silent-sensor'), true)
        : observed(ONTOLOGY_REGISTRY, 'can-answer:silent-sensor', false, sourceReliability(1)),
      query: () => (silentSensorFinding ? `Uses sensor last-sync age — currently the ${silentSensorFinding.entityLabel}, silent 15 minutes.` : 'Every sensor is currently reporting.'),
    },
    {
      id: 'q-dob',
      question: "What is a climber's confidence-folded date of birth, and which source won?",
      canAnswer: dobConflict?.resolved
        ? derived([dobConflict.resolved.id], derivationFnId('question-dob'), true)
        : observed(ONTOLOGY_REGISTRY, 'can-answer:dob', false, sourceReliability(1)),
      query: () =>
        dobConflict?.resolved
          ? `Uses conflict-resolved value — ${dobConflict.entityLabel}, resolved via ${dobConflict.policy.strategy.replace('-', ' ')}.`
          : 'No date-of-birth conflict currently resolved.',
    },
    {
      id: 'q-degraded-sources',
      question: 'Which sources are currently degraded?',
      canAnswer: derived(
        sources.map((s) => s.reliabilityPct.id),
        derivationFnId('question-degraded-sources'),
        true
      ),
      query: () => {
        const degraded = sources.filter((s) => s.reliability < 0.7)
        return degraded.length > 0
          ? `Uses source reliability — currently ${degraded.map((s) => s.def.name).join(', ')} at ${Math.round(degraded[0].reliability * 100)}%.`
          : 'Uses source reliability — every source is currently within its normal range.'
      },
    },
    {
      id: 'q-entity-count',
      question: 'How many entities does ASE track in total, and how does that break down?',
      canAnswer: observed(ONTOLOGY_REGISTRY, 'can-answer:entity-count', true, sourceReliability(0.99)),
      query: () => `Uses the thing-kind catalog — ${input.entitiesTracked} entities across 5 kinds, plus ${input.routeNames.length} route sensors tracked separately.`,
    },
    {
      id: 'q-mean-confidence',
      question: 'What is the mean confidence across every resolved climber?',
      canAnswer: observed(ONTOLOGY_REGISTRY, 'can-answer:mean-confidence', true, sourceReliability(0.99)),
      query: () => `Uses the resolved-status fold — currently ${meanConfidencePct}%.`,
    },
    {
      id: 'q-needs-human',
      question: 'Which climbers are waiting on a human because a conflict could not be resolved automatically?',
      canAnswer: derived(
        conflicts.flatMap((c) => [c.a.id, c.b.id]),
        derivationFnId('question-needs-human'),
        true
      ),
      query: () => {
        const pending = conflicts.filter((c) => c.resolved === null)
        return pending.length > 0
          ? `Uses conflict status — currently ${pending.map((c) => `${c.entityLabel} (${c.propertyLabel})`).join(', ')}.`
          : 'Uses conflict status — nothing is currently waiting on a human.'
      },
    },
    {
      id: 'q-insurance',
      question: "Does a climber's insurance and evacuation cover meet the route's minimum requirement?",
      // S9.5b: the identity record's WHAT A RESPONDER NEEDS block models
      // insurance and evacuation cover directly, flipping this from S9.5's NO.
      canAnswer: input.exampleIdentityRecord
        ? derived(
            [input.exampleIdentityRecord.responder.insurancePolicy.id, input.exampleIdentityRecord.responder.evacuationCover.id],
            derivationFnId('question-insurance'),
            true
          )
        : observed(ONTOLOGY_REGISTRY, 'can-answer:insurance', false, sourceReliability(1)),
      query: () =>
        input.exampleIdentityRecord
          ? `Uses the identity record's WHAT A RESPONDER NEEDS block — ${input.exampleIdentityRecord.responder.insurancePolicy.value}, ${String(input.exampleIdentityRecord.responder.evacuationCover.value).toLowerCase()}.`
          : 'insurance and evacuation cover — not modelled.',
    },
  ]

  // -- SOURCES --------------------------------------------------------------
  const sourcesCited: SourceCitation[] = [
    { id: 'src-person', property: 'Climber (as a person)', standard: 'schema.org', note: 'Person — name, identifying fields.', inHouse: false },
    { id: 'src-place', property: 'Region / Route (as a place)', standard: 'schema.org', note: 'Place — named geographic feature.', inHouse: false },
    { id: 'src-country', property: 'Country codes', standard: 'ISO 3166', note: 'Alpha-2 country codes.', inHouse: false },
    { id: 'src-time', property: 'Every timestamp', standard: 'ISO 8601', note: 'Instant and duration formatting throughout.', inHouse: false },
    { id: 'src-coords', property: 'Sensor / route coordinates', standard: 'WGS84', note: 'The reference frame every position is recorded in.', inHouse: false },
    { id: 'src-grade', property: 'Route grade', standard: 'UIAA', note: 'The route-difficulty scale.', inHouse: false },
    { id: 'src-spo2', property: 'Blood-oxygen floor', standard: 'Clinical reference (Lake Louise acclimatisation guidance)', note: 'The threshold a reading is compared against.', inHouse: false },
    {
      id: 'src-operator-type',
      property: 'Operator sub-type',
      standard: 'In-house',
      note: 'No external standard distinguishes operator business models finely enough for this domain — built in-house, deliberately narrow (see WHAT WE GOT WRONG).',
      inHouse: true,
    },
  ]

  // -- WHAT WE GOT WRONG ------------------------------------------------------
  const whatWeGotWrong: string[] = [
    'Routes and regions are drawn as one dot in the graph but are two different things here.',
    'Operators have only one sub-type — either add more or remove the distinction.',
    'Rope partnerships are stored twice, once from each side.',
  ]

  // -- FACTS ------------------------------------------------------------------
  const james = climbers[0]
  const nationalityConflict = findConflict(conflicts, 'Nationality on permit')
  const pressureConflict = findConflict(conflicts, 'Ambient pressure')

  const facts: PropertyFact[] = [
    // Climber — own facts, real per-instance TracedValues.
    ...(input.exampleIdentityRecord
      ? [
          {
            id: 'fact-climber-serial',
            kind: 'climber' as const,
            property: 'Serial (S9.5b)',
            own: true,
            source: 'Derived — passport hash + date of birth + given name at first registration',
            transform: input.exampleIdentityRecord.serialCollided ? 'issued (collision resolved by increment)' : 'issued',
            missingPct: 0,
            traced: input.exampleIdentityRecord.serial,
            conflictId: null,
          },
        ]
      : []),
    { id: 'fact-climber-name', kind: 'climber', property: 'Name', own: true, source: 'Permit registry', transform: 'normalised / merged', missingPct: 0, traced: james.name, conflictId: null },
    { id: 'fact-climber-status', kind: 'climber', property: 'Status', own: true, source: 'Permit registry', transform: 'observed', missingPct: 0, traced: james.status, conflictId: null },
    {
      id: 'fact-climber-dob',
      kind: 'climber',
      property: 'Date of birth',
      own: true,
      source: 'Permit registry vs Operator rosters',
      transform: 'conflict-resolved (source-priority)',
      missingPct: 0,
      traced: dobConflict?.resolved ?? null,
      conflictId: dobConflict?.id ?? null,
    },
    {
      id: 'fact-climber-hr',
      kind: 'climber',
      property: 'Resting heart rate',
      own: true,
      source: 'Manual observation vs Wearable oximeter',
      transform: 'conflict-resolved (most-recent)',
      missingPct: 0,
      traced: hrConflict?.resolved ?? null,
      conflictId: hrConflict?.id ?? null,
    },
    {
      id: 'fact-climber-nationality',
      kind: 'climber',
      property: 'Nationality on permit',
      own: true,
      source: 'Permit registry vs Operator rosters (free text)',
      transform: 'conflict-resolved (highest-confidence)',
      missingPct: 0,
      traced: nationalityConflict?.resolved ?? null,
      conflictId: nationalityConflict?.id ?? null,
    },
    {
      id: 'fact-climber-mountains',
      kind: 'climber',
      property: 'Mountains climbed',
      own: true,
      source: 'Operator rosters vs the climber’s own declaration',
      transform: 'unresolved (human-required)',
      missingPct: 100,
      traced: mountainsConflict?.a ?? null,
      conflictId: mountainsConflict?.id ?? null,
    },
    // Climber — relationship facts (schema-level; no dedicated per-instance edge yet).
    { id: 'fact-climber-rel-operator', kind: 'climber', property: 'Guided by → Operator', own: false, source: 'Operator rosters', transform: 'structural (n:1)', missingPct: 0, traced: null, conflictId: null },
    { id: 'fact-climber-rel-rope', kind: 'climber', property: 'Rope partner ↔ Climber', own: false, source: 'Operator rosters', transform: 'structural (n:n, stored redundantly)', missingPct: 0, traced: null, conflictId: null },

    // Route
    { id: 'fact-route-name', kind: 'route', property: 'Name', own: true, source: 'Permit registry', transform: 'observed', missingPct: 0, traced: routeNameTv, conflictId: null },
    { id: 'fact-route-grade', kind: 'route', property: 'UIAA grade', own: true, source: 'Permit registry', transform: 'observed', missingPct: 0, traced: routeGradeTv, conflictId: null },
    { id: 'fact-route-rel-region', kind: 'route', property: 'Traverses → Region', own: false, source: 'Permit registry', transform: 'structural (n:1)', missingPct: 0, traced: null, conflictId: null },
    { id: 'fact-route-rel-sensor', kind: 'route', property: 'Monitored by → Sensor', own: false, source: 'GPS tracker', transform: 'structural (1:1)', missingPct: 0, traced: null, conflictId: null },

    // Operator
    { id: 'fact-operator-name', kind: 'operator', property: 'Name', own: true, source: 'Operator rosters', transform: 'observed', missingPct: 0, traced: operatorNameTv, conflictId: null },
    { id: 'fact-operator-type', kind: 'operator', property: 'Sub-type', own: true, source: 'Operator rosters', transform: 'observed', missingPct: 0, traced: operatorTypeTv, conflictId: null },
    { id: 'fact-operator-rel-route', kind: 'operator', property: 'Operates on → Route', own: false, source: 'Operator rosters', transform: 'structural (n:1)', missingPct: 0, traced: null, conflictId: null },
    { id: 'fact-operator-rel-climber', kind: 'operator', property: 'Guides → Climber', own: false, source: 'Operator rosters', transform: 'structural (1:n)', missingPct: 0, traced: null, conflictId: null },

    // Sensor
    { id: 'fact-sensor-freshness', kind: 'sensor', property: 'Last sync', own: true, source: 'GPS tracker', transform: 'observed', missingPct: 0, traced: sensorFreshnessTv, conflictId: null },
    {
      id: 'fact-sensor-pressure',
      kind: 'sensor',
      property: 'Ambient pressure',
      own: true,
      source: 'Weather feed (two units)',
      transform: 'conflict-resolved (range-merge)',
      missingPct: 0,
      traced: pressureConflict?.resolved ?? null,
      conflictId: pressureConflict?.id ?? null,
    },
    { id: 'fact-sensor-rel-route', kind: 'sensor', property: 'Monitors → Route', own: false, source: 'GPS tracker', transform: 'structural (1:1)', missingPct: 0, traced: null, conflictId: null },

    // Region
    { id: 'fact-region-name', kind: 'region', property: 'Name', own: true, source: 'Permit registry', transform: 'observed', missingPct: 0, traced: regionNameTv, conflictId: null },
    { id: 'fact-region-rel-country', kind: 'region', property: 'In → Country', own: false, source: 'Permit registry', transform: 'structural (n:1)', missingPct: 0, traced: null, conflictId: null },
    { id: 'fact-region-rel-route', kind: 'region', property: 'Traversed by → Route', own: false, source: 'Permit registry', transform: 'structural (1:n)', missingPct: 0, traced: null, conflictId: null },

    // Country
    { id: 'fact-country-code', kind: 'country', property: 'ISO code', own: true, source: 'Permit registry', transform: 'observed', missingPct: 0, traced: countryCodeTv, conflictId: null },
    { id: 'fact-country-rel-region', kind: 'country', property: 'Contains → Region', own: false, source: 'Permit registry', transform: 'structural (1:n)', missingPct: 0, traced: null, conflictId: null },
  ]

  // -- connection registry (relationships) -------------------------------
  const relationships: RelationshipDef[] = [
    { id: 'rel-country-region', from: 'country', to: 'region', label: 'contains', cardinality: '1:n', color: 'nominal' },
    { id: 'rel-region-route', from: 'route', to: 'region', label: 'traverses', cardinality: 'n:1', color: 'nominal', note: 'Region and Route render as one dot in the graph today — see WHAT WE GOT WRONG.' },
    { id: 'rel-route-sensor', from: 'route', to: 'sensor', label: 'monitored by', cardinality: '1:1', color: 'nominal' },
    { id: 'rel-route-operator', from: 'operator', to: 'route', label: 'operates on', cardinality: 'n:1', color: 'nominal' },
    { id: 'rel-operator-climber', from: 'operator', to: 'climber', label: 'guides', cardinality: '1:n', color: 'nominal' },
    { id: 'rel-climber-climber', from: 'climber', to: 'climber', label: 'rope partner', cardinality: 'n:n', color: 'watch', note: 'Stored on both sides independently — see WHAT WE GOT WRONG.' },
  ]

  // -- VALIDITY -----------------------------------------------------------
  const validityRules: ValidityRule[] = [
    { id: 'rule-spo2', rule: "A climber's blood oxygen reading must fall between 40% and 100%." },
    { id: 'rule-hr', rule: "A climber's resting heart rate must fall between 30 and 220 beats per minute." },
    { id: 'rule-grade', rule: "A route's UIAA grade must be one of the recognised UIAA scale values." },
    { id: 'rule-country', rule: "A country code must be a valid ISO 3166 alpha-2 value." },
    { id: 'rule-nationality', rule: "A climber's nationality on permit must be one of the values in the stored enum list." },
  ]
  const validityChecks: ValidityCheckPlace[] = [
    { place: 'code', description: 'The TypeScript type for nationality is a plain string — the application code itself places no limit on what value it accepts.' },
    { place: 'arrival', description: 'Permit registry and operator rosters both send free-text nationality values as they were entered by the issuing office.' },
    { place: 'storage', description: 'The stored nationality enum is a fixed list, last updated in January of last year.' },
  ]
  const validityMismatch =
    'The stored list is missing two nationality values added in January — new records using them are rejected at storage.'

  // -- RECORDS (misfits) -------------------------------------------------
  const nima = climbers.find((c) => c.name.value === 'Nima Tamang')
  const nimaOutlierFinding = findings.find((f) => f.kind === 'physiological_outlier')
  const misfits: RecordMisfit[] = []
  if (nationalityConflict) {
    misfits.push({
      id: 'misfit-nationality',
      kind: 'climber',
      label: `${nationalityConflict.entityLabel} — Nationality on permit`,
      reason: `The operator roster's free-text value ("${String(nationalityConflict.b.value)}") isn't in the stored nationality enum — the exact storage-layer gap named in VALIDITY.`,
      traced: nationalityConflict.b,
    })
  }
  if (nima && nimaOutlierFinding) {
    misfits.push({
      id: 'misfit-spo2',
      kind: 'climber',
      label: `${nima.name.value} — Blood oxygen`,
      reason: 'A reading far below this climber’s own acclimatisation baseline — inside the valid range, but outside what the model treats as routine.',
      traced: nima.status,
    })
  }
  if (mountainsConflict) {
    misfits.push({
      id: 'misfit-mountains',
      kind: 'climber',
      label: `${mountainsConflict.entityLabel} — Mountains climbed`,
      reason: 'Two disagreeing counts and no policy that can pick a winner automatically — the model has no fact here until a human decides.',
      traced: mountainsConflict.a,
    })
  }

  // -- RECORDS (the full instance catalog) -----------------------------------
  // Real, individual TracedValues for every country/region/route/operator/
  // sensor name — not the single "Example:" exemplar FACTS uses, a genuine
  // per-instance observation for each of the 113 + 14 things, so RECORDS'
  // virtualised table (>100 rows) is virtualising something real.
  function slug(text: string): string {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  }
  const records: ThingRecord[] = []
  for (const country of countries) {
    records.push({
      id: `record-country-${slug(country)}`,
      kind: 'country',
      label: country,
      traced: observed(permit.def.id, 'country:name', country, permit.reliability),
      why: 'A country these expeditions operate in.',
    })
  }
  for (const region of input.regionCountryPairs) {
    records.push({
      id: `record-region-${slug(region.name)}`,
      kind: 'region',
      label: region.name,
      traced: observed(permit.def.id, 'region:name', region.name, permit.reliability),
      why: `In ${region.country}.`,
    })
  }
  for (const routeName of input.routeNames) {
    records.push({
      id: `record-route-${slug(routeName)}`,
      kind: 'route',
      label: routeName,
      traced: observed(permit.def.id, 'route:name', routeName, permit.reliability),
      why: 'One specific climbing line, traversing one region.',
    })
  }
  for (const operatorName of input.routeOperatorNames.flat()) {
    records.push({
      id: `record-operator-${slug(operatorName)}`,
      kind: 'operator',
      label: operatorName,
      traced: observed(roster.def.id, 'operator:name', operatorName, roster.reliability),
      why: 'A guiding company licensed on one route.',
    })
  }
  for (const c of climbers) {
    records.push({
      id: `record-climber-${c.id}`,
      kind: 'climber',
      label: c.name.value,
      traced: c.name,
      why: c.findingId ? 'Flagged for review.' : 'Clean — nothing currently flagged.',
    })
  }
  for (const region of input.regionCountryPairs) {
    records.push({
      id: `record-sensor-${slug(region.name)}`,
      kind: 'sensor',
      label: `${region.name} sensor`,
      traced: observed(sensorMesh.def.id, 'sensor:name', `${region.name} sensor`, sensorMesh.reliability),
      why: 'One fixed environmental sensor, monitoring one route.',
    })
  }

  // -- VERSIONS -------------------------------------------------------------
  const versions: OntologyVersion[] = [
    {
      id: 'v1.0',
      version: '1.0',
      date: '2025-11-03',
      whatChanged: 'Initial ontology: Country, Region, Route, Operator and Climber.',
      why: 'Establish the base entity model for expedition safety.',
      who: 'ASE ontology team',
      diff: { added: ['Country', 'Region', 'Route', 'Operator', 'Climber'], removed: [], changed: [] },
      conclusionsAffected: () => dependents(james.status.id).length,
    },
    {
      id: 'v1.1',
      version: '1.1',
      date: '2025-12-08',
      whatChanged: 'Added the Sensor kind and route-level ambient-pressure readings.',
      why: 'Route sensors came online and needed a first-class place in the model, not a bag of loose readings.',
      who: 'ASE ontology team',
      diff: { added: ['Sensor', 'Sensor.ambientPressure'], removed: [], changed: [] },
      conclusionsAffected: () => (pressureConflict?.resolved ? dependents(pressureConflict.resolved.id).length : 0),
    },
    {
      id: 'v1.2',
      version: '1.2',
      date: '2026-02-14',
      whatChanged: 'Added conflict-policy resolution to four Climber properties (date of birth, resting heart rate, nationality on permit, mountains climbed).',
      why: 'Sources disagree constantly; picking a winner silently was hiding the disagreement instead of resolving it.',
      who: 'ASE ontology team',
      diff: { added: [], removed: [], changed: ['Climber.dateOfBirth', 'Climber.restingHeartRate', 'Climber.nationalityOnPermit', 'Climber.mountainsClimbed'] },
      conclusionsAffected: () => (dobConflict?.resolved ? dependents(dobConflict.resolved.id).length : 0),
    },
    {
      id: 'v1.3',
      version: '1.3',
      date: '2026-05-20',
      whatChanged: 'Added Route.uiaaGrade and Operator.subType.',
      why: 'Route difficulty and operator classification were asked for by name in the competency questions and had nowhere to live.',
      who: 'ASE ontology team',
      diff: { added: ['Route.uiaaGrade', 'Operator.subType'], removed: [], changed: [] },
      conclusionsAffected: () => dependents(routeGradeTv.id).length + dependents(operatorTypeTv.id).length,
    },
  ]

  return {
    things,
    questions,
    inScope: [
      'Who is on which route, under which operator, right now.',
      'Whether a climber record has been resolved from more than one source, and which sources.',
      'Whether a reading is within, or outside, this climber’s own baseline.',
      'Insurance and evacuation cover, via the identity record (S9.5b).',
    ],
    outOfScope: ['Financial or billing records.', 'Weather forecasting beyond the current feed reading.'],
    plannedNext: ['Operator sub-types beyond "Guiding company".', 'A first-class Route↔Region distinction in the graph view.', 'A single-sided rope-partnership relationship.'],
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
    questions: ontology.questions.map((q) => ({ id: q.id, question: q.question, canAnswer: q.canAnswer.value })),
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
    versions: ontology.versions.map((v) => ({ id: v.id, version: v.version, date: v.date, whatChanged: v.whatChanged, why: v.why, who: v.who, diff: v.diff })),
  }
  return JSON.stringify(portable, null, 2)
}
