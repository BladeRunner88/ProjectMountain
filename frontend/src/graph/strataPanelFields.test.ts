import { describe, expect, it } from 'vitest'
import { averageConfidencePct, averageReadinessWord, degradedSourceCount, predictionSplitForLayer, sourcesForLayer, worstStalenessMinutes } from './strataPanelFields'
import type { GraphNode } from './adapter'
import type { TracedValue } from '../ase/traced'

function tv(value: unknown, source = 'permit-registry'): TracedValue<unknown> {
  return {
    id: `tv-${Math.random()}`,
    value,
    derivation: { kind: 'observed', source, rawField: 'x', rawValue: value, receivedAt: '2026-01-01T00:00:00Z', sourceReliability: 0.9 },
    validFrom: '2026-01-01T00:00:00Z',
    validTo: null,
    recordedAt: '2026-01-01T00:00:00Z',
    supersededAt: null,
    supersededBy: null,
  } as unknown as TracedValue<unknown>
}

function climber(partial: Partial<GraphNode>): GraphNode {
  return {
    id: 'climber:x',
    type: 'climber',
    tier: 'child',
    label: 'X',
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

describe('averageReadinessWord', () => {
  it('empty/no-scored climbers -> Unassessed, never a fabricated word', () => {
    expect(averageReadinessWord([])).toBe('Unassessed')
    expect(averageReadinessWord([climber({ status: null }), climber({ status: null })])).toBe('Unassessed')
  })

  it('a single READY climber -> Ready', () => {
    expect(averageReadinessWord([climber({ status: 'READY' })])).toBe('Ready')
  })

  it('mean severity rounds to the nearest real status word', () => {
    // READY(0) + WATCH(1) = mean 0.5 -> rounds to 1 (WATCH)... rounds-half-up via Math.round
    expect(averageReadinessWord([climber({ status: 'READY' }), climber({ status: 'WATCH' })])).toBe('Watch')
  })

  it('null-status climbers do not drag the average toward READY', () => {
    const withUnknowns = averageReadinessWord([climber({ status: 'REQUIRES_DESCENT' }), climber({ status: null }), climber({ status: null })])
    expect(withUnknowns).toBe('Requires descent')
  })
})

describe('predictionSplitForLayer', () => {
  it('counts real predictedOutcome values, never merged with STATUS', () => {
    const climbers = [
      climber({ predictedOutcome: 'requires-descent' }),
      climber({ predictedOutcome: 'requires-descent' }),
      climber({ predictedOutcome: 'requires-review' }),
      climber({ predictedOutcome: 'watch' }),
      climber({ predictedOutcome: null }),
    ]
    const split = predictionSplitForLayer(climbers)
    expect(split.total).toBe(4)
    expect(split.byOutcome['requires-descent']).toBe(2)
    expect(split.byOutcome['requires-review']).toBe(1)
    expect(split.byOutcome.watch).toBe(1)
    expect(split.byOutcome.ready).toBe(0)
  })

  it('empty layer has zero predictions, not a fabricated count', () => {
    expect(predictionSplitForLayer([])).toEqual({ total: 0, byOutcome: { 'requires-descent': 0, 'requires-review': 0, watch: 0, ready: 0 } })
  })
})

describe('sourcesForLayer / degradedSourceCount', () => {
  it('deduplicates the same real source across multiple climbers', () => {
    const c1 = climber({ id: 'climber:1', properties: { name: tv('A') } })
    const c2 = climber({ id: 'climber:2', properties: { name: tv('B') } })
    const sources = sourcesForLayer([c1, c2], [])
    expect(sources).toHaveLength(1)
    expect(sources[0].id).toBe('permit-registry')
  })

  it('empty layer has no sources', () => {
    expect(sourcesForLayer([], [])).toEqual([])
  })

  it('degradedSourceCount only counts real degraded/critical states', () => {
    const sources = [
      { id: 'a', label: 'A', category: null, state: 'healthy' as const },
      { id: 'b', label: 'B', category: null, state: 'degraded' as const },
      { id: 'c', label: 'C', category: null, state: 'critical' as const },
      { id: 'd', label: 'D', category: null, state: null },
    ]
    expect(degradedSourceCount(sources)).toBe(2)
  })
})

describe('worstStalenessMinutes', () => {
  it('null when no climber has a real reading', () => {
    expect(worstStalenessMinutes([climber({ lastContactMinutesAgo: null })])).toBeNull()
  })

  it('takes the real maximum, not an average', () => {
    expect(worstStalenessMinutes([climber({ lastContactMinutesAgo: 5 }), climber({ lastContactMinutesAgo: 40 }), climber({ lastContactMinutesAgo: null })])).toBe(40)
  })
})

describe('averageConfidencePct', () => {
  it('null when no climber has a real value', () => {
    expect(averageConfidencePct([climber({})])).toBeNull()
  })

  it('averages real identityConfidencePct TracedValues', () => {
    const climbers = [climber({ properties: { identityConfidencePct: tv(80) } }), climber({ properties: { identityConfidencePct: tv(90) } })]
    expect(averageConfidencePct(climbers)).toBe(85)
  })
})
