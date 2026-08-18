// 8.13.2: Strata's layer stack — generated from the expedition's real camp
// sequence (ase/identityCard.ts's MOVEMENT_CAMPS/MOVEMENT_ALTITUDES_M, the
// same array every climber's own trail already walks), never hardcoded to
// five. "A mining operation might have three, a space mission twelve" —
// buildStrataLayers is generic over N and is unit-tested at N=3/6/12 to
// prove it never assumes the current expedition's count.
//
// The real data gives one ALTITUDE POINT per camp (a climber's logged
// position when at that camp), not a floor/ceiling range — Strata needs
// bands, not points, to draw a stack. Each band's floor/ceiling is derived
// as the midpoint to its neighbours (the same binning a histogram does to
// turn samples into bars), disclosed here rather than silently presented
// as if the backend carried real band boundaries.

export interface StrataLayer {
  index: number
  name: string
  /** Real altitude point this layer is centred on, e.g. from MOVEMENT_ALTITUDES_M. */
  altitudeM: number
  /** Derived (midpoint-to-neighbour) lower bound, for both binning and visual height. */
  floorM: number
  /** Derived (midpoint-to-neighbour) upper bound, for visual height. Binning treats the topmost layer as open-ended regardless of this number. */
  ceilingM: number
  /** True only for the last (highest) layer — "Summit Push 7,800m+" has no real ceiling; anything at or above floorM belongs here. */
  isOpenEnded: boolean
}

export function buildStrataLayers(names: readonly string[], altitudesM: readonly number[]): StrataLayer[] {
  if (names.length !== altitudesM.length) {
    throw new Error(`buildStrataLayers: names (${names.length}) and altitudesM (${altitudesM.length}) length mismatch`)
  }
  if (names.length === 0) return []
  return names.map((name, i) => {
    const floorM = i === 0 ? altitudesM[0] : Math.round((altitudesM[i - 1] + altitudesM[i]) / 2)
    const prevGap = altitudesM[i] - (altitudesM[i - 1] ?? altitudesM[i] - 1)
    const ceilingM = i === names.length - 1 ? altitudesM[i] + prevGap : Math.round((altitudesM[i] + altitudesM[i + 1]) / 2)
    return { index: i, name, altitudeM: altitudesM[i], floorM, ceilingM: Math.max(ceilingM, floorM + 1), isOpenEnded: i === names.length - 1 }
  })
}

/** Finds which real layer a climber's real altitude reading falls into — the topmost layer is open-ended (>= its floor), every other layer is [floor, ceiling). Null only when altitudeM itself is missing (never fabricated as a layer). Generic over T so a caller passing its own richer LaidOutLayer[] (StrataCanvas.tsx's own yTop/yBottom-augmented layers) gets that same richer type back, not a widened StrataLayer. */
export function layerForAltitude<T extends StrataLayer>(altitudeM: number | null, layers: readonly T[]): T | null {
  if (altitudeM === null || layers.length === 0) return null
  for (const layer of layers) {
    if (layer.isOpenEnded ? altitudeM >= layer.floorM : altitudeM >= layer.floorM && altitudeM < layer.ceilingM) return layer
  }
  // Below the lowest floor (shouldn't happen with real trail data, but
  // real GPS jitter could in principle place a reading slightly under
  // Base Camp's own point) — bins into the lowest layer rather than
  // dropping the climber from the view entirely.
  return layers[0] ?? null
}

/** Total real altitude span the generated stack covers — drives proportional layer heights (equal bands would be the chart answer; this keeps real tissue uneven). */
export function totalSpanM(layers: readonly StrataLayer[]): number {
  if (layers.length === 0) return 0
  return layers[layers.length - 1].ceilingM - layers[0].floorM
}

/** 8.13-V.1 ALTITUDE GUTTER: "a continuous vertical altitude scale... tick marks every 500m." The real span the generated stack covers, sampled at round 500m marks (not one per band) — generic over stepM so a route with a genuinely different cadence isn't hardcoded to 500. Always includes the floor and ceiling of the real span, even when they don't fall on a round step, so the top and bottom of the stack are never left untocked. */
export function altitudeTicks(floorM: number, ceilingM: number, stepM = 500): number[] {
  if (ceilingM <= floorM) return [floorM]
  const ticks: number[] = []
  const first = Math.ceil(floorM / stepM) * stepM
  for (let m = first; m <= ceilingM; m += stepM) ticks.push(m)
  if (ticks[0] !== floorM) ticks.unshift(floorM)
  if (ticks[ticks.length - 1] !== ceilingM) ticks.push(ceilingM)
  return ticks
}

/** True if a real altitude reading falls within this ONE layer's own [floor, ceiling) band (or >= floor when open-ended) — the single-layer version of layerForAltitude's membership test, for callers (8.13.3's Layer Detail panel) that already know which layer they care about and don't need the full stack to resolve it. */
export function altitudeInLayer(altitudeM: number | null, layer: StrataLayer): boolean {
  if (altitudeM === null) return false
  return layer.isOpenEnded ? altitudeM >= layer.floorM : altitudeM >= layer.floorM && altitudeM < layer.ceilingM
}

export interface VerticalBand {
  yTop: number
  yBottom: number
}

/**
 * 8.13.3: "the layer expands vertically 20%, pushing adjacent layers rather
 * than overlapping them." Bands are ordered index 0 = lowest real altitude
 * (Base Camp) through the highest (Summit) — in StrataCanvas.tsx's world
 * space that means index 0 sits at the LARGEST y (screen bottom) and the
 * highest layer sits near y=0 (screen top), since altitude and y are
 * inversely related there.
 *
 * The expanded layer keeps its own yTop fixed and grows yBottom by
 * `expansionFraction` of its rest height — anchored at the top, like a
 * probe pressing down from above. That growth eats into the space of every
 * layer with a SMALLER index (physically below it on screen, closer to
 * Base Camp), so those shift further down by the same extra amount,
 * keeping their own height unchanged. Layers with a LARGER index
 * (physically above, closer to the summit) are untouched — the expansion
 * never reaches upward past its own top edge. Returns the bands unchanged
 * when nothing is expanded.
 */
export function expandedLayerBounds<T extends VerticalBand>(bands: readonly T[], expandedIndex: number | null, expansionFraction = 0.2): T[] {
  if (expandedIndex === null || !bands[expandedIndex]) return [...bands]
  const extra = (bands[expandedIndex].yBottom - bands[expandedIndex].yTop) * expansionFraction
  return bands.map((b, i) => {
    if (i > expandedIndex) return b
    if (i === expandedIndex) return { ...b, yBottom: b.yBottom + extra }
    return { ...b, yTop: b.yTop + extra, yBottom: b.yBottom + extra }
  })
}
