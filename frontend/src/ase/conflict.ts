// S9.4: sources disagree constantly, and how ASE decides is a policy
// object, not a footnote. Everything here is domain-agnostic engine
// infrastructure — it knows how to pick a winner between two TracedValues
// given a strategy, and how to re-resolve live when a human changes that
// strategy. It has no idea what a "climber" or a "date of birth" is; the
// five real conflicts (which properties, which entities, which policy) are
// authored in dataset.ts, exactly like every other domain fact in this app.
//
// Resolution never discards a value — the losing observation stays in the
// graph, reachable via `conflict.a`/`conflict.b`, unaffected. The winner
// becomes a real 'derived' TracedValue whose `from` is BOTH inputs, so a
// human looking at this months later can walk straight back to what lost
// and why.

import { derived, type DerivationFnId, type TracedValue, derivationFnId } from './traced'
import type { SourceId } from './traced'
import { confidence } from './folds'
import { supersede } from './graph'

// A "subject:metric" fn slug — same convention `activity.ts` already reads
// for 'observed' rawFields, extended to 'derived' fn ids so a resolved
// conflict value (and whatever it feeds downstream) composes into real
// English too, e.g. "James Marshall III's age changed from 34 to 35."
// Generic string shaping, not a lookup table — this file still has no idea
// what an "age" or a "climber" is.
function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

export function conflictFnSlug(entityLabel: string, propertyLabel: string): DerivationFnId {
  return derivationFnId(`${slugify(entityLabel)}:${slugify(propertyLabel)}`)
}

export type ConflictStrategy = 'source-priority' | 'most-recent' | 'highest-confidence' | 'human-required' | 'range-merge'

export const CONFLICT_STRATEGY_LABEL: Record<ConflictStrategy, string> = {
  'source-priority': 'Source priority',
  'most-recent': 'Most recent',
  'highest-confidence': 'Highest confidence',
  'human-required': 'Needs a human',
  'range-merge': 'Range merge',
}

export interface ConflictPolicy {
  id: string
  property: string
  strategy: ConflictStrategy
  sourcePriority?: SourceId[]
  /** Why THIS strategy for THIS property — one sentence, always human-authored, never templated. */
  rationale: string
}

export interface ConflictDownstream {
  label: string
  traced: TracedValue<unknown>
  format: (value: unknown) => string
  recompute: (resolvedValue: unknown) => unknown
}

export interface Conflict {
  id: string
  entityLabel: string
  propertyLabel: string
  policy: ConflictPolicy
  /** The strategies this property can sensibly be resolved by — a UI picker's option list, never all five unconditionally (e.g. two same-source sensor readings can't be resolved by source-priority). */
  availablePolicies: ConflictPolicy[]
  a: TracedValue<unknown>
  aOrigin: string
  b: TracedValue<unknown>
  bOrigin: string
  /** null exactly when the active policy is 'human-required' and nobody has decided yet. */
  resolved: TracedValue<unknown> | null
  format: (value: unknown) => string
  /** Real derived values elsewhere in the graph that this conflict's resolution feeds — recomputed and superseded, in order, whenever the policy changes and the resolved value actually moves. */
  downstream: ConflictDownstream[]
  /** Resolves `a`/`b` under `policy` WITHOUT mutating anything — pure, so it can be called speculatively (e.g. to preview) as well as by `applyConflictPolicy`. */
  resolve: (policy: ConflictPolicy) => TracedValue<unknown> | null
}

function sourceOf(tv: TracedValue<unknown>): SourceId | null {
  return tv.derivation.kind === 'observed' ? tv.derivation.source : null
}

function pickBySourcePriority<T>(a: TracedValue<T>, b: TracedValue<T>, priority: SourceId[]): TracedValue<T> {
  const rank = (tv: TracedValue<T>): number => {
    const src = sourceOf(tv)
    const idx = src === null ? -1 : priority.indexOf(src)
    return idx === -1 ? Infinity : idx
  }
  return rank(a) <= rank(b) ? a : b
}

function pickByMostRecent<T>(a: TracedValue<T>, b: TracedValue<T>): TracedValue<T> {
  return a.recordedAt >= b.recordedAt ? a : b
}

function pickByHighestConfidence<T>(a: TracedValue<T>, b: TracedValue<T>): TracedValue<T> {
  return confidence(a) >= confidence(b) ? a : b
}

/** The three "pick one of the two" strategies — same T in, same T out. `human-required` and `range-merge` return null here on purpose: the first has no automatic winner, the second produces a DIFFERENT value (an interval), not a pick, so it's built with `resolveRangeMerge` instead. */
export function pickConflictWinner<T>(a: TracedValue<T>, b: TracedValue<T>, policy: ConflictPolicy): TracedValue<T> | null {
  switch (policy.strategy) {
    case 'source-priority':
      return pickBySourcePriority(a, b, policy.sourcePriority ?? [])
    case 'most-recent':
      return pickByMostRecent(a, b)
    case 'highest-confidence':
      return pickByHighestConfidence(a, b)
    case 'human-required':
    case 'range-merge':
      return null
  }
}

/** Builds the resolved TracedValue for a pick-one-of-two strategy — `derived([a.id, b.id], ..., winner.value)`, never `winner` itself, so the resolution is its own traceable fact rather than an alias for whichever input won. `fn` is the caller's (domain-specific) slug for what this fact IS — see `conflictFnSlug` — kept stable across strategy switches so repeated resolutions of the same property read as the same ongoing fact in the activity lane, not a new one each time. */
export function resolveConflict<T>(a: TracedValue<T>, b: TracedValue<T>, policy: ConflictPolicy, fn: DerivationFnId): TracedValue<T> | null {
  const winner = pickConflictWinner(a, b, policy)
  if (!winner) return null
  return derived([a.id, b.id], fn, winner.value)
}

/** `range-merge`: neither reading is "wrong" — the interval between them IS the answer, with the uncertainty that implies. */
export function resolveRangeMerge(a: TracedValue<number>, b: TracedValue<number>, fn: DerivationFnId): TracedValue<{ min: number; max: number }> {
  return derived([a.id, b.id], fn, { min: Math.min(a.value, b.value), max: Math.max(a.value, b.value) })
}

/**
 * The CHANGE POLICY action (S9.4 acceptance): re-resolves `conflict` under
 * `newPolicy` and, if the resolved value actually moves, supersedes it in
 * the real graph — never authors a second value out-of-band — then walks
 * `conflict.downstream` and does the same for every real derived value that
 * depends on it, so "switching a policy visibly changes X" is a genuine
 * supersession chain, not a UI-only re-render.
 */
export function applyConflictPolicy(conflict: Conflict, newPolicy: ConflictPolicy): void {
  const previous = conflict.resolved
  const next = conflict.resolve(newPolicy)
  conflict.policy = newPolicy

  if (!next) {
    // Switched TO human-required (or the strategy still can't pick one) —
    // nothing to supersede; the graph keeps whatever it last had, the panel
    // just stops claiming a resolution exists going forward.
    conflict.resolved = null
    return
  }
  if (!previous) {
    // First-ever resolution — nothing existed before to supersede from.
    conflict.resolved = next
    return
  }
  if (previous.value === next.value) {
    // Different strategy, same winner — the policy changed, the fact didn't.
    return
  }

  supersede(previous.id, next)
  conflict.resolved = next
  for (const d of conflict.downstream) {
    const nextValue = d.recompute(next.value)
    const nextTv = derived([next.id], conflictFnSlug(conflict.entityLabel, d.label), nextValue)
    supersede(d.traced.id, nextTv)
    d.traced = nextTv
  }
}
