import { describe, expect, it } from 'vitest'
import { computeVisibleLabels } from './labelCollision'

describe('computeVisibleLabels', () => {
  it('shows both labels when they are far apart', () => {
    const visible = computeVisibleLabels([
      { id: 'a', label: 'Nepal', anchorX: 0, anchorY: 0, fontSize: 11, priority: 2 },
      { id: 'b', label: 'Pakistan', anchorX: 500, anchorY: 0, fontSize: 11, priority: 2 },
    ])
    expect(visible.has('a')).toBe(true)
    expect(visible.has('b')).toBe(true)
  })

  it('hides the lower-priority label when two overlap, keeping the higher-priority one', () => {
    const visible = computeVisibleLabels([
      { id: 'root', label: 'Nepal', anchorX: 100, anchorY: 100, fontSize: 11, priority: 2 },
      { id: 'parent', label: 'South Col Route', anchorX: 102, anchorY: 101, fontSize: 11, priority: 1 },
    ])
    expect(visible.has('root')).toBe(true)
    expect(visible.has('parent')).toBe(false)
  })

  it('never shows two overlapping labels at the same priority (stable, deterministic pick)', () => {
    const visible = computeVisibleLabels([
      { id: 'x', label: 'Khumbu Vertical', anchorX: 100, anchorY: 100, fontSize: 11, priority: 1 },
      { id: 'y', label: 'Baltoro Expeditions', anchorX: 101, anchorY: 100, fontSize: 11, priority: 1 },
    ])
    expect(visible.size).toBe(1)
  })

  it('a dense cluster of many labels never produces more visible labels than fit without overlap', () => {
    const candidates = Array.from({ length: 30 }, (_, i) => ({
      id: `n${i}`,
      label: 'Operator Name Here',
      anchorX: 100 + (i % 5) * 4, // tightly packed, well within collision range
      anchorY: 100 + Math.floor(i / 5) * 4,
      fontSize: 11,
      priority: 1,
    }))
    const visible = computeVisibleLabels(candidates)
    expect(visible.size).toBeGreaterThan(0)
    expect(visible.size).toBeLessThan(candidates.length)
  })
})
