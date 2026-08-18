// 8.13-V.2: pure layout functions for the descent tree — the structure that
// replaces "climbers scattered inside an altitude band" with "climbers
// hanging from the real route/team they're actually on, at their real
// altitude." Mirrors strataVisuals.ts's role: this file computes numbers,
// StrataCanvas.tsx is the only place that draws them.
//
// GROUNDING (real data, not invented): the graph already carries a real
// country -> route -> operator -> climber parent chain (graph/adapter.ts).
// "TEAM" in the spec maps onto the real OPERATOR tier — the closest real
// grouping this dataset has between a route and an individual climber (an
// operator is the expedition company actually running that group up the
// mountain). "ROUTE" maps onto the real route tier directly. Both are
// disclosed mappings, not fabricated concepts, matching this project's
// standing "map onto the nearest real thing, disclose the mapping" rule.
//
// The ROOT ("the expedition objective") is symbolic — this dataset spans
// 14 real routes across 6 real countries (Everest, K2, Denali, the
// Matterhorn...), not one physical peak, so there is no single real
// "objective name" to report. It reuses the SAME canonical Summit label
// and altitude (ase/identityCard.ts's MOVEMENT_CAMPS/MOVEMENT_ALTITUDES_M)
// the altitude bands have used since 8.13.1 — the same composite scale,
// not a new claim.

import { stableUnit } from '../ase/detection'

// -- deterministic per-branch hue --------------------------------------

/** A stable hue angle (0-360) for any real id — routes and teams each get one, teams additionally offset from their own route's so a route's children read as a family without being identical. */
function hueForSeed(seed: string): number {
  return stableUnit(seed, 500) * 360
}

const BRANCH_SATURATION = 0.62
const BRANCH_LIGHTNESS = 0.5

function hslToHexLocal(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  let r = 0
  let g = 0
  let b = 0
  if (h < 60) [r, g, b] = [c, x, 0]
  else if (h < 120) [r, g, b] = [x, c, 0]
  else if (h < 180) [r, g, b] = [0, c, x]
  else if (h < 240) [r, g, b] = [0, x, c]
  else if (h < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

/** "26px, radial gradient in the route's own hue" — one distinct, deterministic colour per real route id. */
export function routeAccentColor(routeId: string): string {
  return hslToHexLocal(hueForSeed(routeId), BRANCH_SATURATION, BRANCH_LIGHTNESS)
}

/** "20px, solid team hue" — offset from the PARENT route's own hue (not independently random) so a route's teams visually read as a family, per the spec's own root->route->team colour lineage. */
export function teamAccentColor(routeId: string, teamId: string): string {
  const routeHue = hueForSeed(routeId)
  const offset = (stableUnit(teamId, 501) - 0.5) * 70 // +/-35deg around the route's own hue
  return hslToHexLocal((routeHue + offset + 360) % 360, BRANCH_SATURATION, BRANCH_LIGHTNESS)
}

// -- even horizontal distribution ---------------------------------------

/** N points evenly spread across [centerX - widthPx/2, centerX + widthPx/2] — used both for "routes distributed evenly across the canvas width" and for a route's own teams spread within their own narrower lane. Single item centres exactly on centerX. */
export function evenSpreadX(count: number, centerX: number, widthPx: number): number[] {
  if (count <= 0) return []
  if (count === 1) return [centerX]
  const step = widthPx / count
  return Array.from({ length: count }, (_, i) => centerX - widthPx / 2 + step * (i + 0.5))
}

// -- team altitude summary ------------------------------------------------

/** "the MEDIAN altitude of that team's climbers — so the branch point sits in the middle of where the team actually is." Real, sorted median (not a mean, which a single outlier climber could pull off the team's actual centre). */
export function medianAltitudeM(altitudesM: readonly number[]): number | null {
  if (altitudesM.length === 0) return null
  const sorted = [...altitudesM].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

/** "When a team's leaves span more than 600 vertical metres" — real max-min across that team's own real climber altitudes. */
export function teamAltitudeSpanM(altitudesM: readonly number[]): number {
  if (altitudesM.length === 0) return 0
  return Math.max(...altitudesM) - Math.min(...altitudesM)
}

export const BRANCH_STRETCH_THRESHOLD_M = 600

export function isTeamStretched(spanM: number): boolean {
  return spanM > BRANCH_STRETCH_THRESHOLD_M
}

// -- leaf fan-out + collision avoidance -----------------------------------

export const LEAF_STEM_BASE_PX = 22
export const LEAF_STEM_GROWTH_PX = 16
export const LEAF_MIN_SPACING_PX = 26
// Generous on purpose: real climber altitudes are continuous, near-unique
// floats (GPS-derived), so real teams essentially never produce the kind of
// dense same-altitude clustering this cap has to defend against — this
// margin exists for the rare real coincidence (two readings land within a
// metre of each other), not for a worst-case synthetic pile-up.
const LEAF_COLLISION_MAX_EXTENSIONS = 150

export interface LeafPlacementInput {
  id: string
  teamId: string
  teamX: number
  /** Real altitude in world pixels — fixed input, never adjusted by this function. "Altitude is never adjusted to make the layout work." */
  altitudeY: number
  radiusPx: number
}

export interface LeafPlacementResult {
  id: string
  x: number
  y: number
  side: 'left' | 'right'
}

/**
 * "x position: fan out from the team node, alternating left and right, stem
 * length growing with each additional climber so leaves never collide" +
 * "minimum 26px centre-to-centre... extend the stem of the second rather
 * than displacing either vertically."
 *
 * Two passes: (1) per-team alternating side assignment with a stem length
 * that already grows per additional same-side climber (the common case —
 * most real climbers on a team sit at genuinely different altitudes, so
 * this alone already keeps them apart); (2) one GLOBAL collision pass in a
 * stable id-sorted order (collisions can cross team/route boundaries when
 * two different teams happen to sit at similar real altitudes and similar
 * x) — a colliding leaf's stem extends further along its own fixed side
 * until clear. Y is read-only throughout; only stem length (and therefore
 * x) ever moves.
 */
export function layoutLeaves(inputs: readonly LeafPlacementInput[]): LeafPlacementResult[] {
  const byTeam = new Map<string, LeafPlacementInput[]>()
  for (const leaf of inputs) {
    if (!byTeam.has(leaf.teamId)) byTeam.set(leaf.teamId, [])
    byTeam.get(leaf.teamId)!.push(leaf)
  }

  const withStem = new Map<string, { x: number; y: number; side: 'left' | 'right'; teamX: number; radiusPx: number; stem: number }>()
  for (const team of byTeam.values()) {
    const sorted = [...team].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    let rankRight = 0
    let rankLeft = 0
    sorted.forEach((leaf, i) => {
      const side: 'left' | 'right' = i % 2 === 0 ? 'right' : 'left'
      const rank = side === 'right' ? rankRight++ : rankLeft++
      const stem = LEAF_STEM_BASE_PX + rank * LEAF_STEM_GROWTH_PX
      const x = leaf.teamX + (side === 'right' ? 1 : -1) * stem
      withStem.set(leaf.id, { x, y: leaf.altitudeY, side, teamX: leaf.teamX, radiusPx: leaf.radiusPx, stem })
    })
  }

  const order = [...inputs].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const finalized: { id: string; x: number; y: number; radiusPx: number }[] = []
  const out: LeafPlacementResult[] = []
  for (const leaf of order) {
    const placed = withStem.get(leaf.id)!
    let { x, stem } = placed
    const { y, side, teamX, radiusPx } = placed
    for (let attempt = 0; attempt < LEAF_COLLISION_MAX_EXTENSIONS; attempt++) {
      const collides = finalized.some((f) => Math.hypot(x - f.x, y - f.y) < radiusPx + f.radiusPx + LEAF_MIN_SPACING_PX)
      if (!collides) break
      stem += LEAF_STEM_GROWTH_PX * 0.5
      x = teamX + (side === 'right' ? 1 : -1) * stem
    }
    finalized.push({ id: leaf.id, x, y, radiusPx })
    out.push({ id: leaf.id, x, y, side })
  }
  return out
}

// -- organic edges: quadratic bezier with a perpendicular control offset --

export interface EdgeCurve {
  d: string
  /** the control point's own coordinates — callers building an on-path animation (the nutrient pulse) need this, not just the final path string. */
  cx: number
  cy: number
}

// -- 8.13-V.3 DENSITY: "never solve density by shrinking the cells. That is
// how the current view got here." Clustering (same real size, fewer real
// nodes) instead — this expedition's real 50 climbers never reach the
// first tier (60), so every function here is real, general logic proven by
// unit tests with a seeded large-N input, the same disclosed pattern
// 8.13.5's own OVERCROWDED block established, never by fabricating extra
// climbers into the live app. --------------------------------------------

export const TEAM_CLUSTER_CLIMBER_THRESHOLD = 8
export const DENSITY_TEAM_CLUSTER_MIN = 60
export const DENSITY_ROUTE_COLLAPSE_MIN = 150
export const CLUSTER_SIZE_MULTIPLIER = 1.8

export type DensityTier = 'full' | 'team-cluster' | 'route-collapse'

/**
 * <60 real climbers total: full tree, every leaf individual.
 * 60-150: teams with more than 8 climbers collapse to one cluster leaf.
 * >150: routes collapse too — only root/routes/counts render.
 */
export function densityTierForTotalClimbers(totalClimbers: number): DensityTier {
  if (totalClimbers > DENSITY_ROUTE_COLLAPSE_MIN) return 'route-collapse'
  if (totalClimbers >= DENSITY_TEAM_CLUSTER_MIN) return 'team-cluster'
  return 'full'
}

/** "teams with more than 8 climbers collapse to a cluster leaf" — strictly greater than, so an exactly-8-climber team still renders individually. */
export function shouldClusterTeam(climberCount: number, threshold = TEAM_CLUSTER_CLIMBER_THRESHOLD): boolean {
  return climberCount > threshold
}

/** "the control point offsets perpendicular to the direct line, so the stem curves out of the branch rather than snapping to it." Deterministic per edge (seeded on the child's real id) so the same climber/team always curves the same way on reload — never Math.random. */
export function organicEdgeCurve(x1: number, y1: number, x2: number, y2: number, seed: string, maxOffsetPx: number): EdgeCurve {
  const midX = (x1 + x2) / 2
  const midY = (y1 + y2) / 2
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.hypot(dx, dy) || 1
  // perpendicular unit vector
  const px = -dy / len
  const py = dx / len
  const signed = (stableUnit(seed, 502) - 0.5) * 2 // [-1, 1]
  const offset = signed * maxOffsetPx
  const cx = midX + px * offset
  const cy = midY + py * offset
  return { d: `M${x1.toFixed(2)} ${y1.toFixed(2)} Q${cx.toFixed(2)} ${cy.toFixed(2)} ${x2.toFixed(2)} ${y2.toFixed(2)}`, cx, cy }
}
