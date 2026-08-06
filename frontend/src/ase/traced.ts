import { register } from './graph'

// The atomic unit of everything ASE shows. A TracedValue is never just a
// value — it's a value plus the derivation tree that produced it. Every
// other spine block (S2's folds, S3's bitemporal store, S4's conflict
// policy) operates on this type and nothing else.
//
// CRITICAL: confidence is not a field here, on purpose. It is FOLDED from
// `derivation` by exactly one function, which lives in S2 — never stored,
// never authored, never assigned by a screen. A TracedValue that carried
// its own confidence number would let a UI drift from the graph that's
// supposed to be its only source of truth.

// -- branded primitives -----------------------------------------------------
// Branded, not bare strings/numbers — a Confidence can't be handed a raw 1.5,
// a SourceId can't be handed a TransformId, by construction, not convention.

export type Confidence = number & { readonly __brand: 'Confidence' }
export type Instant = string & { readonly __brand: 'ISO8601' }
export type TracedId = string & { readonly __brand: 'TracedId' }
export type SourceId = string & { readonly __brand: 'SourceId' }
export type TransformId = string & { readonly __brand: 'TransformId' }
export type MatchRuleId = string & { readonly __brand: 'MatchRuleId' }
export type ContextRuleId = string & { readonly __brand: 'ContextRuleId' }
export type DerivationFnId = string & { readonly __brand: 'DerivationFnId' }
export type PatternId = string & { readonly __brand: 'PatternId' }
export type ActorId = string & { readonly __brand: 'ActorId' }
export type ModelId = string & { readonly __brand: 'ModelId' }

// No brand constructor for Confidence here, on purpose (S1b): the only two
// legal ways to get one are `sourceReliability()` (a seed parameter) and
// `confidence()` (a fold), both in folds.ts. Every other branded primitive
// below is fine to construct directly — this restriction is Confidence-only.
export function instant(iso: string): Instant {
  return iso as Instant
}
export function tracedId(s: string): TracedId {
  return s as TracedId
}
export function sourceId(s: string): SourceId {
  return s as SourceId
}
export function transformId(s: string): TransformId {
  return s as TransformId
}
export function matchRuleId(s: string): MatchRuleId {
  return s as MatchRuleId
}
export function contextRuleId(s: string): ContextRuleId {
  return s as ContextRuleId
}
export function derivationFnId(s: string): DerivationFnId {
  return s as DerivationFnId
}
export function patternId(s: string): PatternId {
  return s as PatternId
}
export function actorId(s: string): ActorId {
  return s as ActorId
}
export function modelId(s: string): ModelId {
  return s as ModelId
}

// -- derivation ---------------------------------------------------------

export type Derivation =
  | { kind: 'observed'; source: SourceId; rawField: string; rawValue: unknown; receivedAt: Instant; sourceReliability: Confidence }
  | { kind: 'normalised'; from: TracedId; transform: TransformId }
  | { kind: 'merged'; from: TracedId[]; rule: MatchRuleId; score: Confidence }
  | { kind: 'bound'; from: TracedId; contextRule: ContextRuleId }
  | { kind: 'derived'; from: TracedId[]; fn: DerivationFnId }
  | { kind: 'inferred'; from: TracedId[]; pattern: PatternId; support: number; contradictions: number }
  | { kind: 'asserted'; by: ActorId; at: Instant; note: string }
  | { kind: 'predicted'; from: TracedId[]; model: ModelId; horizonMins: number }

// -- the atomic unit ------------------------------------------------------

export interface TracedValue<T> {
  id: TracedId
  value: T
  derivation: Derivation
  validFrom: Instant
  validTo: Instant | null
  recordedAt: Instant
  supersededAt: Instant | null
  supersededBy: TracedId | null
}

// -- builders ---------------------------------------------------------------
// One per Derivation kind, so authoring the mock dataset stays readable —
// this is the ONLY place a Derivation literal gets constructed; every
// dataset builder in later blocks calls through here, never assembles a
// TracedValue by hand.

// Structure (which sources feed which merges, which rules fired) is what
// must be deterministic across runs, not the wall-clock instant a value was
// recorded at — `now()` reflects real time, same convention already used
// for every other live timestamp in this app (e.g. the pipeline's
// lastEventAt). Callers that need a fixed instant pass one via `meta`.
function now(): Instant {
  return instant(new Date().toISOString())
}

let idCounter = 0
function nextId(): TracedId {
  idCounter += 1
  return tracedId(`tv-${String(idCounter).padStart(6, '0')}`)
}

export interface TracedMeta {
  validFrom?: Instant
  validTo?: Instant | null
  recordedAt?: Instant
  supersededAt?: Instant | null
  supersededBy?: TracedId | null
}

function finalize<T>(value: T, derivation: Derivation, meta?: TracedMeta): TracedValue<T> {
  const recordedAt = meta?.recordedAt ?? now()
  const tv: TracedValue<T> = {
    id: nextId(),
    value,
    derivation,
    validFrom: meta?.validFrom ?? recordedAt,
    validTo: meta?.validTo ?? null,
    recordedAt,
    supersededAt: meta?.supersededAt ?? null,
    supersededBy: meta?.supersededBy ?? null,
  }
  register(tv as TracedValue<unknown>)
  return tv
}

/** A value straight from a connector — the base case, nothing derived from anything else yet. */
export function observed<T>(source: SourceId, rawField: string, raw: T, reliability: Confidence, meta?: TracedMeta): TracedValue<T> {
  const receivedAt = meta?.recordedAt ?? now()
  return finalize(raw, { kind: 'observed', source, rawField, rawValue: raw, receivedAt, sourceReliability: reliability }, meta)
}

/** A value reshaped from exactly one prior value — a format/unit change, nothing lost or combined. */
export function normalised<T>(from: TracedId, transform: TransformId, value: T, meta?: TracedMeta): TracedValue<T> {
  return finalize(value, { kind: 'normalised', from, transform }, meta)
}

/** A value produced by resolving two or more candidates into one entity. */
export function merged<T>(froms: TracedId[], rule: MatchRuleId, score: Confidence, value: T, meta?: TracedMeta): TracedValue<T> {
  return finalize(value, { kind: 'merged', from: froms, rule, score }, meta)
}

/** A value given business meaning by a context rule, from exactly one prior value. */
export function bound<T>(from: TracedId, contextRule: ContextRuleId, value: T, meta?: TracedMeta): TracedValue<T> {
  return finalize(value, { kind: 'bound', from, contextRule }, meta)
}

/** A value computed from one or more prior values by a named function. */
export function derived<T>(froms: TracedId[], fn: DerivationFnId, value: T, meta?: TracedMeta): TracedValue<T> {
  return finalize(value, { kind: 'derived', from: froms, fn }, meta)
}

/** A value produced by a learned pattern, carrying its own support/contradiction counts. */
export function inferred<T>(froms: TracedId[], pattern: PatternId, support: number, contradictions: number, value: T, meta?: TracedMeta): TracedValue<T> {
  return finalize(value, { kind: 'inferred', from: froms, pattern, support, contradictions }, meta)
}

/** A human override — supersedes whatever ASE concluded on its own. */
export function asserted<T>(by: ActorId, note: string, value: T, meta?: TracedMeta): TracedValue<T> {
  const at = meta?.recordedAt ?? now()
  return finalize(value, { kind: 'asserted', by, at, note }, meta)
}

/** A value projected forward by a model — never a fact yet, always a horizon. */
export function predicted<T>(froms: TracedId[], model: ModelId, horizonMins: number, value: T, meta?: TracedMeta): TracedValue<T> {
  return finalize(value, { kind: 'predicted', from: froms, model, horizonMins }, meta)
}
