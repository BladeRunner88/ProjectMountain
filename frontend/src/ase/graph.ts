// The derivation graph's storage: a TracedValue's `derivation.from`/`froms`
// are references (TracedId), not embedded objects — folding or walking
// provenance means resolving those references back to real values. Every
// TracedValue ever built (via traced.ts's builders) registers itself here
// automatically; nothing else writes to this registry.

import type { TracedId, TracedValue } from './traced'

const registry = new Map<TracedId, TracedValue<unknown>>()

// S2: confidence() memoizes per (id, asOf), and dependents() caches a
// reverse index — both need to know when the graph has actually changed so
// they can invalidate rather than serve a stale answer forever, without
// folds.ts importing anything back into graph.ts (that would be circular,
// since graph.ts is the lower-level module). A version counter bumped on
// every write is the simplest thing that can't get out of sync: folds.ts
// just compares it, never has to be told explicitly.
let version = 0

export function graphVersion(): number {
  return version
}

export function register(tv: TracedValue<unknown>): void {
  registry.set(tv.id, tv as TracedValue<unknown>)
  version++
}

export function resolve(id: TracedId): TracedValue<unknown> | undefined {
  return registry.get(id)
}

/** Throws on a dangling reference — a derivation citing a TracedId that was never registered is a bug in the dataset, not a value to silently skip. */
export function resolveOrThrow(id: TracedId): TracedValue<unknown> {
  const tv = registry.get(id)
  if (!tv) throw new Error(`Dangling TracedId in derivation graph: ${id}`)
  return tv
}

export function allTraced(): TracedValue<unknown>[] {
  return [...registry.values()]
}

/** Test-only: dataset builders create a fresh graph per test, not a global one that leaks between them. */
export function clearRegistry(): void {
  registry.clear()
  version++
}

/**
 * Marks `oldId` as superseded by `newTv` (S1f's live tick: a fresh
 * observation arriving supersedes the value it replaces). A TracedValue's
 * content is otherwise immutable once built — this is the one sanctioned
 * mutation, bookkeeping on an existing record rather than rewriting it,
 * the same way a database row's `superseded_at` column gets set without
 * touching the row's original content. `ase/activity.ts`'s `recentChanges`
 * is what reads this back out.
 */
export function supersede(oldId: TracedId, newTv: TracedValue<unknown>): void {
  const old = resolveOrThrow(oldId)
  old.supersededAt = newTv.recordedAt
  old.supersededBy = newTv.id
  version++
}

/** Walks `supersededBy` forward to whatever currently stands in for `tv` — what every screen should render instead of a reference captured once at dataset-build time, so a live tick's supersession actually reaches the pixel. */
export function latest(tv: TracedValue<unknown>): TracedValue<unknown> {
  let current = tv
  while (current.supersededBy) {
    current = resolveOrThrow(current.supersededBy)
  }
  return current
}
