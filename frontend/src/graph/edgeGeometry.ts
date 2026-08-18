// 8.6: edge curve maths — "never straight." Every edge is a quadratic
// bezier whose control point is offset perpendicular to the chord, by a
// fraction of the chord's own length that varies by edge kind (parent-
// child: a normal bow; cross: a WIDE arc, since a rope-partner connection
// has to visibly route around whatever sits between the two climbers
// rather than cutting through it; sibling: a slight arc, "above or below
// the pair"). Direction (which side of the chord) is seeded per edge, so
// the same edge always bows the same way across re-renders.

import type { Point } from './layout'

export interface QuadraticCurve {
  x1: number
  y1: number
  cx: number
  cy: number
  x2: number
  y2: number
}

/** Deterministic per-string hash in [0,1) — same technique as layout.ts's own seededUnit, self-contained here since edge geometry and node layout are separate concerns. */
function seededUnit(key: string): number {
  let h = 2166136261
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) % 100000) / 100000
}

function bezierFor(edgeKey: string, a: Point, b: Point, bowFracMin: number, bowFracMax: number): QuadraticCurve {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const length = Math.hypot(dx, dy) || 1
  const rand = seededUnit(edgeKey)
  const bowFrac = bowFracMin + rand * (bowFracMax - bowFracMin)
  const side = seededUnit(edgeKey + ':side') < 0.5 ? -1 : 1
  const bow = length * bowFrac * side
  const px = -dy / length
  const py = dx / length
  const midX = (a.x + b.x) / 2
  const midY = (a.y + b.y) / 2
  return { x1: a.x, y1: a.y, cx: midX + px * bow, cy: midY + py * bow, x2: b.x, y2: b.y }
}

/** parent-child: a normal, clearly-visible bow — 8-18% of the chord. */
export function parentChildCurve(edgeKey: string, a: Point, b: Point): QuadraticCurve {
  return bezierFor(edgeKey, a, b, 0.08, 0.18)
}

/** sibling: "slight arc above or below the pair" — a small, subtle bow. */
export function siblingCurve(edgeKey: string, a: Point, b: Point): QuadraticCurve {
  return bezierFor(edgeKey, a, b, 0.06, 0.1)
}

/** cross: "wide arc routed behind other nodes" — a much larger bow than the other two kinds, so it visibly detours around whatever sits between its endpoints instead of cutting through the graph's own mass. */
export function crossCurve(edgeKey: string, a: Point, b: Point): QuadraticCurve {
  return bezierFor(edgeKey, a, b, 0.32, 0.48)
}

export function quadraticSvgPath(c: QuadraticCurve): string {
  return `M ${c.x1} ${c.y1} Q ${c.cx} ${c.cy} ${c.x2} ${c.y2}`
}

/** Point on the curve at parameter t in [0,1] — used to place the travelling pulse's own <animateMotion> fallback position and for any future hit-testing. */
export function quadraticPointAt(c: QuadraticCurve, t: number): Point {
  const mt = 1 - t
  return {
    x: mt * mt * c.x1 + 2 * mt * t * c.cx + t * t * c.x2,
    y: mt * mt * c.y1 + 2 * mt * t * c.cy + t * t * c.y2,
  }
}
