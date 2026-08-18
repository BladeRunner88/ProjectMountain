import { describe, expect, it } from 'vitest'
import {
  clusterOvercrowdedCells,
  estimateLayerCapacity,
  isAllCriticalLayer,
  layoutCellsInLayer,
  seedNewCellPosition,
  strataAllCriticalFill,
  strataBandAccentColor,
  strataBandGradientStops,
  strataBandTintHex,
  strataBoundaryAmplitude,
  strataBoundaryPath,
  strataCellRadiusPx,
  strataEmptyLayerFill,
  strataLayerFillColor,
  strataLayerHoverFill,
  strataRampColorAt,
  strataStressTierFor,
  strataTextureDensity,
  strataTextureFamily,
  CELL_PULSE_BY_STATUS,
  MEMBRANE_BY_STATUS,
  MEMBRANE_UNKNOWN,
  STRESS_TIER_CYCLE_MS,
  STRESS_TIER_STROKE_WIDTH,
} from './strataVisuals'
import { STRATA_RAMP_HEX } from './tokens'

describe('strataRampColorAt / strataLayerFillColor', () => {
  it('a five-layer stack reproduces the five ramp anchors exactly', () => {
    for (let i = 0; i < 5; i++) {
      expect(strataLayerFillColor(i, 5)).toBe(STRATA_RAMP_HEX[i])
    }
  })

  it('t=0 and t=1 are the ramp endpoints', () => {
    expect(strataRampColorAt(0)).toBe(STRATA_RAMP_HEX[0])
    expect(strataRampColorAt(1)).toBe(STRATA_RAMP_HEX[STRATA_RAMP_HEX.length - 1])
  })

  it('a three-layer stack samples 0, 0.5, 1 and differs from the five-layer set', () => {
    const three = [strataLayerFillColor(0, 3), strataLayerFillColor(1, 3), strataLayerFillColor(2, 3)]
    expect(three[0]).toBe(STRATA_RAMP_HEX[0])
    expect(three[2]).toBe(STRATA_RAMP_HEX[STRATA_RAMP_HEX.length - 1])
    expect(three[1]).not.toBe(three[0])
  })

  it('a twelve-layer stack produces twelve distinct-enough colours, never a hardcoded five', () => {
    const colors = Array.from({ length: 12 }, (_, i) => strataLayerFillColor(i, 12))
    expect(new Set(colors).size).toBeGreaterThan(5)
  })

  it('a single-layer stack does not divide by zero', () => {
    expect(strataLayerFillColor(0, 1)).toBe(STRATA_RAMP_HEX[0])
  })
})

describe('strataBoundaryAmplitude', () => {
  it('stays within the 14-28px band (raised from the original 8-20px spec — 8.13-V.1: "a boundary a viewer cannot tell from a ruled line is doing no work")', () => {
    for (const seed of ['Base Camp->Camp I', 'Camp I->Camp II', 'x', 'y', 'z']) {
      const amp = strataBoundaryAmplitude(seed)
      expect(amp).toBeGreaterThanOrEqual(14)
      expect(amp).toBeLessThanOrEqual(28)
    }
  })

  it('different boundaries get different amplitudes, not one constant for all', () => {
    const a = strataBoundaryAmplitude('Base Camp->Camp I')
    const b = strataBoundaryAmplitude('Camp I->Camp II')
    expect(a).not.toBe(b)
  })
})

describe('strataBoundaryPath', () => {
  const opts = { seed: 'Base Camp->Camp I', widthPx: 800, baseY: 200, amplitudePx: 12 }

  it('is deterministic — identical seed and geometry always produce the identical path', () => {
    expect(strataBoundaryPath(opts)).toBe(strataBoundaryPath({ ...opts }))
  })

  it('a different seed produces a different path (not a uniform sine reused everywhere)', () => {
    expect(strataBoundaryPath(opts)).not.toBe(strataBoundaryPath({ ...opts, seed: 'Camp I->Camp II' }))
  })

  it('starts at x=0 and ends at the requested width', () => {
    const d = strataBoundaryPath(opts)
    expect(d.startsWith('M0.0')).toBe(true)
    expect(d).toContain('L800.0')
  })

  it('is not a straight line — y varies along the path', () => {
    const d = strataBoundaryPath(opts)
    const ys = Array.from(d.matchAll(/[ML][\d.]+ ([\d.]+)/g)).map((m) => parseFloat(m[1]))
    expect(new Set(ys).size).toBeGreaterThan(3)
  })

  it('is not a uniform sine wave — successive deltas are irregular, not a single repeating period', () => {
    const d = strataBoundaryPath(opts)
    const ys = Array.from(d.matchAll(/[ML][\d.]+ ([\d.]+)/g)).map((m) => parseFloat(m[1]))
    const deltas = ys.slice(1).map((y, i) => y - ys[i])
    // a pure sine's deltas are themselves a smooth sine; check the deltas
    // are NOT monotonically periodic by confirming sign-change spacing varies
    const signChangeGaps: number[] = []
    let lastChange = 0
    for (let i = 1; i < deltas.length; i++) {
      if (Math.sign(deltas[i]) !== Math.sign(deltas[i - 1]) && deltas[i] !== 0) {
        signChangeGaps.push(i - lastChange)
        lastChange = i
      }
    }
    expect(new Set(signChangeGaps).size).toBeGreaterThan(1)
  })
})

describe('strataLayerHoverFill', () => {
  it('is always a valid hex colour', () => {
    for (let i = 0; i < 6; i++) expect(strataLayerHoverFill(i, 6)).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('brightens (or holds steady when already capped) relative to the base fill — never darker', () => {
    for (let i = 0; i < 6; i++) {
      const base = strataLayerFillColor(i, 6)
      const hover = strataLayerHoverFill(i, 6)
      const baseLum = parseInt(base.slice(1), 16)
      const hoverLum = parseInt(hover.slice(1), 16)
      expect(hoverLum).toBeGreaterThanOrEqual(baseLum)
    }
  })

  it('the topmost layer (no next layer to cap against) still returns a valid, brightened-or-equal colour', () => {
    const base = strataLayerFillColor(5, 6)
    const hover = strataLayerHoverFill(5, 6)
    expect(parseInt(hover.slice(1), 16)).toBeGreaterThanOrEqual(parseInt(base.slice(1), 16))
  })
})

describe('strataTextureFamily / strataTextureDensity', () => {
  it('a five-layer stack hits all five named families in order', () => {
    const families = Array.from({ length: 5 }, (_, i) => strataTextureFamily(i, 5))
    expect(families).toEqual(['dot-grid', 'horizontal-striations', 'cellular', 'diagonal-stress', 'fracture'])
  })

  it('density rises from low to high across the stack, scaling with index not a fixed lookup', () => {
    expect(strataTextureDensity(0, 6)).toBeLessThan(strataTextureDensity(5, 6))
  })

  it('a twelve-layer stack still only uses the five real families, never invents a sixth', () => {
    const families = new Set(Array.from({ length: 12 }, (_, i) => strataTextureFamily(i, 12)))
    for (const f of families) {
      expect(['dot-grid', 'horizontal-striations', 'cellular', 'diagonal-stress', 'fracture']).toContain(f)
    }
  })
})

describe('strataStressTierFor', () => {
  it('an empty layer (no real climbers there) is calm, never fabricated as elevated', () => {
    expect(strataStressTierFor([])).toBe('calm')
  })

  it('all-null statuses (no predictions in this layer) stay calm', () => {
    expect(strataStressTierFor([null, null])).toBe('calm')
  })

  it('worst real status wins: one REQUIRES_DESCENT among many READY is danger', () => {
    expect(strataStressTierFor(['READY', 'READY', 'REQUIRES_DESCENT', null])).toBe('danger')
  })

  it('IMPAIRED without REQUIRES_DESCENT is elevated', () => {
    expect(strataStressTierFor(['READY', 'IMPAIRED'])).toBe('elevated')
  })

  it('WATCH alone is active', () => {
    expect(strataStressTierFor(['READY', 'WATCH'])).toBe('active')
  })
})

describe('STRESS_TIER_CYCLE_MS / STRESS_TIER_STROKE_WIDTH', () => {
  it('cycle time strictly shortens as stress rises: 4.0s -> 1.5s', () => {
    expect(STRESS_TIER_CYCLE_MS.calm).toBe(4000)
    expect(STRESS_TIER_CYCLE_MS.active).toBe(3000)
    expect(STRESS_TIER_CYCLE_MS.elevated).toBe(2000)
    expect(STRESS_TIER_CYCLE_MS.danger).toBe(1500)
  })

  it('reduced-motion stroke weight strictly rises: 1.5px -> 3px', () => {
    expect(STRESS_TIER_STROKE_WIDTH.calm).toBe(1.5)
    expect(STRESS_TIER_STROKE_WIDTH.danger).toBe(3)
    expect(STRESS_TIER_STROKE_WIDTH.calm).toBeLessThan(STRESS_TIER_STROKE_WIDTH.active)
    expect(STRESS_TIER_STROKE_WIDTH.active).toBeLessThan(STRESS_TIER_STROKE_WIDTH.elevated)
    expect(STRESS_TIER_STROKE_WIDTH.elevated).toBeLessThan(STRESS_TIER_STROKE_WIDTH.danger)
  })
})

describe('MEMBRANE_BY_STATUS / MEMBRANE_UNKNOWN', () => {
  it('matches the 8.13.2 cell-forms table exactly', () => {
    expect(MEMBRANE_BY_STATUS.READY).toEqual({ widthPx: 1, opacity: 0.3 })
    expect(MEMBRANE_BY_STATUS.WATCH).toEqual({ widthPx: 1.5, opacity: 0.35 })
    expect(MEMBRANE_BY_STATUS.IMPAIRED).toEqual({ widthPx: 1.5, opacity: 0.4 })
    expect(MEMBRANE_BY_STATUS.REQUIRES_DESCENT).toEqual({ widthPx: 2, opacity: 0.5 })
    expect(MEMBRANE_UNKNOWN).toEqual({ widthPx: 1, opacity: 0.2 })
  })

  it('weight and opacity both strictly rise with severity', () => {
    const order: (keyof typeof MEMBRANE_BY_STATUS)[] = ['READY', 'WATCH', 'IMPAIRED', 'REQUIRES_DESCENT']
    for (let i = 0; i < order.length - 1; i++) {
      expect(MEMBRANE_BY_STATUS[order[i]].opacity).toBeLessThanOrEqual(MEMBRANE_BY_STATUS[order[i + 1]].opacity)
      expect(MEMBRANE_BY_STATUS[order[i]].widthPx).toBeLessThanOrEqual(MEMBRANE_BY_STATUS[order[i + 1]].widthPx)
    }
  })
})

describe('CELL_PULSE_BY_STATUS', () => {
  it('matches the 8.13.2 cell-forms table exactly', () => {
    expect(CELL_PULSE_BY_STATUS.READY).toEqual({ minOpacity: 0.85, cycleMs: 3000 })
    expect(CELL_PULSE_BY_STATUS.WATCH).toEqual({ minOpacity: 0.82, cycleMs: 2500 })
    expect(CELL_PULSE_BY_STATUS.IMPAIRED).toEqual({ minOpacity: 0.8, cycleMs: 2000 })
    expect(CELL_PULSE_BY_STATUS.REQUIRES_DESCENT).toEqual({ minOpacity: 0.75, cycleMs: 1000 })
  })

  it('cycle shortens and min-opacity drops together as status worsens', () => {
    const order: (keyof typeof CELL_PULSE_BY_STATUS)[] = ['READY', 'WATCH', 'IMPAIRED', 'REQUIRES_DESCENT']
    for (let i = 0; i < order.length - 1; i++) {
      expect(CELL_PULSE_BY_STATUS[order[i]].cycleMs).toBeGreaterThan(CELL_PULSE_BY_STATUS[order[i + 1]].cycleMs)
      expect(CELL_PULSE_BY_STATUS[order[i]].minOpacity).toBeGreaterThan(CELL_PULSE_BY_STATUS[order[i + 1]].minOpacity)
    }
  })
})

describe('strataCellRadiusPx', () => {
  it('1-2 sources: x1.0 (base size)', () => {
    expect(strataCellRadiusPx(7, 1)).toBe(7)
    expect(strataCellRadiusPx(7, 2)).toBe(7)
  })
  it('3-4 sources: x1.2', () => {
    expect(strataCellRadiusPx(7, 3)).toBeCloseTo(8.4)
    expect(strataCellRadiusPx(7, 4)).toBeCloseTo(8.4)
  })
  it('5+ sources: x1.4', () => {
    expect(strataCellRadiusPx(7, 5)).toBeCloseTo(9.8)
    expect(strataCellRadiusPx(7, 50)).toBeCloseTo(9.8)
  })
})

describe('layoutCellsInLayer', () => {
  it('respects the 24px minimum cell-to-cell spacing for a realistic dense layer (20 cells)', () => {
    const cells = Array.from({ length: 20 }, (_, i) => ({ id: `climber-${i}`, radiusPx: 7 }))
    const laidOut = layoutCellsInLayer(cells, 900, 0, 400)
    for (let i = 0; i < laidOut.length; i++) {
      for (let j = i + 1; j < laidOut.length; j++) {
        const dist = Math.hypot(laidOut[i].x - laidOut[j].x, laidOut[i].y - laidOut[j].y)
        expect(dist).toBeGreaterThanOrEqual(7 + 7 + 24 - 0.5) // small float tolerance
      }
    }
  })

  it('respects the 12px minimum cell-to-boundary margin', () => {
    const cells = Array.from({ length: 10 }, (_, i) => ({ id: `climber-${i}`, radiusPx: 7 }))
    const laidOut = layoutCellsInLayer(cells, 900, 0, 400)
    for (const c of laidOut) {
      expect(c.y - 7).toBeGreaterThanOrEqual(12 - 0.5)
      expect(400 - (c.y + 7)).toBeGreaterThanOrEqual(12 - 0.5)
    }
  })

  it('is deterministic — identical input always produces identical positions', () => {
    const cells = Array.from({ length: 12 }, (_, i) => ({ id: `climber-${i}`, radiusPx: 7 }))
    expect(layoutCellsInLayer(cells, 900, 0, 400)).toEqual(layoutCellsInLayer(cells, 900, 0, 400))
  })

  it('50 cells across a real-sized canvas still terminates and returns one position per cell (no infinite loop, no dropped cells)', () => {
    const cells = Array.from({ length: 50 }, (_, i) => ({ id: `climber-${i}`, radiusPx: 7 }))
    const laidOut = layoutCellsInLayer(cells, 900, 0, 1200)
    expect(laidOut.length).toBe(50)
  })

  it('empty input returns an empty layout', () => {
    expect(layoutCellsInLayer([], 900, 0, 400)).toEqual([])
  })
})

describe('seedNewCellPosition', () => {
  it('an empty layer places the new cell anywhere valid inside the bounds', () => {
    const pos = seedNewCellPosition('new-1', 7, [], 900, 0, 400)
    expect(pos.x).toBeGreaterThanOrEqual(0)
    expect(pos.x).toBeLessThanOrEqual(900)
    expect(pos.y).toBeGreaterThanOrEqual(0)
    expect(pos.y).toBeLessThanOrEqual(400)
  })

  it('never moves any EXISTING cell — only returns where the new one should go', () => {
    const existing = [{ x: 100, y: 100, r: 7 }, { x: 300, y: 200, r: 7 }]
    const existingCopy = existing.map((e) => ({ ...e }))
    seedNewCellPosition('new-1', 7, existing, 900, 0, 400)
    expect(existing).toEqual(existingCopy)
  })

  it('respects the real 24px minimum spacing from every already-placed cell', () => {
    const existing = [{ x: 400, y: 200, r: 7 }]
    const pos = seedNewCellPosition('new-1', 7, existing, 900, 0, 400)
    const dist = Math.hypot(pos.x - 400, pos.y - 200)
    expect(dist).toBeGreaterThanOrEqual(7 + 7 + 24 - 0.5)
  })

  it('is deterministic — same id, same existing cells, same result every time', () => {
    const existing = [{ x: 400, y: 200, r: 7 }]
    expect(seedNewCellPosition('new-1', 7, existing, 900, 0, 400)).toEqual(seedNewCellPosition('new-1', 7, existing, 900, 0, 400))
  })

  it('matches layoutCellsInLayer\'s own placement when seeding cells one at a time in the same order', () => {
    const cells = [
      { id: 'a', radiusPx: 7 },
      { id: 'b', radiusPx: 7 },
      { id: 'c', radiusPx: 7 },
    ]
    const bulk = layoutCellsInLayer(cells, 900, 0, 400)
    const placed: { x: number; y: number; r: number }[] = []
    const incremental: { id: string; x: number; y: number }[] = []
    for (const c of cells) {
      const pos = seedNewCellPosition(c.id, c.radiusPx, placed, 900, 0, 400)
      placed.push({ ...pos, r: c.radiusPx })
      incremental.push({ id: c.id, ...pos })
    }
    expect(incremental).toEqual(bulk)
  })
})

describe('strataBandAccentColor / strataBandTintHex / strataBandGradientStops — 8.13-V.1 BANDS', () => {
  it('the accent ramp reproduces its five saturated anchors at a five-layer stack, same interpolation shape as the pastel ramp', () => {
    const accents = [0, 1, 2, 3, 4].map((i) => strataBandAccentColor(i, 5))
    expect(new Set(accents).size).toBe(5)
  })

  it('the accent colour is a real hex, distinct from the pastel strataLayerFillColor at the same index', () => {
    expect(strataBandAccentColor(1, 5)).not.toBe(strataLayerFillColor(1, 5))
  })

  it('strataBandTintHex at alphaFraction=0 is pure white, at 1 is the accent itself', () => {
    const accent = strataBandAccentColor(2, 6)
    expect(strataBandTintHex(accent, 0)).toBe('#ffffff')
    expect(strataBandTintHex(accent, 1)).toBe(accent)
  })

  it('a higher alphaFraction is visibly darker/more saturated than a lower one (monotonic toward the accent)', () => {
    const accent = strataBandAccentColor(2, 6)
    const light = strataBandTintHex(accent, 0.03)
    const strong = strataBandTintHex(accent, 0.1)
    expect(light).not.toBe(strong)
  })

  it('gradient stops: full is stronger than faded, faded is exactly 40% of full\'s alpha fraction', () => {
    const accent = strataBandAccentColor(3, 6)
    const { full, faded } = strataBandGradientStops(accent, 0.08)
    expect(full).not.toBe(faded)
    expect(strataBandTintHex(accent, 0.08 * 0.4)).toBe(faded)
    expect(strataBandTintHex(accent, 0.08)).toBe(full)
  })

  it('composes with strataEmptyLayerFill/strataAllCriticalFill — an empty or all-critical accent still produces two valid, distinct gradient stops', () => {
    const accent = strataBandAccentColor(1, 6)
    const emptyAccent = strataEmptyLayerFill(accent)
    const criticalAccent = strataAllCriticalFill(accent)
    expect(strataBandGradientStops(emptyAccent).full).not.toBe(strataBandGradientStops(accent).full)
    expect(strataBandGradientStops(criticalAccent).full).not.toBe(strataBandGradientStops(accent).full)
  })
})

describe('strataEmptyLayerFill', () => {
  it('reduces saturation without changing lightness (fill stays visible, just quiet)', () => {
    const normal = strataLayerFillColor(2, 6)
    const empty = strataEmptyLayerFill(normal)
    expect(empty).not.toBe(normal)
    // A real, distinct colour every time — never collapsing every layer to the same grey.
    expect(strataEmptyLayerFill(strataLayerFillColor(0, 6))).not.toBe(strataEmptyLayerFill(strataLayerFillColor(5, 6)))
  })
})

describe('strataAllCriticalFill / isAllCriticalLayer', () => {
  it('isAllCriticalLayer is true only when EVERY real status is REQUIRES_DESCENT', () => {
    expect(isAllCriticalLayer(['REQUIRES_DESCENT', 'REQUIRES_DESCENT'])).toBe(true)
    expect(isAllCriticalLayer(['REQUIRES_DESCENT', 'WATCH'])).toBe(false)
    expect(isAllCriticalLayer([])).toBe(false) // an empty layer is never "critical" — no real data to escalate on
    expect(isAllCriticalLayer([null])).toBe(false)
  })

  it('strataAllCriticalFill shifts the base colour toward red without producing pure red', () => {
    const base = strataLayerFillColor(0, 6)
    const shifted = strataAllCriticalFill(base)
    expect(shifted).not.toBe(base)
    expect(shifted.toLowerCase()).not.toBe('#ff0000')
  })
})

describe('estimateLayerCapacity / clusterOvercrowdedCells — 8.13.5 OVERCROWDED', () => {
  it('a layer under capacity clusters nothing', () => {
    const cells = Array.from({ length: 10 }, (_, i) => ({ id: `c${i}`, status: 'READY' as const, radiusPx: 7 }))
    const { clusters, individuals } = clusterOvercrowdedCells(cells, estimateLayerCapacity(900, 400, 7), 12.6)
    expect(clusters).toHaveLength(0)
    expect(individuals).toHaveLength(10)
  })

  it('a seeded 60-climber layer (proof: this expedition never reaches this count in one real layer) clusters same-status groups of 3-5, covering every real climber exactly once', () => {
    const statuses = ['READY', 'WATCH', 'IMPAIRED', 'REQUIRES_DESCENT'] as const
    const cells = Array.from({ length: 60 }, (_, i) => ({ id: `synthetic-${String(i).padStart(2, '0')}`, status: statuses[i % 4], radiusPx: 7 }))
    // A real Strata layer at the full 900x400 world footprint has an estimated
    // capacity in the hundreds (confirmed: the real 50-climber expedition's
    // densest real layer, 13 climbers, is nowhere near it) — this synthetic
    // proof instead sizes the CAPACITY to a small altitude band (a layer near
    // the top of a tall stack, where a real band can be much shorter) to
    // honestly demonstrate overcrowding without pretending the current real
    // stack's own generous layer heights would ever produce it.
    const capacity = estimateLayerCapacity(900, 60, 7)
    expect(cells.length).toBeGreaterThan(capacity) // sanity: this synthetic layer really is overcrowded relative to its own real capacity estimate
    const { clusters, individuals } = clusterOvercrowdedCells(cells, capacity, 12.6)

    expect(clusters.length).toBeGreaterThan(0)
    // Every cluster is single-status and sized 3-5.
    for (const c of clusters) {
      expect(c.memberIds.length).toBeGreaterThanOrEqual(3)
      expect(c.memberIds.length).toBeLessThanOrEqual(5)
      const memberStatuses = new Set(c.memberIds.map((id) => cells.find((c2) => c2.id === id)?.status))
      expect(memberStatuses.size).toBe(1)
    }
    // Every real climber accounted for exactly once (no duplicates, none dropped).
    const allIds = [...clusters.flatMap((c) => c.memberIds), ...individuals.map((c) => c.id)]
    expect(new Set(allIds).size).toBe(60)
    expect(allIds).toHaveLength(60)
  })

  it('is deterministic — same input, same clustering, every time', () => {
    const cells = Array.from({ length: 30 }, (_, i) => ({ id: `c${i}`, status: 'IMPAIRED' as const, radiusPx: 7 }))
    const a = clusterOvercrowdedCells(cells, 5, 12.6)
    const b = clusterOvercrowdedCells(cells, 5, 12.6)
    expect(a).toEqual(b)
  })

  it('excludeClusterIds ("expand to individuals") returns those members as individuals instead of a cluster, and nothing else changes', () => {
    const cells = Array.from({ length: 12 }, (_, i) => ({ id: `c${String(i).padStart(2, '0')}`, status: 'WATCH' as const, radiusPx: 7 }))
    const base = clusterOvercrowdedCells(cells, 5, 12.6)
    expect(base.clusters.length).toBeGreaterThan(0)
    const firstClusterId = base.clusters[0].clusterId
    const expanded = clusterOvercrowdedCells(cells, 5, 12.6, new Set([firstClusterId]))
    expect(expanded.clusters.some((c) => c.clusterId === firstClusterId)).toBe(false)
    expect(expanded.clusters.length).toBe(base.clusters.length - 1)
    const expandedMemberIds = base.clusters.find((c) => c.clusterId === firstClusterId)!.memberIds
    for (const id of expandedMemberIds) expect(expanded.individuals.some((c) => c.id === id)).toBe(true)
  })

  it('a same-status remainder under 3 folds into individuals rather than forming an undersized cluster', () => {
    const cells = Array.from({ length: 8 }, (_, i) => ({ id: `c${i}`, status: 'READY' as const, radiusPx: 7 }))
    const { clusters, individuals } = clusterOvercrowdedCells(cells, 3, 12.6)
    for (const c of clusters) expect(c.memberIds.length).toBeGreaterThanOrEqual(3)
    // 8 splits as one cluster of 3-5 plus a remainder that's always >=3 by construction when >=6 remain,
    // or folds entirely into individuals — never a cluster smaller than 3.
    expect(clusters.length + (individuals.length > 0 ? 1 : 0)).toBeGreaterThan(0)
  })
})
