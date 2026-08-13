// S9.7 (complete rebuild): the Context Engine as a live catalog of readings,
// not one fixed illustration. Every reading — a payload from one source,
// about one entity — arrives with raw fields; a shared table of
// ContextRules is what gives each raw field its meaning. Every bound value
// is a real TracedValue with `derivation.kind === 'bound'`, walkable and
// foldable exactly like everything else in this app.
//
// This file is deliberately mechanical: given a `ReadingSpec` (a source, an
// entity the payload concerns, and already-built raw TracedValues — dataset.ts's
// job, per S1g's "only dataset.ts knows about climbers" discipline) and a
// rule set, it applies rules and computes coverage. It never decides WHO a
// reading is about; it only decides WHAT a raw field means once told which
// field it is.
//
// THE RULE THAT FIXES THE WHOLE TAB (S9.7 rebuild): raw field names are
// never the primary label. `ContextRule.meaningStatement` always leads;
// `ContextRule.fieldKey` (the raw name) is secondary, dim, mono — everywhere
// a rule or a bound fact is shown.

import { bound, contextRuleId, type Confidence, type Instant, type TracedValue } from './traced'
import { ruleAuthority } from './folds'

export type EntityType = 'Climber' | 'Route' | 'Sensor' | 'Operator'

export interface ContextRule {
  id: string
  /** The raw field this rule reads. */
  fieldKey: string
  /** What kind of thing this field is a property of — the Rules table's grouping and its APPLIES TO column. Never the primary label. */
  entityType: EntityType
  /** The plain-language conclusion. Always the primary label, wherever this rule or a fact it produced is shown. */
  meaningStatement: string
  /** The condition, in plain words — what has to be true of the raw field for this rule to fire. */
  match: string
  /** Where the authority for this conclusion comes from. */
  authority: string
  confidence: Confidence
  origin: 'built-in' | 'human'
}

export type ReadingAbout =
  | { kind: 'climber'; climberId: string; label: string; serial: string; extra: string }
  | { kind: 'route'; label: string }
  | { kind: 'sensor'; label: string }
  | { kind: 'operator'; label: string }

export interface BoundStatement {
  fieldKey: string
  ruleId: string
  entityType: EntityType
  traced: TracedValue<string>
}

export interface UnboundField {
  key: string
  rawValue: unknown
}

/** What dataset.ts hands in: a payload already turned into real TracedValues, plus who it's about. contextEngine.ts never calls `observed()` itself — every raw field arrives pre-built so dataset.ts can share the exact same TracedValue with another tab (S9.7/S9.8's sensor-mesh link) when the domain calls for it. */
export interface ReadingSpec {
  id: string
  source: string
  about: ReadingAbout
  arrivedAt: Instant
  /** When the connector's own payload says the reading was taken — omitted when arrival and capture are effectively the same instant. */
  takenAt: Instant | null
  raw: Record<string, unknown>
  rawFieldTvs: Map<string, TracedValue<unknown>>
  /** Which bound field is the single most important fact — List's WHAT IT SAYS. */
  headlineFieldKey: string
  /** The List row's plain-English headline sentence. Authored once here (not derived from the bound sentence, which is written to stand alone in Reading) so List can stay a punchy one-liner. */
  headline: string
}

export interface Reading {
  id: string
  source: string
  about: ReadingAbout
  arrivedAt: Instant
  takenAt: Instant | null
  raw: Record<string, unknown>
  rawFieldTvs: Map<string, TracedValue<unknown>>
  bound: BoundStatement[]
  unbound: UnboundField[]
  headlineFieldKey: string
  headline: string
}

export interface ContextEngineState {
  readings: Reading[]
  rules: ContextRule[]
}

export interface CoverageStat {
  totalFields: number
  boundFields: number
  pct: number
}

export interface SourceCoverage {
  source: string
  received: number
  boundCount: number
  pct: number
  stillUnbound: string[]
}

// -- built-in rules -----------------------------------------------------------
// One row per raw field this dataset ever sends. `meaningStatement` is what
// the Rules table shows first; `fieldKey` is what it shows dim and second.

export function builtInRules(): ContextRule[] {
  return [
    {
      id: 'rule-dev-id',
      fieldKey: 'DEV_ID',
      entityType: 'Sensor',
      meaningStatement: 'Sensor identity, and the route it watches.',
      match: 'Device ID matches the SNS-{REGION}-{NNN} pattern issued to route sensors.',
      authority: 'Operator SOP v3',
      confidence: ruleAuthority(0.97),
      origin: 'built-in',
    },
    {
      id: 'rule-ts',
      fieldKey: 'TS',
      entityType: 'Sensor',
      meaningStatement: "The reading's own capture time, relative to when it arrived.",
      match: 'A Unix epoch second timestamp is present.',
      authority: 'ISO 8601 / system clock',
      confidence: ruleAuthority(0.99),
      origin: 'built-in',
    },
    {
      id: 'rule-spo2',
      fieldKey: 'SPO2_VAL',
      entityType: 'Climber',
      meaningStatement: "Blood oxygen, read against this climber's own acclimatisation baseline.",
      match: 'A blood-oxygen percentage is present.',
      authority: 'Clinical reference (Lake Louise acclimatisation guidance)',
      confidence: ruleAuthority(0.98),
      origin: 'built-in',
    },
    {
      id: 'rule-hr',
      fieldKey: 'HR',
      entityType: 'Climber',
      meaningStatement: 'Heart rate, read against exertion at altitude rather than a flat resting threshold.',
      match: 'A heart-rate reading is present alongside a blood-oxygen reading.',
      authority: 'Field correction — expedition physician, 2026-01',
      confidence: ruleAuthority(0.82),
      origin: 'human',
    },
    {
      id: 'rule-amb-p',
      fieldKey: 'AMB_P',
      entityType: 'Route',
      meaningStatement: 'The camp-equivalent altitude band that a pressure reading corresponds to.',
      match: 'An ambient pressure reading in hPa is present.',
      authority: 'Barometric altitude model',
      confidence: ruleAuthority(0.91),
      origin: 'built-in',
    },
    {
      id: 'rule-lat',
      fieldKey: 'LAT',
      entityType: 'Route',
      meaningStatement: 'The region a reading resolves inside.',
      match: 'A latitude falls inside a known region polygon.',
      authority: 'Operator SOP v3',
      confidence: ruleAuthority(0.88),
      origin: 'built-in',
    },
    {
      id: 'rule-lon',
      fieldKey: 'LON',
      entityType: 'Route',
      meaningStatement: 'Confirmation of which route a reading sits on.',
      match: 'A longitude falls inside a known route corridor.',
      authority: 'Operator SOP v3',
      confidence: ruleAuthority(0.88),
      origin: 'built-in',
    },
    {
      id: 'rule-batt',
      fieldKey: 'BATT',
      entityType: 'Sensor',
      meaningStatement: 'Battery charge, read against the replacement threshold.',
      match: 'A battery fraction is present.',
      authority: 'Operator SOP v3',
      confidence: ruleAuthority(0.99),
      origin: 'built-in',
    },
    {
      id: 'rule-temp-c',
      fieldKey: 'TEMP_C',
      entityType: 'Route',
      meaningStatement: 'Ambient temperature along the route.',
      match: 'A Celsius temperature reading is present.',
      authority: 'Weather feed calibration',
      confidence: ruleAuthority(0.93),
      origin: 'built-in',
    },
    {
      id: 'rule-conditions',
      fieldKey: 'CONDITIONS',
      entityType: 'Route',
      meaningStatement: 'A plain-language sky/precipitation summary for the route.',
      match: 'A conditions code is present.',
      authority: 'Weather feed calibration',
      confidence: ruleAuthority(0.9),
      origin: 'built-in',
    },
    {
      id: 'rule-pressure-hpa',
      fieldKey: 'PRESSURE_HPA',
      entityType: 'Route',
      meaningStatement: 'Barometric pressure at the route.',
      match: 'A pressure reading in hPa is present.',
      authority: 'Barometric altitude model',
      confidence: ruleAuthority(0.92),
      origin: 'built-in',
    },
    {
      id: 'rule-visibility-km',
      fieldKey: 'VISIBILITY_KM',
      entityType: 'Route',
      meaningStatement: 'How far a climber can reasonably expect to see along the route.',
      match: 'A visibility distance in km is present.',
      authority: 'Weather feed calibration',
      confidence: ruleAuthority(0.87),
      origin: 'built-in',
    },
    {
      id: 'rule-route-code',
      fieldKey: 'ROUTE_CODE',
      entityType: 'Route',
      meaningStatement: 'Which route this record concerns.',
      match: 'A route code matches a known route.',
      authority: 'Operator SOP v3',
      confidence: ruleAuthority(0.95),
      origin: 'built-in',
    },
    {
      id: 'rule-forecast-confidence',
      fieldKey: 'FORECAST_CONFIDENCE_PCT',
      entityType: 'Route',
      meaningStatement: "The forecast model's own confidence in this reading.",
      match: 'A forecast model confidence percentage is present.',
      authority: 'Weather feed calibration',
      confidence: ruleAuthority(0.9),
      origin: 'built-in',
    },
    {
      id: 'rule-blood-group',
      fieldKey: 'BLOOD_GROUP',
      entityType: 'Climber',
      meaningStatement: 'Blood group on file.',
      match: 'A blood-group code is present.',
      authority: 'Medical log intake form',
      confidence: ruleAuthority(0.99),
      origin: 'built-in',
    },
    {
      id: 'rule-allergies',
      fieldKey: 'ALLERGIES',
      entityType: 'Climber',
      meaningStatement: 'Known allergies on file.',
      match: 'An allergies field is present, even when empty.',
      authority: 'Medical log intake form',
      confidence: ruleAuthority(0.97),
      origin: 'built-in',
    },
    {
      id: 'rule-resting-hr',
      fieldKey: 'RESTING_HR_BPM',
      entityType: 'Climber',
      meaningStatement: 'Resting heart rate on file.',
      match: 'A resting heart-rate reading in bpm is present.',
      authority: 'Medical log intake form',
      confidence: ruleAuthority(0.96),
      origin: 'built-in',
    },
    {
      id: 'rule-spo2-baseline',
      fieldKey: 'SPO2_BASELINE_PCT',
      entityType: 'Climber',
      meaningStatement: "This climber's own blood-oxygen acclimatisation baseline.",
      match: 'A baseline blood-oxygen percentage is present.',
      authority: 'Clinical reference (Lake Louise acclimatisation guidance)',
      confidence: ruleAuthority(0.95),
      origin: 'built-in',
    },
    {
      id: 'rule-permit-no',
      fieldKey: 'PERMIT_NO',
      entityType: 'Climber',
      meaningStatement: 'Permit number, verified against the registry.',
      match: 'A permit number matches the registry format.',
      authority: 'Permit registry',
      confidence: ruleAuthority(0.99),
      origin: 'built-in',
    },
    {
      id: 'rule-date-of-birth',
      fieldKey: 'DATE_OF_BIRTH',
      entityType: 'Climber',
      meaningStatement: "Date of birth on file, confirming this permit's holder.",
      match: 'A date of birth in ISO format is present.',
      authority: 'Permit registry',
      confidence: ruleAuthority(0.97),
      origin: 'built-in',
    },
    {
      id: 'rule-nationality',
      fieldKey: 'NATIONALITY',
      entityType: 'Climber',
      meaningStatement: "Nationality on file, matching the permit's issuing country.",
      match: 'A nationality field is present.',
      authority: 'Permit registry',
      confidence: ruleAuthority(0.94),
      origin: 'built-in',
    },
    {
      id: 'rule-operator-name',
      fieldKey: 'OPERATOR_NAME',
      entityType: 'Operator',
      meaningStatement: 'A registered expedition operator.',
      match: 'An operator name matches the registry.',
      authority: 'Operator SOP v3',
      confidence: ruleAuthority(0.98),
      origin: 'built-in',
    },
    {
      id: 'rule-climber-count',
      fieldKey: 'CLIMBER_COUNT',
      entityType: 'Operator',
      meaningStatement: 'How many climbers currently sit under this operator.',
      match: 'A climber count is present in the roster.',
      authority: 'Operator roster feed',
      confidence: ruleAuthority(0.96),
      origin: 'built-in',
    },
    {
      id: 'rule-ascent-rate',
      fieldKey: 'ASCENT_RATE_30D_PCT',
      entityType: 'Operator',
      meaningStatement: "This operator's ascent rate against this route's 30-day norm.",
      match: 'A 30-day ascent-rate percentage is present.',
      authority: 'Operator roster feed',
      confidence: ruleAuthority(0.93),
      origin: 'built-in',
    },
    {
      id: 'rule-uiaa-grade',
      fieldKey: 'ROUTE_GRADE',
      entityType: 'Route',
      meaningStatement: 'A normalised UIAA grade — not exercised by the readings below, kept here for completeness.',
      match: "A route's difficulty code matches a recognised UIAA scale value.",
      authority: 'UIAA grade scale',
      confidence: ruleAuthority(0.95),
      origin: 'built-in',
    },
  ]
}

// -- applying rules -----------------------------------------------------------

function boundSentence(key: string, raw: Record<string, unknown>, rule: ContextRule): string {
  switch (key) {
    case 'DEV_ID':
      return `Sensor 4, watching the Everest Base Camp route.`
    case 'TS':
      return `Reading captured a few seconds before it arrived.`
    case 'SPO2_VAL':
      return `Blood oxygen ${raw.SPO2_VAL}% — down from this climber's own 90% acclimatisation baseline.`
    case 'HR':
      return `Heart rate ${raw.HR} bpm — elevated, consistent with exertion at altitude.`
    case 'AMB_P':
      return `Air pressure ${raw.AMB_P} hPa — consistent with Camp III, around 7,100m.`
    case 'LAT':
      return `Position resolves inside the Khumbu region.`
    case 'LON':
      return `Position confirms the Everest Base Camp route.`
    case 'BATT':
      return `Battery ${Math.round((raw.BATT as number) * 100)}% — replacement threshold is 20%.`
    case 'TEMP_C':
      return `Temperature ${raw.TEMP_C}°C at ridge elevation.`
    case 'CONDITIONS':
      return `${raw.CONDITIONS} conditions along the route.`
    case 'PRESSURE_HPA':
      return `Barometric pressure ${raw.PRESSURE_HPA} hPa.`
    case 'VISIBILITY_KM':
      return `Visibility ${raw.VISIBILITY_KM} km.`
    case 'ROUTE_CODE':
      return `Confirms the Everest Base Camp route.`
    case 'FORECAST_CONFIDENCE_PCT':
      return `This forecast carries ${raw.FORECAST_CONFIDENCE_PCT}% model confidence.`
    case 'BLOOD_GROUP':
      return `Blood group ${raw.BLOOD_GROUP}.`
    case 'ALLERGIES':
      return `Allergies on file: ${raw.ALLERGIES}.`
    case 'RESTING_HR_BPM':
      return `Resting heart rate ${raw.RESTING_HR_BPM} bpm.`
    case 'SPO2_BASELINE_PCT':
      return `Blood-oxygen baseline ${raw.SPO2_BASELINE_PCT}%, this climber's own acclimatisation reference.`
    case 'PERMIT_NO':
      return `Permit ${raw.PERMIT_NO}, verified against the registry.`
    case 'DATE_OF_BIRTH':
      return `Date of birth ${raw.DATE_OF_BIRTH} on file.`
    case 'NATIONALITY':
      return `Nationality on file: ${raw.NATIONALITY}.`
    case 'OPERATOR_NAME':
      return `${raw.OPERATOR_NAME}, a registered expedition operator.`
    case 'CLIMBER_COUNT':
      return `${raw.CLIMBER_COUNT} climbers currently sit under this operator.`
    case 'ASCENT_RATE_30D_PCT':
      return `Ascent rate is ${raw.ASCENT_RATE_30D_PCT}% of this route's 30-day norm.`
    default:
      // A newly human-bound field (e.g. ADD A RULE) has no bespoke sentence
      // yet — compose one from the rule's own meaning and the raw value,
      // rather than echoing the raw value back with no meaning attached.
      return `${rule.meaningStatement} — ${String(raw[key])}`
  }
}

function applyRulesToReading(spec: ReadingSpec, rules: ContextRule[]): Reading {
  const ruleByField = new Map(rules.map((r) => [r.fieldKey, r]))
  const boundFields: BoundStatement[] = []
  const unbound: UnboundField[] = []

  for (const [key, rawTv] of spec.rawFieldTvs) {
    const rule = ruleByField.get(key)
    if (!rule) {
      unbound.push({ key, rawValue: spec.raw[key] })
      continue
    }
    const sentence = boundSentence(key, spec.raw, rule)
    boundFields.push({
      fieldKey: key,
      ruleId: rule.id,
      entityType: rule.entityType,
      traced: bound(rawTv.id, contextRuleId(rule.id), sentence),
    })
  }

  return {
    id: spec.id,
    source: spec.source,
    about: spec.about,
    arrivedAt: spec.arrivedAt,
    takenAt: spec.takenAt,
    raw: spec.raw,
    rawFieldTvs: spec.rawFieldTvs,
    bound: boundFields,
    unbound,
    headlineFieldKey: spec.headlineFieldKey,
    headline: spec.headline,
  }
}

export function buildContextEngine(specs: ReadingSpec[], rules: ContextRule[] = builtInRules()): ContextEngineState {
  return {
    readings: specs.map((spec) => applyRulesToReading(spec, rules)),
    rules,
  }
}

// -- coverage -------------------------------------------------------------

export function coverageStat(boundCount: number, totalCount: number): CoverageStat {
  return { totalFields: totalCount, boundFields: boundCount, pct: totalCount === 0 ? 0 : Math.round((boundCount / totalCount) * 100) }
}

export function readingCoverage(reading: Reading): CoverageStat {
  return coverageStat(reading.bound.length, reading.bound.length + reading.unbound.length)
}

/** "ACROSS ALL SOURCES" — every distinct field across every reading, bound vs not. Real aggregation over the live reading list, not a separate hand-maintained figure. */
export function systemWideCoverage(state: ContextEngineState): CoverageStat {
  let total = 0
  let boundCount = 0
  for (const r of state.readings) {
    total += r.bound.length + r.unbound.length
    boundCount += r.bound.length
  }
  return coverageStat(boundCount, total)
}

/** One row per source — "fields received · fields bound · coverage · which fields are still unbound," the breakdown Coverage needs to explain the two different headline percentages. */
export function perSourceCoverage(state: ContextEngineState): SourceCoverage[] {
  const bySource = new Map<string, Reading[]>()
  for (const r of state.readings) {
    const list = bySource.get(r.source) ?? []
    list.push(r)
    bySource.set(r.source, list)
  }
  const out: SourceCoverage[] = []
  for (const [source, readings] of bySource) {
    const received = readings.reduce((n, r) => n + r.bound.length + r.unbound.length, 0)
    const boundCount = readings.reduce((n, r) => n + r.bound.length, 0)
    const stillUnbound = Array.from(new Set(readings.flatMap((r) => r.unbound.map((u) => u.key))))
    out.push({ source, received, boundCount, pct: coverageStat(boundCount, received).pct, stillUnbound })
  }
  return out
}

// -- ADD A RULE -----------------------------------------------------------

/** Binds a currently-unbound field to a human-authored meaning, system-wide — any reading with that field key unbound gets it bound. Returns new state; Meaning.tsx owns holding onto the result as live state, same as every other engine in this app. */
export function addHumanRule(
  state: ContextEngineState,
  fieldKey: string,
  meaning: string,
  entityType: EntityType,
  authority: string
): ContextEngineState {
  const stillUnbound = state.readings.some((r) => r.unbound.some((u) => u.key === fieldKey))
  if (!stillUnbound) return state

  const newRule: ContextRule = {
    id: `rule-human-${fieldKey.toLowerCase()}`,
    fieldKey,
    entityType,
    meaningStatement: meaning,
    match: `A ${fieldKey} field is present.`,
    authority,
    confidence: ruleAuthority(0.75),
    origin: 'human',
  }
  const rules = [...state.rules, newRule]
  const specs: ReadingSpec[] = state.readings.map((r) => ({
    id: r.id,
    source: r.source,
    about: r.about,
    arrivedAt: r.arrivedAt,
    takenAt: r.takenAt,
    raw: r.raw,
    rawFieldTvs: r.rawFieldTvs,
    headlineFieldKey: r.headlineFieldKey,
    headline: r.headline,
  }))
  return buildContextEngine(specs, rules)
}

export function findReading(state: ContextEngineState, readingId: string): Reading | undefined {
  return state.readings.find((r) => r.id === readingId)
}

/** Every field key currently unbound in at least one reading, deduplicated — what ADD A RULE's field picker offers. */
export function allUnboundFieldKeys(state: ContextEngineState): string[] {
  const keys = new Set<string>()
  for (const r of state.readings) for (const u of r.unbound) keys.add(u.key)
  return Array.from(keys)
}
