// S8.5: EDGES: CURVED FILAMENTS, NOT STRAIGHT LINES. Every edge is a
// quadratic bezier whose control point is offset perpendicular to the chord
// by 8-18% of its length, with the direction (which side of the chord)
// seeded per edge — straight lines are "the single biggest reason a node
// graph looks like a diagram instead of an organism."

import { mulberry32, seedFromString } from './rng'
import type { Point } from '../types/graph'

export interface QuadraticCurve {
  x1: number
  y1: number
  cx: number
  cy: number
  x2: number
  y2: number
}

const BOW_MIN_FRAC = 0.08
const BOW_MAX_FRAC = 0.18

/** Deterministic per edge (same edgeKey always bows the same way and amount) — computed fresh from CURRENT endpoints every call, so it stays correct under drift without needing to store anything. */
export function computeQuadraticCurve(edgeKey: string, a: Point, b: Point): QuadraticCurve {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const length = Math.hypot(dx, dy) || 1
  const rand = mulberry32(seedFromString(edgeKey, 51))
  const bowFrac = BOW_MIN_FRAC + rand() * (BOW_MAX_FRAC - BOW_MIN_FRAC)
  const side = rand() < 0.5 ? -1 : 1
  const bow = length * bowFrac * side
  // perpendicular unit vector
  const px = -dy / length
  const py = dx / length
  const midX = (a.x + b.x) / 2
  const midY = (a.y + b.y) / 2
  return { x1: a.x, y1: a.y, cx: midX + px * bow, cy: midY + py * bow, x2: b.x, y2: b.y }
}

/**
 * S8.4b: history links get their OWN curve shape — every other edge bows
 * PERPENDICULAR to its chord (seeded direction), but a history link
 * "dips toward the centre rather than crossing the outer mass — otherwise
 * fifty of these turn the graph into string." The control point is pulled
 * from the chord's midpoint toward `center` by `dipFraction`, so however
 * far apart a climber and a prior region land, the link bellies inward
 * rather than slicing straight across whatever's between them.
 */
export function computeHistoryLinkCurve(a: Point, b: Point, center: Point, dipFraction = 0.35): QuadraticCurve {
  const midX = (a.x + b.x) / 2
  const midY = (a.y + b.y) / 2
  return {
    x1: a.x,
    y1: a.y,
    cx: midX + (center.x - midX) * dipFraction,
    cy: midY + (center.y - midY) * dipFraction,
    x2: b.x,
    y2: b.y,
  }
}

export function quadraticSvgPath(c: QuadraticCurve): string {
  return `M ${c.x1} ${c.y1} Q ${c.cx} ${c.cy} ${c.x2} ${c.y2}`
}

/** Point on the curve at parameter t in [0,1]. */
export function quadraticPointAt(c: QuadraticCurve, t: number): Point {
  const mt = 1 - t
  return {
    x: mt * mt * c.x1 + 2 * mt * t * c.cx + t * t * c.x2,
    y: mt * mt * c.y1 + 2 * mt * t * c.cy + t * t * c.y2,
  }
}

/**
 * Samples a quadratic curve into a tapered ribbon polygon — canvas strokes
 * don't support per-point width, so a filament is drawn as a thin filled
 * shape instead: `segments` points along the curve, offset perpendicular by
 * a width that linearly interpolates from `widthStart` (near the parent) to
 * `widthEnd` (at the terminal), then closed back along the other side.
 */
export function taperedRibbonPoints(c: QuadraticCurve, widthStart: number, widthEnd: number, segments = 5): Point[] {
  const top: Point[] = []
  const bottom: Point[] = []
  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    const p = quadraticPointAt(c, t)
    // tangent direction via derivative of the quadratic bezier
    const mt = 1 - t
    const dx = 2 * mt * (c.cx - c.x1) + 2 * t * (c.x2 - c.cx)
    const dy = 2 * mt * (c.cy - c.y1) + 2 * t * (c.y2 - c.cy)
    const len = Math.hypot(dx, dy) || 1
    const nx = -dy / len
    const ny = dx / len
    const halfWidth = ((widthStart + (widthEnd - widthStart) * t) as number) / 2
    top.push({ x: p.x + nx * halfWidth, y: p.y + ny * halfWidth })
    bottom.push({ x: p.x - nx * halfWidth, y: p.y - ny * halfWidth })
  }
  return [...top, ...bottom.reverse()]
}
