import { describe, expect, it } from 'vitest'
import { baseColorFor, computeStatusRollup, isCritical, resolvedHexColorFor, STATUS_COLOR, STATUS_COLOR_HEX, truncateLabel, UNKNOWN_STATUS_FILL, UNKNOWN_STATUS_FILL_HEX } from './nodeVisuals'
import type { GraphNode } from './adapter'

function node(partial: Partial<GraphNode> & Pick<GraphNode, 'id' | 'tier'>): GraphNode {
  return {
    type: 'route',
    label: partial.id,
    parentId: null,
    status: null,
    properties: {},
    serial: null,
    createdAt: '2026-01-01T00:00:00Z',
    drivers: null,
    role: null,
    lastContactMinutesAgo: null,
    predictedOutcome: null,
    predictedWithinHours: null,
    timeline: null,
    sourceCategory: null,
    sourceHealth: null,
    sourceBackup: null,
    ...partial,
  }
}

describe('baseColorFor', () => {
  it('a climber with no status falls back to the neutral (leaf) colour, not a fifth invented status', () => {
    const climber = node({ id: 'c1', tier: 'child', status: null })
    expect(baseColorFor(climber)).toBe(UNKNOWN_STATUS_FILL)
  })

  it('a scored climber uses its own status colour', () => {
    for (const status of ['READY', 'WATCH', 'IMPAIRED', 'REQUIRES_DESCENT'] as const) {
      const climber = node({ id: 'c1', tier: 'child', status })
      expect(baseColorFor(climber)).toBe(STATUS_COLOR[status])
    }
  })
})

describe('computeStatusRollup', () => {
  it('bubbles a climber\'s status up through every ancestor, keeping the most severe when multiple descendants disagree', () => {
    const nodes: GraphNode[] = [
      node({ id: 'country:A', tier: 'root' }),
      node({ id: 'route:1', tier: 'parent', parentId: 'country:A' }),
      node({ id: 'operator:1', tier: 'parent', parentId: 'route:1' }),
      node({ id: 'climber:1', tier: 'child', parentId: 'operator:1', status: 'WATCH' }),
      node({ id: 'climber:2', tier: 'child', parentId: 'operator:1', status: 'REQUIRES_DESCENT' }),
    ]
    const rollup = computeStatusRollup(nodes)
    expect(rollup.get('operator:1')).toBe('REQUIRES_DESCENT')
    expect(rollup.get('route:1')).toBe('REQUIRES_DESCENT')
    expect(rollup.get('country:A')).toBe('REQUIRES_DESCENT')
  })

  it('a node with no scored descendant at all is absent from the map — no badge, not READY-by-default', () => {
    const nodes: GraphNode[] = [node({ id: 'country:A', tier: 'root' }), node({ id: 'route:1', tier: 'parent', parentId: 'country:A' })]
    const rollup = computeStatusRollup(nodes)
    expect(rollup.has('country:A')).toBe(false)
    expect(rollup.has('route:1')).toBe(false)
  })
})

describe('isCritical', () => {
  it('is true ONLY for REQUIRES_DESCENT — WATCH/IMPAIRED rollups do not count as "critical"', () => {
    const rollup = new Map([
      ['country:critical', 'REQUIRES_DESCENT' as const],
      ['country:impaired', 'IMPAIRED' as const],
      ['country:watch', 'WATCH' as const],
      ['country:ready', 'READY' as const],
    ])
    expect(isCritical('country:critical', rollup)).toBe(true)
    expect(isCritical('country:impaired', rollup)).toBe(false)
    expect(isCritical('country:watch', rollup)).toBe(false)
    expect(isCritical('country:ready', rollup)).toBe(false)
    expect(isCritical('country:unscored', rollup)).toBe(false)
  })
})

describe('resolvedHexColorFor', () => {
  it('mirrors baseColorFor\'s mapping exactly, just as a literal hex instead of a var()', () => {
    const cases: GraphNode[] = [
      node({ id: 'country:A', tier: 'root' }),
      node({ id: 'route:1', tier: 'parent' }),
      node({ id: 'source:1', tier: 'leaf' }),
      node({ id: 'climber:unscored', tier: 'child', status: null }),
      node({ id: 'climber:ready', tier: 'child', status: 'READY' }),
      node({ id: 'climber:watch', tier: 'child', status: 'WATCH' }),
      node({ id: 'climber:impaired', tier: 'child', status: 'IMPAIRED' }),
      node({ id: 'climber:descent', tier: 'child', status: 'REQUIRES_DESCENT' }),
    ]
    for (const n of cases) {
      expect(resolvedHexColorFor(n)).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  it('an unscored climber resolves to the same neutral hex baseColorFor falls back to', () => {
    const climber = node({ id: 'c1', tier: 'child', status: null })
    expect(resolvedHexColorFor(climber)).toBe(UNKNOWN_STATUS_FILL_HEX)
  })

  it('a scored climber resolves to its own status hex, matching STATUS_COLOR_HEX', () => {
    for (const status of ['READY', 'WATCH', 'IMPAIRED', 'REQUIRES_DESCENT'] as const) {
      const climber = node({ id: 'c1', tier: 'child', status })
      expect(resolvedHexColorFor(climber)).toBe(STATUS_COLOR_HEX[status])
    }
  })
})

describe('truncateLabel', () => {
  it('leaves short labels untouched', () => {
    expect(truncateLabel('Nepal')).toBe('Nepal')
  })

  it('truncates past 20 chars with an ellipsis, total length still 20', () => {
    const long = 'A Very Long Expedition Operator Name'
    const result = truncateLabel(long, 20)
    expect(result.length).toBe(20)
    expect(result.endsWith('…')).toBe(true)
  })
})
