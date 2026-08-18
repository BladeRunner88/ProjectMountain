import { describe, expect, it } from 'vitest'
import { crossCurve, parentChildCurve, quadraticPointAt, siblingCurve } from './edgeGeometry'

const A = { x: 0, y: 0 }
const B = { x: 100, y: 0 }

function bowMagnitude(curve: ReturnType<typeof parentChildCurve>): number {
  const mid = quadraticPointAt(curve, 0.5)
  const chordMidX = (curve.x1 + curve.x2) / 2
  const chordMidY = (curve.y1 + curve.y2) / 2
  return Math.hypot(mid.x - chordMidX, mid.y - chordMidY)
}

describe('edge curves — never straight', () => {
  it('parent-child, sibling, and cross curves all bow away from the straight chord', () => {
    expect(bowMagnitude(parentChildCurve('e1', A, B))).toBeGreaterThan(0)
    expect(bowMagnitude(siblingCurve('e1', A, B))).toBeGreaterThan(0)
    expect(bowMagnitude(crossCurve('e1', A, B))).toBeGreaterThan(0)
  })

  it('cross curves bow noticeably WIDER than parent-child, which bows wider than sibling', () => {
    const chordLength = 100
    const crossBow = bowMagnitude(crossCurve('same-key', A, B))
    const parentBow = bowMagnitude(parentChildCurve('same-key', A, B))
    const siblingBow = bowMagnitude(siblingCurve('same-key', A, B))
    expect(crossBow).toBeGreaterThan(parentBow)
    expect(parentBow).toBeGreaterThan(siblingBow)
    // sanity: none of them are absurd relative to the chord itself
    expect(crossBow).toBeLessThan(chordLength)
  })

  it('is deterministic: the same edge key always bows the same way', () => {
    const c1 = parentChildCurve('climber:climber-7', A, B)
    const c2 = parentChildCurve('climber:climber-7', A, B)
    expect(c1).toEqual(c2)
  })

  it('different edge keys can bow to different sides (not all the same direction)', () => {
    const sides = new Set<number>()
    for (let i = 0; i < 20; i++) {
      const c = parentChildCurve(`edge-${i}`, A, B)
      const mid = quadraticPointAt(c, 0.5)
      sides.add(Math.sign(Math.round(mid.y * 100)))
    }
    expect(sides.size).toBeGreaterThan(1)
  })

  it('quadraticPointAt(0) and (1) land exactly on the endpoints', () => {
    const c = parentChildCurve('e', A, B)
    expect(quadraticPointAt(c, 0)).toEqual(A)
    expect(quadraticPointAt(c, 1)).toEqual(B)
  })
})
