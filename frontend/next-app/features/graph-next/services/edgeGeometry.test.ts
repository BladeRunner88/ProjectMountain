import { describe, expect, it } from 'vitest'
import { computeQuadraticCurve, quadraticPointAt, taperedRibbonPoints } from './edgeGeometry'

describe('computeQuadraticCurve (S8.5)', () => {
  it('bows the control point perpendicular to the chord by 8-18% of its length', () => {
    const a = { x: 0, y: 0 }
    const b = { x: 100, y: 0 }
    const c = computeQuadraticCurve('edge-1', a, b)
    // midpoint of the chord is (50,0); the control point's distance from
    // that midpoint, along the perpendicular (y-axis here), is the bow
    const bow = Math.abs(c.cy - 0)
    expect(bow).toBeGreaterThanOrEqual(100 * 0.08 - 1e-6)
    expect(bow).toBeLessThanOrEqual(100 * 0.18 + 1e-6)
    // control point stays near the chord's midpoint on the x-axis
    expect(c.cx).toBeCloseTo(50, 0)
  })

  it('is deterministic per edge key: the same key and endpoints always bow the same way', () => {
    const a = { x: 10, y: 20 }
    const b = { x: 210, y: 220 }
    const c1 = computeQuadraticCurve('edge-x', a, b)
    const c2 = computeQuadraticCurve('edge-x', a, b)
    expect(c1).toEqual(c2)
  })

  it('different edge keys can bow to different sides (not every edge curves the same direction)', () => {
    const a = { x: 0, y: 0 }
    const b = { x: 100, y: 0 }
    const sides = new Set<number>()
    for (let i = 0; i < 20; i++) {
      const c = computeQuadraticCurve(`edge-${i}`, a, b)
      sides.add(Math.sign(c.cy))
    }
    expect(sides.size).toBeGreaterThan(1)
  })

  it('quadraticPointAt(0) is the start point and quadraticPointAt(1) is the end point', () => {
    const a = { x: 5, y: 7 }
    const b = { x: 95, y: 55 }
    const c = computeQuadraticCurve('edge-2', a, b)
    expect(quadraticPointAt(c, 0)).toEqual(a)
    expect(quadraticPointAt(c, 1)).toEqual(b)
  })
})

describe('taperedRibbonPoints (S8.5)', () => {
  it('returns a closed polygon (2*(segments+1) points) with every coordinate finite', () => {
    const a = { x: 0, y: 0 }
    const b = { x: 40, y: 30 }
    const c = computeQuadraticCurve('edge-3', a, b)
    const poly = taperedRibbonPoints(c, 0.6, 0.2, 4)
    expect(poly).toHaveLength(2 * 5)
    for (const p of poly) {
      expect(Number.isFinite(p.x)).toBe(true)
      expect(Number.isFinite(p.y)).toBe(true)
    }
  })
})
