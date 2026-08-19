// S8.2 rule 3: DRIFT PRODUCES OFFSETS, NEVER MUTATIONS. A separate
// ReadonlyMap<Id, Point> of offsets, recomputed each frame from ABSOLUTE
// time and a seeded phase — never from the previous offset, never from an
// accumulator. The layout map (layout.ts/networkLayout.ts) is never written
// to; render draws base + offset. This is what eliminates the
// accumulation-drift class of bug permanently: calling `computeOffsets`
// twice with the same `nowMs` always produces the exact same result, so
// pausing (tab hidden) and resuming can never "catch up" or jump — see rule
// 8, and graphStore.ts's effectiveness handling.
//
// S8.5 supplies the exact formula and a per-tier amplitude table (terminals
// move most, the core barely moves) — both applied here; 8.2's flat 4px
// amplitude was always a placeholder pending these real numbers.

import { assertFinitePoint } from "./nanGuard"
import { mulberry32, seedFromString } from "./rng"
import type { GraphDataset, GraphId, Point } from "../types/graph"

const DRIFT_AMPLITUDE_DEFAULT_PX = 4

export interface DriftParams {
  phase: number
  amplitude: number
}

/**
 * Built once per dataset version — a seeded phase per id, not per render.
 * `amplitudeFor` lets a caller that knows more about a node (its tier, S8.5)
 * supply a real per-node amplitude; defaults to a flat value for anything
 * that doesn't (8.2's own proof canvas still works unchanged).
 */
export function buildDriftParams(
  dataset: GraphDataset,
  amplitudeFor: (id: GraphId) => number = () => DRIFT_AMPLITUDE_DEFAULT_PX
): ReadonlyMap<GraphId, DriftParams> {
  const map = new Map<GraphId, DriftParams>()
  for (const entity of dataset.entities) {
    const rand = mulberry32(seedFromString(entity.id, 9))
    map.set(entity.id, {
      phase: rand() * Math.PI * 2,
      amplitude: amplitudeFor(entity.id),
    })
  }
  return map
}

/**
 * Pure function of (driftParams, nowMs). No hidden state, no accumulation.
 * S8.5's exact formula: dx = amp*sin(t*0.00011+phase), dy =
 * amp*sin(t*0.00015+phase*1.7).
 */
export function computeOffsets(
  driftParams: ReadonlyMap<GraphId, DriftParams>,
  nowMs: number
): ReadonlyMap<GraphId, Point> {
  const map = new Map<GraphId, Point>()
  for (const [id, { phase, amplitude }] of driftParams) {
    const dx = amplitude * Math.sin(nowMs * 0.00011 + phase)
    const dy = amplitude * Math.sin(nowMs * 0.00015 + phase * 1.7)
    map.set(
      id,
      assertFinitePoint(id, { x: dx, y: dy }, "computeOffsets", {
        nowMs,
        phase,
        amplitude,
      })
    )
  }
  return map
}
