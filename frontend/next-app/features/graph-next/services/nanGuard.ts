// S8.2 rule 5: NO NaN ESCAPES. A dev-only assert on every coordinate
// produced by layout, offsets and the viewBox. A failed assert logs the id,
// the inputs and the formula, and returns the previous good value rather
// than rendering a broken frame — never a silent NaN, never a dropped node.

import type { GraphId, Point } from '../types/graph'

import { IS_DEV } from './env'

// Per-id last-known-good cache — module-scoped since there is exactly one
// graph store per session (S8.2 rule 1: ONE STORE). `resetNanGuard` exists
// so tests can start each case from a clean slate.
const lastGood = new Map<GraphId, Point>()

export function resetNanGuard(): void {
  lastGood.clear()
}

function isFinitePoint(p: Point): boolean {
  return Number.isFinite(p.x) && Number.isFinite(p.y)
}

/**
 * Checks one computed coordinate. In dev, a non-finite value is logged with
 * exactly what produced it (id, formula name, inputs) and swapped for the
 * last good value this id ever had — the frame stays valid, no element gets
 * a NaN attribute, nothing silently disappears. In production the check is
 * skipped entirely (the cost of a per-node dev-only console.error path has
 * no place in the hot render loop once shipped).
 */
export function assertFinitePoint(id: GraphId, p: Point, formula: string, inputs: Record<string, unknown>): Point {
  if (!IS_DEV) return p
  if (!isFinitePoint(p)) {
     
    console.error(`[graph] non-finite coordinate for "${id}" from ${formula}(${JSON.stringify(inputs)}) — held at last good value`, p)
    return lastGood.get(id) ?? { x: 0, y: 0 }
  }
  lastGood.set(id, p)
  return p
}

/** Same check for a single scalar (e.g. one viewBox component) — no per-id identity to fall back on, so the caller supplies the fallback. */
export function assertFiniteNumber(label: string, value: number, fallback: number, inputs: Record<string, unknown>): number {
  if (!IS_DEV) return value
  if (!Number.isFinite(value)) {
     
    console.error(`[graph] non-finite value for "${label}"(${JSON.stringify(inputs)}) — held at ${fallback}`, value)
    return fallback
  }
  return value
}
