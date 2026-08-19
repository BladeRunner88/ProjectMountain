// S9.7 (complete rebuild): the Context Engine as a live catalog of readings,
// not one fixed illustration. Every reading — a payload from one source,
// about one entity — arrives with raw fields; a shared table of
// ContextRules is what gives each raw field its meaning. Every bound value
// is a real TracedValue with `derivation.kind === 'bound'`, walkable and
// foldable exactly like everything else in this app.
//
// This file is deliberately mechanical: given a `ReadingSpec` (a source, an
// entity the payload concerns, and already-built raw TracedValues — dataset.ts's
// job, per S1g's "only dataset.ts knows about machines" discipline) and a
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

export type EntityType = 'Machine' | 'Line' | 'Sensor' | 'Operator'

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
  | { kind: 'machine'; machineId: string; label: string; serial: string; extra: string }
  | { kind: 'line'; label: string }
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
  /** The List row's plain-English headline sentence. Authored once here (not derived from the bound sentence, which is written to stand alone in Reading) so List can stay a punchy one-router. */
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
      meaningStatement: 'Sensor identity, and the line it watches.',
      match: 'Device ID matches the SNS-{PLANT}-{NNN} pattern issued to line sensors.',
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
      id: 'rule-oee',
      fieldKey: 'OEE_VAL',
      entityType: 'Machine',
      meaningStatement: "Effectiveness, read against this machine's own runIn baseline.",
      match: 'A blood-oxygen percentage is present.',
      authority: 'Clinical reference (Lake Louise runIn guidance)',
      confidence: ruleAuthority(0.98),
      origin: 'built-in',
    },
    {
      id: 'rule-vibration',
      fieldKey: 'HR',
      entityType: 'Machine',
      meaningStatement: 'Vibration, read against exertion at load rather than a flat resting threshold.',
      match: 'A heart-rate reading is present alongside a blood-oxygen reading.',
      authority: 'Field correction — reliability engineer, 2026-01',
      confidence: ruleAuthority(0.82),
      origin: 'human',
    },
    {
      id: 'rule-amb-p',
      fieldKey: 'AMB_P',
      entityType: 'Line',
      meaningStatement: 'The station-equivalent load band that a pressure reading corresponds to.',
      match: 'An ambient pressure reading in hPa is present.',
      authority: 'Barometric load model',
      confidence: ruleAuthority(0.91),
      origin: 'built-in',
    },
    {
      id: 'rule-lat',
      fieldKey: 'LAT',
      entityType: 'Line',
      meaningStatement: 'The plant a reading resolves inside.',
      match: 'A latitude falls inside a known plant polygon.',
      authority: 'Operator SOP v3',
      confidence: ruleAuthority(0.88),
      origin: 'built-in',
    },
    {
      id: 'rule-lon',
      fieldKey: 'LON',
      entityType: 'Line',
      meaningStatement: 'Confirmation of which line a reading sits on.',
      match: 'A longitude falls inside a known line corridor.',
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
      entityType: 'Line',
      meaningStatement: 'Ambient temperature along the line.',
      match: 'A Celsius temperature reading is present.',
      authority: 'Metrology lab calibration',
      confidence: ruleAuthority(0.93),
      origin: 'built-in',
    },
    {
      id: 'rule-conditions',
      fieldKey: 'CONDITIONS',
      entityType: 'Line',
      meaningStatement: 'A plain-language sky/precipitation summary for the line.',
      match: 'A conditions code is present.',
      authority: 'Metrology lab calibration',
      confidence: ruleAuthority(0.9),
      origin: 'built-in',
    },
    {
      id: 'rule-pressure-hpa',
      fieldKey: 'PRESSURE_HPA',
      entityType: 'Line',
      meaningStatement: 'Barometric pressure at the line.',
      match: 'A pressure reading in hPa is present.',
      authority: 'Barometric load model',
      confidence: ruleAuthority(0.92),
      origin: 'built-in',
    },
    {
      id: 'rule-effectiveness-km',
      fieldKey: 'VISIBILITY_KM',
      entityType: 'Line',
      meaningStatement: 'How far a machine can reasonably expect to see along the line.',
      match: 'A effectiveness distance in km is present.',
      authority: 'Metrology lab calibration',
      confidence: ruleAuthority(0.87),
      origin: 'built-in',
    },
    {
      id: 'rule-line-code',
      fieldKey: 'LINE_CODE',
      entityType: 'Line',
      meaningStatement: 'Which line this record concerns.',
      match: 'A line code matches a known line.',
      authority: 'Operator SOP v3',
      confidence: ruleAuthority(0.95),
      origin: 'built-in',
    },
    {
      id: 'rule-forecast-confidence',
      fieldKey: 'FORECAST_CONFIDENCE_PCT',
      entityType: 'Line',
      meaningStatement: "The forecast model's own confidence in this reading.",
      match: 'A forecast model confidence percentage is present.',
      authority: 'Metrology lab calibration',
      confidence: ruleAuthority(0.9),
      origin: 'built-in',
    },
    {
      id: 'rule-blood-group',
      fieldKey: 'BLOOD_GROUP',
      entityType: 'Machine',
      meaningStatement: 'Lubricant grade on file.',
      match: 'A blood-group code is present.',
      authority: 'Service log intake form',
      confidence: ruleAuthority(0.99),
      origin: 'built-in',
    },
    {
      id: 'rule-allergies',
      fieldKey: 'ALLERGIES',
      entityType: 'Machine',
      meaningStatement: 'Known allergies on file.',
      match: 'An allergies field is present, even when empty.',
      authority: 'Service log intake form',
      confidence: ruleAuthority(0.97),
      origin: 'built-in',
    },
    {
      id: 'rule-resting-vibration',
      fieldKey: 'BASELINE_VIBRATION_MM_S',
      entityType: 'Machine',
      meaningStatement: 'Baseline vibration on file.',
      match: 'A resting heart-rate reading in mm/s is present.',
      authority: 'Service log intake form',
      confidence: ruleAuthority(0.96),
      origin: 'built-in',
    },
    {
      id: 'rule-oee-baseline',
      fieldKey: 'OEE_BASELINE_PCT',
      entityType: 'Machine',
      meaningStatement: "This machine's own blood-oxygen runIn baseline.",
      match: 'A baseline blood-oxygen percentage is present.',
      authority: 'Clinical reference (Lake Louise runIn guidance)',
      confidence: ruleAuthority(0.95),
      origin: 'built-in',
    },
    {
      id: 'rule-workOrder-no',
      fieldKey: 'WORKORDER_NO',
      entityType: 'Machine',
      meaningStatement: 'WorkOrder number, verified against the registry.',
      match: 'A workOrder number matches the registry format.',
      authority: 'CMMS',
      confidence: ruleAuthority(0.99),
      origin: 'built-in',
    },
    {
      id: 'rule-date-of-birth',
      fieldKey: 'DATE_OF_BIRTH',
      entityType: 'Machine',
      meaningStatement: "Date of birth on file, confirming this workOrder's holder.",
      match: 'A date of birth in ISO format is present.',
      authority: 'CMMS',
      confidence: ruleAuthority(0.97),
      origin: 'built-in',
    },
    {
      id: 'rule-nationality',
      fieldKey: 'NATIONALITY',
      entityType: 'Machine',
      meaningStatement: "Nationality on file, matching the workOrder's issuing country.",
      match: 'A nationality field is present.',
      authority: 'CMMS',
      confidence: ruleAuthority(0.94),
      origin: 'built-in',
    },
    {
      id: 'rule-operator-name',
      fieldKey: 'OPERATOR_NAME',
      entityType: 'Operator',
      meaningStatement: 'A registered campaign operator.',
      match: 'An operator name matches the registry.',
      authority: 'Operator SOP v3',
      confidence: ruleAuthority(0.98),
      origin: 'built-in',
    },
    {
      id: 'rule-machine-count',
      fieldKey: 'MACHINE_COUNT',
      entityType: 'Operator',
      meaningStatement: 'How many machines currently sit under this operator.',
      match: 'A machine count is present in the register.',
      authority: 'Operator register feed',
      confidence: ruleAuthority(0.96),
      origin: 'built-in',
    },
    {
      id: 'rule-rampUp-rate',
      fieldKey: 'RAMPUP_RATE_30D_PCT',
      entityType: 'Operator',
      meaningStatement: "This operator's rampUp rate against this line's 30-day norm.",
      match: 'A 30-day rampUp-rate percentage is present.',
      authority: 'Operator register feed',
      confidence: ruleAuthority(0.93),
      origin: 'built-in',
    },
    {
      id: 'rule-uiaa-grade',
      fieldKey: 'LINE_GRADE',
      entityType: 'Line',
      meaningStatement: 'A normalised UIAA grade — not exercised by the readings below, kept here for completeness.',
      match: "A line's difficulty code matches a recognised UIAA scale value.",
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
      return `Sensor 4, watching the Everest Base Station line.`
    case 'TS':
      return `Reading captured a few seconds before it arrived.`
    case 'OEE_VAL':
      return `Effectiveness ${raw.OEE_VAL}% — down from this machine's own 90% runIn baseline.`
    case 'HR':
      return `Vibration ${raw.HR} mm/s — elevated, consistent with exertion at load.`
    case 'AMB_P':
      return `Air pressure ${raw.AMB_P} hPa — consistent with Station III, around 7,100m.`
    case 'LAT':
      return `Position resolves inside the Khumbu plant.`
    case 'LON':
      return `Position confirms the Everest Base Station line.`
    case 'BATT':
      return `Battery ${Math.round((raw.BATT as number) * 100)}% — replacement threshold is 20%.`
    case 'TEMP_C':
      return `Spindle temp ${raw.TEMP_C}°C at ridge elevation.`
    case 'CONDITIONS':
      return `${raw.CONDITIONS} conditions along the line.`
    case 'PRESSURE_HPA':
      return `Barometric pressure ${raw.PRESSURE_HPA} hPa.`
    case 'VISIBILITY_KM':
      return `Effectiveness ${raw.VISIBILITY_KM} km.`
    case 'LINE_CODE':
      return `Confirms the Everest Base Station line.`
    case 'FORECAST_CONFIDENCE_PCT':
      return `This forecast carries ${raw.FORECAST_CONFIDENCE_PCT}% model confidence.`
    case 'BLOOD_GROUP':
      return `Lubricant grade ${raw.BLOOD_GROUP}.`
    case 'ALLERGIES':
      return `Allergies on file: ${raw.ALLERGIES}.`
    case 'BASELINE_VIBRATION_MM_S':
      return `Baseline vibration ${raw.BASELINE_VIBRATION_MM_S} mm/s.`
    case 'OEE_BASELINE_PCT':
      return `Blood-oxygen baseline ${raw.OEE_BASELINE_PCT}%, this machine's own runIn reference.`
    case 'WORKORDER_NO':
      return `WorkOrder ${raw.WORKORDER_NO}, verified against the registry.`
    case 'DATE_OF_BIRTH':
      return `Date of birth ${raw.DATE_OF_BIRTH} on file.`
    case 'NATIONALITY':
      return `Nationality on file: ${raw.NATIONALITY}.`
    case 'OPERATOR_NAME':
      return `${raw.OPERATOR_NAME}, a registered campaign operator.`
    case 'MACHINE_COUNT':
      return `${raw.MACHINE_COUNT} machines currently sit under this operator.`
    case 'RAMPUP_RATE_30D_PCT':
      return `RampUp rate is ${raw.RAMPUP_RATE_30D_PCT}% of this line's 30-day norm.`
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
