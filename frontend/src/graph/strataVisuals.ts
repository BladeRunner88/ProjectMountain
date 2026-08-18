// 8.13.2: Strata's rendering-support pure functions — colour ramp
// interpolation, deterministic organic boundary curves, internal-texture
// family/density selection, and the pulse's stress-tier mapping. Mirrors
// the role graph/nodeVisuals.ts plays for Network: this file computes what
// to draw, StrataCanvas.tsx is the only place that actually draws it.
//
// No perlin/simplex dependency — value noise built on ase/detection.ts's
// existing `stableUnit(seed, i)` FNV-1a hash, the same reasoning
// GraphCanvas.tsx's own `organelleOffsets` already uses hand-rolled hashing
// rather than pulling in a noise library for a purely decorative texture.

import { stableUnit } from '../ase/detection'
import { STRATA_RAMP_HEX, STRATA_RAMP_SATURATED_HEX, ACCENT_RED_HEX } from './tokens'
import type { GraphNodeStatus } from './adapter'

// -- colour ramp -------------------------------------------------------

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function rgbToHex(rgb: readonly [number, number, number]): string {
  return (
    '#' +
    rgb
      .map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0'))
      .join('')
  )
}

/** Interpolates a five-anchor ramp at t in [0,1] — generic over which anchor set, so the same interpolation drives both the pastel STRATA_RAMP_HEX and 8.13-V.1's saturated companion ramp below. At t=0/0.25/0.5/0.75/1 this reproduces the five anchors exactly — the spec's own "a five-layer expedition reproduces exactly" check. */
function rampColorAt(anchors: readonly string[], t: number): string {
  const clamped = Math.min(1, Math.max(0, t))
  const scaled = clamped * (anchors.length - 1)
  const i0 = Math.floor(scaled)
  const i1 = Math.min(anchors.length - 1, i0 + 1)
  const localT = scaled - i0
  const c0 = hexToRgb(anchors[i0])
  const c1 = hexToRgb(anchors[i1])
  return rgbToHex([c0[0] + (c1[0] - c0[0]) * localT, c0[1] + (c1[1] - c0[1]) * localT, c0[2] + (c1[2] - c0[2]) * localT])
}

export function strataRampColorAt(t: number): string {
  return rampColorAt(STRATA_RAMP_HEX, t)
}

/** Layer `index` of `count` samples the ramp at its normalised position — "three layers sample at 0, 0.5, 1; twelve layers sample twelve points," never a fixed five-colour lookup. */
export function strataLayerFillColor(index: number, count: number): string {
  const t = count <= 1 ? 0 : index / (count - 1)
  return strataRampColorAt(t)
}

/** 8.13-V.1: "the layer's own accent" — the SAME ramp position, sampled from the saturated companion ramp instead of the pastel one. This is what camp anchors render at full strength, and what the band's own gradient tint (strataBandTintHex below) is blended down FROM — never the near-white pastel, which is what made the bands unreadable in the first place. */
export function strataBandAccentColor(index: number, count: number): string {
  const t = count <= 1 ? 0 : index / (count - 1)
  return rampColorAt(STRATA_RAMP_SATURATED_HEX, t)
}

/** Blends `accentHex` toward white by (1 - alphaFraction) — the solid-colour equivalent of "accentHex at alphaFraction opacity over a white background," computed as an opaque hex so it composes with the rest of this file's blend-based fills (strataEmptyLayerFill, strataAllCriticalFill) without ever writing a translucent colour function literal (graph/tokens-only lint gate). */
export function strataBandTintHex(accentHex: string, alphaFraction: number): string {
  const white: [number, number, number] = [255, 255, 255]
  const accent = hexToRgb(accentHex)
  const clamped = Math.min(1, Math.max(0, alphaFraction))
  return rgbToHex([white[0] + (accent[0] - white[0]) * clamped, white[1] + (accent[1] - white[1]) * clamped, white[2] + (accent[2] - white[2]) * clamped])
}

/** 8.13-V.1 BANDS: "raise the floor... 6-10% alpha over white" + "lead from the left... full tint at the gutter edge, falling to 40% of that tint by 35% of canvas width, flat thereafter." Two gradient stops built from the SAME accent colour (never two unrelated hues), so `full` and `faded` always read as one band breathing from strong to quiet, not two different bands. `alphaFraction` defaults to 0.08 (the midpoint of the 6-10% range); callers pass a different accent hex (already desaturated/red-shifted by strataEmptyLayerFill/strataAllCriticalFill) to compose with those existing edge cases rather than duplicating their logic here. */
export function strataBandGradientStops(accentHex: string, alphaFraction = 0.08): { full: string; faded: string } {
  return { full: strataBandTintHex(accentHex, alphaFraction), faded: strataBandTintHex(accentHex, alphaFraction * 0.4) }
}

function hexToHsl(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) h = ((b - r) / d + 2) / 6
  else h = ((r - g) / d + 4) / 6
  return [h, s, l]
}

function hueToRgb(p: number, q: number, t: number): number {
  let tt = t
  if (tt < 0) tt += 1
  if (tt > 1) tt -= 1
  if (tt < 1 / 6) return p + (q - p) * 6 * tt
  if (tt < 1 / 2) return q
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6
  return p
}

function hslToHex(h: number, s: number, l: number): string {
  if (s === 0) {
    const v = Math.round(l * 255)
    return rgbToHex([v, v, v])
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  return rgbToHex([hueToRgb(p, q, h + 1 / 3) * 255, hueToRgb(p, q, h) * 255, hueToRgb(p, q, h - 1 / 3) * 255])
}

/** Hover fill — "brightens ~2% lightness, never past the next layer's value." The ramp's own anchors are all very light pastels already, so this cap is a real constraint, not a formality: without it, a two-percent bump could read as brighter than the layer physically above it, breaking the ramp's own ordering. index+1 is the layer immediately above on screen (StrataCanvas.tsx's world space: larger index = higher real altitude = smaller y); the topmost layer has no "next" to cap against, so it only clamps at pure white. */
export function strataLayerHoverFill(index: number, count: number): string {
  const [h, s, l] = hexToHsl(strataLayerFillColor(index, count))
  const brightened = Math.min(1, l + 0.02)
  const nextL = index < count - 1 ? hexToHsl(strataLayerFillColor(index + 1, count))[2] : 1
  const cappedL = Math.min(brightened, Math.max(l, nextL))
  return hslToHex(h, s, cappedL)
}

/** 8.13.5 EMPTY LAYER: "fill desaturates to 80%" — read as an 80% reduction in saturation (20% of the original colourfulness remains), not an opacity change; the layer still needs to be fully opaque so its boundary/texture/pulse keep reading normally, just visually "quiet" since there's no real climber data underneath it. Generic over the input hex (like strataAllCriticalFill below) rather than recomputing the base colour itself, so 8.13-V.1's caller can desaturate the layer's own ACCENT before it ever reaches strataBandGradientStops — composing, not duplicating, the two blend pipelines. */
export function strataEmptyLayerFill(baseHex: string): string {
  const [h, s, l] = hexToHsl(baseHex)
  return hslToHex(h, s * 0.2, l)
}

/** 8.13.5 ALL CRITICAL: "fill shifts 10% toward red." A real, disclosed simplification of a full HSL blend — straight per-channel RGB interpolation toward the real accent-red token's own hex companion (ACCENT_RED_HEX, the same disclosed literal-for-blending exception graph/tokens.ts already carries for SMIL). Applied ON TOP of the layer's normal (or hovered) fill, never in place of the existing "danger" stress tier — ALL CRITICAL is strictly the more extreme case (every real climber in the layer, not just one). */
export function strataAllCriticalFill(baseFillHex: string): string {
  const base = hexToRgb(baseFillHex)
  const red = hexToRgb(ACCENT_RED_HEX)
  const t = 0.1
  return rgbToHex([base[0] + (red[0] - base[0]) * t, base[1] + (red[1] - base[1]) * t, base[2] + (red[2] - base[2]) * t])
}

/** 8.13.5: "the only state in which Strata looks alarming" — every real climber currently in the layer is REQUIRES_DESCENT. An empty layer (no climbers at all) is never "critical" — strataStressTierFor already treats it as calm, and this follows the same honesty rule: escalation only ever describes real data, never an absence of it. */
export function isAllCriticalLayer(statuses: readonly (GraphNodeStatus | null)[]): boolean {
  return statuses.length > 0 && statuses.every((s) => s === 'REQUIRES_DESCENT')
}

// -- organic boundary curves ---------------------------------------------

function valueNoise1D(seed: string, x: number): number {
  const xi = Math.floor(x)
  const xf = x - xi
  const a = stableUnit(seed, xi)
  const b = stableUnit(seed, xi + 1)
  const t = xf * xf * (3 - 2 * xf) // smoothstep — continuous, not a jagged lattice
  return a + (b - a) * t
}

/** 14-28px, varying per boundary — never one amplitude for every boundary in the stack. Raised from the original 8-20px spec (8.13-V.1: "the current boundaries are visually straight... a boundary a viewer cannot tell from a ruled line is doing no work"). `scale` defaults to 1 (full range); 8.13.5's <768px mobile ruling ("layers stack with reduced boundary wobble") passes a smaller scale so the same deterministic curve just reads calmer at a width where the full range would look chaotic against a much narrower stack. */
export function strataBoundaryAmplitude(seed: string, scale = 1): number {
  return (14 + stableUnit(seed, 900) * 14) * scale
}

export interface BoundaryCurveOptions {
  /** Derived from the two layer names it sits between, so the SAME expedition always renders the SAME boundary shape on reload. */
  seed: string
  widthPx: number
  baseY: number
  amplitudePx: number
}

/** The raw (x,y) points of an organic boundary curve — two irregular-frequency noise octaves summed (never a single uniform sine, "the trap, it reads as decoration"). Deterministic in seed+x only; no Math.random anywhere in this module. Exported as points (not just a path string) so a layer FILL can be built from the exact same curve as its STROKE, with no seam between them. */
export function strataBoundaryPoints({ seed, widthPx, baseY, amplitudePx }: BoundaryCurveOptions): [number, number][] {
  const freq1 = 0.004 + stableUnit(seed, 901) * 0.005 // slow, broad wobble — "some stretches loose"
  const freq2 = 0.018 + stableUnit(seed, 902) * 0.022 // faster, tighter wobble — "some stretches tight"
  const step = 6
  const points: [number, number][] = []
  for (let x = 0; x <= widthPx; x += step) {
    const n1 = valueNoise1D(`${seed}:a`, x * freq1) - 0.5
    const n2 = valueNoise1D(`${seed}:b`, x * freq2) - 0.5
    points.push([x, baseY + n1 * amplitudePx + n2 * amplitudePx * 0.35])
  }
  const last = points[points.length - 1]
  if (last[0] !== widthPx) points.push([widthPx, baseY + (valueNoise1D(`${seed}:a`, widthPx * freq1) - 0.5) * amplitudePx])
  return points
}

export function pointsToPath(points: readonly (readonly [number, number])[]): string {
  return points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
}

/** An SVG path `d` for a horizontal organic boundary — see strataBoundaryPoints. */
export function strataBoundaryPath(opts: BoundaryCurveOptions): string {
  return pointsToPath(strataBoundaryPoints(opts))
}

// -- internal texture, visible only above 1.2x zoom -----------------------

export type StrataTextureFamily = 'dot-grid' | 'horizontal-striations' | 'cellular' | 'diagonal-stress' | 'fracture'

const TEXTURE_FAMILIES: readonly StrataTextureFamily[] = ['dot-grid', 'horizontal-striations', 'cellular', 'diagonal-stress', 'fracture']

/** Nearest-neighbour pick from the five named families at layer `index` of `count` — colour blends continuously between anchors, but a pattern STYLE can't blend, so it snaps to whichever family the normalised position is closest to. Reproduces the spec's exact five-family assignment at N=5. */
export function strataTextureFamily(index: number, count: number): StrataTextureFamily {
  const t = count <= 1 ? 0 : index / (count - 1)
  const i = Math.round(t * (TEXTURE_FAMILIES.length - 1))
  return TEXTURE_FAMILIES[i]
}

/** 1.5%-4% density, scaling with normalised index — "higher band, more stressed texture," the same interpolation principle as the colour ramp rather than a five-entry lookup table. */
export function strataTextureDensity(index: number, count: number): number {
  const t = count <= 1 ? 0 : index / (count - 1)
  return 0.015 + t * (0.04 - 0.015)
}

// -- pulse: cycle time encodes stress -------------------------------------

export type StrataStressTier = 'calm' | 'active' | 'elevated' | 'danger'

export const STRESS_TIER_CYCLE_MS: Record<StrataStressTier, number> = {
  calm: 4000,
  active: 3000,
  elevated: 2000,
  danger: 1500,
}

export const STRESS_TIER_LABEL: Record<StrataStressTier, string> = {
  calm: 'Calm',
  active: 'Active',
  elevated: 'Elevated',
  danger: 'Critical',
}

/** Reduced-motion fallback — boundary stroke weight, 1.5px calm through 3px danger. */
export const STRESS_TIER_STROKE_WIDTH: Record<StrataStressTier, number> = {
  calm: 1.5,
  active: 2,
  elevated: 2.5,
  danger: 3,
}

/** The worst real status among a layer's climbers sets its stress tier — an empty layer (no real climbers currently at that altitude) is calm, never fabricated as elevated. */
export function strataStressTierFor(statuses: readonly (GraphNodeStatus | null)[]): StrataStressTier {
  if (statuses.includes('REQUIRES_DESCENT')) return 'danger'
  if (statuses.includes('IMPAIRED')) return 'elevated'
  if (statuses.includes('WATCH')) return 'active'
  return 'calm'
}

// -- 8.13.2 climber cells: membrane + pulse tables, size, layout --------

export interface MembraneSpec {
  widthPx: number
  opacity: number
}

/** Membrane (outer border) weight and opacity by status — heavier and more opaque as status worsens, so the border itself reads as a severity signal even before the fill colour registers. */
export const MEMBRANE_BY_STATUS: Record<GraphNodeStatus, MembraneSpec> = {
  READY: { widthPx: 1, opacity: 0.3 },
  WATCH: { widthPx: 1.5, opacity: 0.35 },
  IMPAIRED: { widthPx: 1.5, opacity: 0.4 },
  REQUIRES_DESCENT: { widthPx: 2, opacity: 0.5 },
}
export const MEMBRANE_UNKNOWN: MembraneSpec = { widthPx: 1, opacity: 0.2 }

export interface CellPulseSpec {
  /** The pulse oscillates between this and 1.0 opacity. */
  minOpacity: number
  cycleMs: number
}

/** Cell-level opacity pulse — distinct from the LAYER's own scaleY/translateY breathing (strataStressTierFor's cycle). Faster status = faster cycle, same "cycle time encodes stress" principle applied one level down. */
export const CELL_PULSE_BY_STATUS: Record<GraphNodeStatus, CellPulseSpec> = {
  READY: { minOpacity: 0.85, cycleMs: 3000 },
  WATCH: { minOpacity: 0.82, cycleMs: 2500 },
  IMPAIRED: { minOpacity: 0.8, cycleMs: 2000 },
  REQUIRES_DESCENT: { minOpacity: 0.75, cycleMs: 1000 },
}

/** base 14px diameter (7px radius); 1-2 sources -> x1.0, 3-4 -> x1.2, 5+ -> x1.4. "Sources" here is the real, honest count graph/panelFields.ts's contributingSourceIds already computes (every TracedValue on this climber walked back to its real observed source) — SIZE reflects real data volume, never a fabricated or route-shared number. */
export function strataCellRadiusPx(baseRadiusPx: number, sourceCount: number): number {
  const multiplier = sourceCount >= 5 ? 1.4 : sourceCount >= 3 ? 1.2 : 1.0
  return baseRadiusPx * multiplier
}

export interface CellLayoutInput {
  /** Deterministic seed AND the stable sort key — pass the same real, unique string every render (a climber's node id is already unique and stable). */
  id: string
  radiusPx: number
}

export interface CellLayoutResult {
  id: string
  x: number
  y: number
}

const CELL_MIN_SPACING_PX = 24
const CELL_BOUNDARY_MARGIN_PX = 12
const CELL_PLACEMENT_ATTEMPTS = 80

/**
 * Deterministic rejection-sampling placement — a cheaper, fully-reproducible
 * stand-in for iterative force-directed relaxation (same climbers => same
 * positions on every reload, no Math.random). Each cell tries up to
 * CELL_PLACEMENT_ATTEMPTS candidate positions seeded on its own id and
 * accepts the first that clears CELL_MIN_SPACING_PX from every
 * already-placed cell (accounting for both radii) and CELL_BOUNDARY_MARGIN_PX
 * from the layer's top/bottom; if none qualifies (a pathologically dense
 * layer), it falls back to the least-bad candidate seen rather than looping
 * forever or throwing. Vertical placement is centre-biased via a triangular
 * distribution (average of two uniform samples) — "cluster slightly toward
 * the layer's vertical centre... the way nuclei sit in real tissue."
 * Horizontal placement is uniform (the spec only asks for VERTICAL
 * clustering). Boundary containment uses the layer's own rectangular
 * [yTop, yBottom] extent rather than the exact wavy curve underneath it — a
 * disclosed simplification; the wavy boundary's amplitude (8-20px) is small
 * relative to a real layer's own height, so the rectangular approximation
 * stays visually honest without needing per-cell curve collision.
 */
interface PlacedCircle {
  x: number
  y: number
  r: number
}

/** The single-cell half of the rejection-sampling search — shared by layoutCellsInLayer's bulk pass (8.13.2) and 8.13.4's incremental seedNewCellPosition (a live "new climber" arrival, which must find room among cells ALREADY placed without moving any of them). */
function placeCellAmongExisting(cellId: string, radiusPx: number, existing: readonly PlacedCircle[], widthPx: number, yTop: number, yBottom: number): { x: number; y: number } {
  const centerY = (yTop + yBottom) / 2
  let best: { x: number; y: number; worstGap: number } | null = null
  for (let attempt = 0; attempt < CELL_PLACEMENT_ATTEMPTS; attempt++) {
    const marginY = CELL_BOUNDARY_MARGIN_PX + radiusPx
    const marginX = CELL_BOUNDARY_MARGIN_PX + radiusPx
    const centered = (stableUnit(cellId, 1000 + attempt * 3) + stableUnit(cellId, 1001 + attempt * 3)) / 2
    const y = yTop + marginY + centered * Math.max(1, yBottom - yTop - marginY * 2)
    const x = marginX + stableUnit(cellId, 1002 + attempt * 3) * Math.max(1, widthPx - marginX * 2)

    let worstGap = Infinity
    for (const p of existing) worstGap = Math.min(worstGap, Math.hypot(x - p.x, y - p.y) - (radiusPx + p.r + CELL_MIN_SPACING_PX))
    if (existing.length === 0) worstGap = 0
    if (worstGap >= 0) return { x, y }
    if (!best || worstGap > best.worstGap) best = { x, y, worstGap }
  }
  return best ?? { x: widthPx / 2, y: centerY }
}

/** 8.13.4: seeds ONE new cell's position among already-placed cells, without moving any of them — "cell spawns at the layer centre, drifts to its force-directed position." The caller animates FROM the layer centre TO this returned point; existing cells are never touched, matching "nearby cells repulse" being a purely visual nudge, not a real re-layout. */
export function seedNewCellPosition(newCellId: string, radiusPx: number, existingPositions: readonly PlacedCircle[], widthPx: number, yTop: number, yBottom: number): { x: number; y: number } {
  return placeCellAmongExisting(newCellId, radiusPx, existingPositions, widthPx, yTop, yBottom)
}

export function layoutCellsInLayer(cells: readonly CellLayoutInput[], widthPx: number, yTop: number, yBottom: number): CellLayoutResult[] {
  const sorted = [...cells].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const placed: PlacedCircle[] = []
  const out: CellLayoutResult[] = []

  for (const cell of sorted) {
    const chosen = placeCellAmongExisting(cell.id, cell.radiusPx, placed, widthPx, yTop, yBottom)
    placed.push({ x: chosen.x, y: chosen.y, r: cell.radiusPx })
    out.push({ id: cell.id, x: chosen.x, y: chosen.y })
  }
  return out
}

// -- 8.13.5 OVERCROWDED: capacity estimate + same-status clustering --------
// This expedition has 50 real climbers spread across 6 real layers (13 in
// the densest, Camp III) — well under every real layer's own capacity, so
// none of this ever fires against the live dataset. Built as real, general
// product logic anyway (operates on whatever count a layer actually has,
// never a hardcoded ">50" check), proven correct via a seeded 60-synthetic-
// climber unit test (strataVisuals.test.ts) rather than by fabricating fake
// climbers into the live app.

/** Rough circle-packing estimate: how many same-size circles of radius `avgCellRadiusPx` (plus the real CELL_MIN_SPACING_PX gap each already needs) fit inside a widthPx x heightPx rectangle, at a conservative 60% packing efficiency (real circle packing tops out near 90%, but cells aren't laid out on a perfect hex grid here — the same rejection-sampling search layoutCellsInLayer already uses loses real room to randomness). */
export function estimateLayerCapacity(widthPx: number, heightPx: number, avgCellRadiusPx: number): number {
  const areaPerCell = Math.PI * Math.pow(avgCellRadiusPx + CELL_MIN_SPACING_PX / 2, 2)
  const packingEfficiency = 0.6
  return Math.max(1, Math.floor((widthPx * heightPx * packingEfficiency) / areaPerCell))
}

export interface ClusterableCellInput {
  id: string
  status: GraphNodeStatus | null
  radiusPx: number
}

export interface ClusterGroup {
  clusterId: string
  status: GraphNodeStatus | null
  memberIds: string[]
  radiusPx: number
}

/** "Groups of 3-5 nearby same-status cells merge into a cluster cell." Grouping is by status (never cross-status — a cluster's own single status colour would otherwise be a lie) and, within a status, by sorted id for cross-reload determinism; group SIZE (3, 4, or 5) is itself seeded per group rather than fixed, so two overcrowded layers don't tile identically. `excludeClusterIds` is a real, user-driven "expand to individuals" override — clicking a cluster removes it from clustering on every subsequent render until deselected, at which point its real members return to being individually laid out. A same-status remainder under 3 folds back into `individuals` rather than forming an undersized cluster. */
export function clusterOvercrowdedCells(
  cells: readonly ClusterableCellInput[],
  capacity: number,
  clusterRadiusPx: number,
  excludeClusterIds: ReadonlySet<string> = new Set(),
): { clusters: ClusterGroup[]; individuals: ClusterableCellInput[] } {
  if (cells.length <= capacity) return { clusters: [], individuals: [...cells] }

  const byStatus = new Map<string, ClusterableCellInput[]>()
  for (const c of cells) {
    const key = c.status ?? 'UNKNOWN'
    if (!byStatus.has(key)) byStatus.set(key, [])
    byStatus.get(key)!.push(c)
  }

  const clusters: ClusterGroup[] = []
  const individuals: ClusterableCellInput[] = []
  for (const [key, group] of [...byStatus.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const sorted = [...group].sort((a, b) => (a.id < b.id ? -1 : 1))
    let i = 0
    let groupIndex = 0
    while (i < sorted.length) {
      const remaining = sorted.length - i
      if (remaining < 3) {
        individuals.push(...sorted.slice(i))
        break
      }
      const size = remaining >= 6 ? 3 + Math.floor(stableUnit(sorted[i].id, 950) * 3) : remaining
      const chunk = sorted.slice(i, i + size)
      const clusterId = `cluster:${key}:${groupIndex}`
      if (excludeClusterIds.has(clusterId)) {
        individuals.push(...chunk)
      } else {
        clusters.push({ clusterId, status: chunk[0].status, memberIds: chunk.map((c) => c.id), radiusPx: clusterRadiusPx })
      }
      i += size
      groupIndex++
    }
  }
  return { clusters, individuals }
}
