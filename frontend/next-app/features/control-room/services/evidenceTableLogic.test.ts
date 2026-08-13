import { describe, expect, it } from 'vitest'
import { compareValues, computeVisibleRange, hasRenderableWhy } from './evidenceTableLogic'

describe('hasRenderableWhy', () => {
  it('rejects null and whitespace-only reasons', () => {
    expect(hasRenderableWhy(null)).toBe(false)
    expect(hasRenderableWhy('')).toBe(false)
    expect(hasRenderableWhy('   ')).toBe(false)
  })

  it('accepts a real sentence', () => {
    expect(hasRenderableWhy('Blood oxygen below the safe floor for 9 minutes.')).toBe(true)
  })
})

describe('compareValues', () => {
  it('compares numbers numerically', () => {
    expect(compareValues(2, 10)).toBeLessThan(0)
  })

  it('compares strings lexicographically', () => {
    expect(compareValues('b', 'a')).toBeGreaterThan(0)
  })
})

describe('computeVisibleRange', () => {
  it('windows around scrollTop with overscan, clamped to the list bounds', () => {
    const range = computeVisibleRange(50 * 40, 400, 40, 1000, 6)
    expect(range.start).toBe(50 - 6)
    expect(range.end).toBe(50 + 10 + 6)
  })

  it('never starts before 0 or ends past the total count', () => {
    const top = computeVisibleRange(0, 400, 40, 1000, 6)
    expect(top.start).toBe(0)

    const bottom = computeVisibleRange(990 * 40, 400, 40, 1000, 6)
    expect(bottom.end).toBe(1000)
  })
})
