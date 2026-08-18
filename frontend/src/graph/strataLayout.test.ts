import { describe, expect, it } from 'vitest'
import { altitudeInLayer, altitudeTicks, buildStrataLayers, expandedLayerBounds, layerForAltitude, totalSpanM } from './strataLayout'
import { MOVEMENT_ALTITUDES_M, MOVEMENT_CAMPS } from '../ase/identityCard'

describe('buildStrataLayers — real expedition data (N=6)', () => {
  const layers = buildStrataLayers(MOVEMENT_CAMPS, MOVEMENT_ALTITUDES_M)

  it('produces one layer per real camp, bottom to top, in order', () => {
    expect(layers.map((l) => l.name)).toEqual(MOVEMENT_CAMPS)
    expect(layers.map((l) => l.index)).toEqual([0, 1, 2, 3, 4, 5])
  })

  it('the lowest layer floors at the real Base Camp altitude', () => {
    expect(layers[0].floorM).toBe(MOVEMENT_ALTITUDES_M[0])
  })

  it('adjacent layers share a boundary — no gap, no overlap', () => {
    for (let i = 0; i < layers.length - 1; i++) {
      expect(layers[i].ceilingM).toBe(layers[i + 1].floorM)
    }
  })

  it('only the topmost layer is open-ended', () => {
    expect(layers.slice(0, -1).every((l) => !l.isOpenEnded)).toBe(true)
    expect(layers[layers.length - 1].isOpenEnded).toBe(true)
  })

  it('layer heights are proportional to altitude range, not equal', () => {
    const heights = layers.map((l) => l.ceilingM - l.floorM)
    expect(new Set(heights).size).toBeGreaterThan(1)
  })
})

describe('buildStrataLayers — generalises to N != 6 (never assumes a fixed count)', () => {
  it('N=3', () => {
    const layers = buildStrataLayers(['Base', 'Mid', 'High'], [4000, 6000, 8000])
    expect(layers).toHaveLength(3)
    expect(layers[0].floorM).toBe(4000)
    expect(layers[2].isOpenEnded).toBe(true)
  })

  it('N=12', () => {
    const names = Array.from({ length: 12 }, (_, i) => `Layer ${i}`)
    const altitudes = Array.from({ length: 12 }, (_, i) => 1000 + i * 500)
    const layers = buildStrataLayers(names, altitudes)
    expect(layers).toHaveLength(12)
    expect(layers[11].isOpenEnded).toBe(true)
    for (let i = 0; i < 11; i++) expect(layers[i].ceilingM).toBe(layers[i + 1].floorM)
  })

  it('N=1 degenerate case does not throw and produces a non-zero band', () => {
    const layers = buildStrataLayers(['Only'], [5000])
    expect(layers).toHaveLength(1)
    expect(layers[0].ceilingM).toBeGreaterThan(layers[0].floorM)
  })

  it('mismatched array lengths throw rather than silently misalign', () => {
    expect(() => buildStrataLayers(['A', 'B'], [1000])).toThrow()
  })
})

describe('layerForAltitude', () => {
  const layers = buildStrataLayers(MOVEMENT_CAMPS, MOVEMENT_ALTITUDES_M)

  it('bins a climber at a real camp altitude into that exact layer', () => {
    expect(layerForAltitude(MOVEMENT_ALTITUDES_M[2], layers)?.name).toBe('Camp II')
  })

  it('bins a climber above the last real point into the open-ended top layer', () => {
    expect(layerForAltitude(8900, layers)?.name).toBe('Summit')
  })

  it('null altitude (no real reading) never fabricates a layer', () => {
    expect(layerForAltitude(null, layers)).toBeNull()
  })

  it('a reading fractionally below the lowest floor still bins into the lowest layer rather than being dropped', () => {
    expect(layerForAltitude(MOVEMENT_ALTITUDES_M[0] - 5, layers)?.name).toBe('Base Camp')
  })
})

describe('totalSpanM', () => {
  it('sums the real generated stack, not a hardcoded constant', () => {
    const layers = buildStrataLayers(MOVEMENT_CAMPS, MOVEMENT_ALTITUDES_M)
    expect(totalSpanM(layers)).toBe(layers[layers.length - 1].ceilingM - layers[0].floorM)
  })

  it('empty layer list has zero span', () => {
    expect(totalSpanM([])).toBe(0)
  })
})

describe('altitudeInLayer', () => {
  const layers = buildStrataLayers(MOVEMENT_CAMPS, MOVEMENT_ALTITUDES_M)
  const campII = layers[2]
  const summit = layers[layers.length - 1]

  it('a real altitude at the layer\'s own point is a member', () => {
    expect(altitudeInLayer(campII.altitudeM, campII)).toBe(true)
  })

  it('an altitude in a different layer is not a member', () => {
    expect(altitudeInLayer(layers[0].altitudeM, campII)).toBe(false)
  })

  it('null altitude is never a member of anything', () => {
    expect(altitudeInLayer(null, campII)).toBe(false)
  })

  it('open-ended top layer accepts anything at or above its floor', () => {
    expect(altitudeInLayer(summit.floorM + 5000, summit)).toBe(true)
  })
})

describe('expandedLayerBounds', () => {
  // index 0 (Base Camp) has the LARGEST y (screen bottom); index 3 (highest
  // real layer) sits near y=0 (screen top) — matches StrataCanvas.tsx's own
  // altitude-to-y mapping.
  const bands = [
    { yTop: 600, yBottom: 1000 }, // index 0 — lowest altitude, screen bottom
    { yTop: 400, yBottom: 600 },
    { yTop: 200, yBottom: 400 },
    { yTop: 0, yBottom: 200 }, // index 3 — highest altitude, screen top
  ]

  it('nothing selected returns the bands unchanged', () => {
    expect(expandedLayerBounds(bands, null)).toEqual(bands)
  })

  it('the expanded layer keeps its own yTop fixed and grows yBottom by the given fraction', () => {
    const out = expandedLayerBounds(bands, 1, 0.2) // height 200 -> extra 40
    expect(out[1].yTop).toBe(400)
    expect(out[1].yBottom).toBe(640)
  })

  it('layers with a SMALLER index (physically below, closer to Base Camp) shift further down by the same extra amount, keeping their own height', () => {
    const out = expandedLayerBounds(bands, 1, 0.2)
    expect(out[0].yTop).toBe(640)
    expect(out[0].yBottom).toBe(1040)
    expect(out[0].yBottom - out[0].yTop).toBe(bands[0].yBottom - bands[0].yTop)
  })

  it('layers with a LARGER index (physically above, toward the summit) are untouched — "pushing... not overlapping"', () => {
    const out = expandedLayerBounds(bands, 1, 0.2)
    expect(out[2]).toEqual(bands[2])
    expect(out[3]).toEqual(bands[3])
  })

  it('expanding the topmost (highest-altitude) layer pushes EVERY layer below it down, since none are above to stay fixed', () => {
    const out = expandedLayerBounds(bands, 3, 0.2) // height 200 -> extra 40
    expect(out[3].yBottom).toBe(240)
    expect(out[2]).toEqual({ yTop: 240, yBottom: 440 })
    expect(out[1]).toEqual({ yTop: 440, yBottom: 640 })
    expect(out[0]).toEqual({ yTop: 640, yBottom: 1040 })
  })

  it('expanding the bottom-most (lowest-altitude) layer pushes nothing above it, only itself grows', () => {
    const out = expandedLayerBounds(bands, 0, 0.2)
    expect(out[0].yBottom).toBe(1080)
    expect(out[1]).toEqual(bands[1])
  })
})

describe('buildStrataLayers — 8.13.5 NO ROUTE DEFINITION', () => {
  it('an undefined route (no real camps/altitudes on record) produces an empty stack, never a fabricated one', () => {
    expect(buildStrataLayers([], [])).toEqual([])
  })
})

describe('altitudeTicks — 8.13-V.1 ALTITUDE GUTTER', () => {
  it('ticks every 500m within a real span, always including floor and ceiling', () => {
    const ticks = altitudeTicks(5364, 8849, 500)
    expect(ticks[0]).toBe(5364)
    expect(ticks[ticks.length - 1]).toBe(8849)
    expect(ticks.slice(1, -1)).toEqual([5500, 6000, 6500, 7000, 7500, 8000, 8500])
  })

  it('a floor that already lands on a round step is not duplicated', () => {
    const ticks = altitudeTicks(5000, 6500, 500)
    expect(ticks).toEqual([5000, 5500, 6000, 6500])
    expect(ticks.filter((t) => t === 5000)).toHaveLength(1)
  })

  it('generic over stepM, not hardcoded to 500', () => {
    const ticks = altitudeTicks(0, 1000, 250)
    expect(ticks).toEqual([0, 250, 500, 750, 1000])
  })

  it('a degenerate zero-height span returns just the floor, never throws', () => {
    expect(altitudeTicks(5000, 5000)).toEqual([5000])
  })
})
