import { describe, expect, it } from 'vitest'
import { clearRegistry, resolve } from './graph'
import { sourceReliability } from './folds'
import { instant, observed, sourceId, type TracedValue } from './traced'
import {
  applyConflictPolicy,
  conflictFnSlug,
  pickConflictWinner,
  resolveConflict,
  resolveRangeMerge,
  type Conflict,
  type ConflictPolicy,
} from './conflict'

const sourceA = sourceId('source-a')
const sourceB = sourceId('source-b')

function makePair(overrides?: { aReliability?: number; bReliability?: number; aRecordedAt?: string; bRecordedAt?: string }) {
  clearRegistry()
  const a = observed(sourceA, 'f', 'value-a', sourceReliability(overrides?.aReliability ?? 0.9), {
    recordedAt: instant(overrides?.aRecordedAt ?? '2026-01-01T00:00:00.000Z'),
  })
  const b = observed(sourceB, 'f', 'value-b', sourceReliability(overrides?.bReliability ?? 0.9), {
    recordedAt: instant(overrides?.bRecordedAt ?? '2026-01-01T00:00:00.000Z'),
  })
  return { a, b }
}

describe('pickConflictWinner', () => {
  it('source-priority picks whichever source ranks first', () => {
    const { a, b } = makePair()
    const policy: ConflictPolicy = { id: 'p', property: 'f', strategy: 'source-priority', sourcePriority: [sourceB, sourceA], rationale: 'r' }
    expect(pickConflictWinner(a, b, policy)?.id).toBe(b.id)
  })

  it('most-recent picks the later recordedAt', () => {
    const { a, b } = makePair({ aRecordedAt: '2026-01-01T00:00:00.000Z', bRecordedAt: '2026-01-02T00:00:00.000Z' })
    const policy: ConflictPolicy = { id: 'p', property: 'f', strategy: 'most-recent', rationale: 'r' }
    expect(pickConflictWinner(a, b, policy)?.id).toBe(b.id)
  })

  it('highest-confidence picks the higher sourceReliability', () => {
    const { a, b } = makePair({ aReliability: 0.4, bReliability: 0.95 })
    const policy: ConflictPolicy = { id: 'p', property: 'f', strategy: 'highest-confidence', rationale: 'r' }
    expect(pickConflictWinner(a, b, policy)?.id).toBe(b.id)
  })

  it('human-required and range-merge never pick a winner', () => {
    const { a, b } = makePair()
    expect(pickConflictWinner(a, b, { id: 'p', property: 'f', strategy: 'human-required', rationale: 'r' })).toBeNull()
    expect(pickConflictWinner(a, b, { id: 'p', property: 'f', strategy: 'range-merge', rationale: 'r' })).toBeNull()
  })
})

describe('resolveConflict', () => {
  it('produces a derived TracedValue whose from is BOTH inputs — nothing discarded', () => {
    const { a, b } = makePair({ aReliability: 0.4, bReliability: 0.95 })
    const policy: ConflictPolicy = { id: 'p', property: 'f', strategy: 'highest-confidence', rationale: 'r' }
    const resolved = resolveConflict(a, b, policy, conflictFnSlug('subject', 'f'))!
    expect(resolved.derivation.kind).toBe('derived')
    if (resolved.derivation.kind !== 'derived') throw new Error('expected derived')
    expect(resolved.derivation.from).toEqual([a.id, b.id])
    expect(resolved.value).toBe('value-b')
    // The losing value is still in the graph, reachable, untouched.
    expect(resolve(a.id)?.value).toBe('value-a')
    expect(resolve(b.id)?.value).toBe('value-b')
  })

  it('returns null for human-required', () => {
    const { a, b } = makePair()
    const policy: ConflictPolicy = { id: 'p', property: 'f', strategy: 'human-required', rationale: 'r' }
    expect(resolveConflict(a, b, policy, conflictFnSlug('subject', 'f'))).toBeNull()
  })
})

describe('resolveRangeMerge', () => {
  it('stores the interval regardless of input order', () => {
    clearRegistry()
    const a = observed(sourceA, 'pressure', 862, sourceReliability(0.9))
    const b = observed(sourceB, 'pressure', 871, sourceReliability(0.9))
    const fn = conflictFnSlug('line', 'pressure')
    expect(resolveRangeMerge(a, b, fn).value).toEqual({ min: 862, max: 871 })
    expect(resolveRangeMerge(b, a, fn).value).toEqual({ min: 862, max: 871 })
  })
})

describe('applyConflictPolicy (the CHANGE POLICY action)', () => {
  function makeConflict(): Conflict {
    const { a, b } = makePair({ aReliability: 0.9, bReliability: 0.5, aRecordedAt: '2026-01-01T00:00:00.000Z', bRecordedAt: '2026-01-02T00:00:00.000Z' })
    const sourcePriorityPolicy: ConflictPolicy = { id: 'p-source', property: 'f', strategy: 'source-priority', sourcePriority: [sourceA, sourceB], rationale: 'r1' }
    const mostRecentPolicy: ConflictPolicy = { id: 'p-recent', property: 'f', strategy: 'most-recent', rationale: 'r2' }
    const humanRequiredPolicy: ConflictPolicy = { id: 'p-human', property: 'f', strategy: 'human-required', rationale: 'r3' }
    const fn = conflictFnSlug('subject', 'f')
    return {
      id: 'conflict-test',
      entityLabel: 'Subject',
      propertyLabel: 'F',
      policy: sourcePriorityPolicy,
      availablePolicies: [sourcePriorityPolicy, mostRecentPolicy, humanRequiredPolicy],
      a,
      aOrigin: 'Source A',
      b,
      bOrigin: 'Source B',
      resolved: resolveConflict(a, b, sourcePriorityPolicy, fn),
      format: (v) => String(v),
      downstream: [],
      resolve: (policy) => resolveConflict(a, b, policy, fn),
    }
  }

  it('switching to a strategy with a different winner supersedes the old resolved value', () => {
    const conflict = makeConflict()
    const previousResolvedId = conflict.resolved!.id
    expect(conflict.resolved!.value).toBe('value-a') // source-priority: A ranked first

    const mostRecent = conflict.availablePolicies.find((p) => p.strategy === 'most-recent')!
    applyConflictPolicy(conflict, mostRecent)

    expect(conflict.policy.strategy).toBe('most-recent')
    expect(conflict.resolved!.value).toBe('value-b') // B was recorded later
    expect(conflict.resolved!.id).not.toBe(previousResolvedId)
    // The OLD resolved value is superseded, not deleted — still walkable.
    const oldNode = resolve(previousResolvedId)
    expect(oldNode?.supersededBy).toBe(conflict.resolved!.id)
  })

  it('recomputes and supersedes downstream values when the resolution moves', () => {
    const conflict = makeConflict()
    let recomputeCalls = 0
    const downstreamTv = { ...conflict.resolved! } as TracedValue<unknown> // a distinct object, same shape, standing in for a real derived value
    conflict.downstream = [
      {
        label: 'Derived thing',
        traced: downstreamTv,
        format: (v) => String(v),
        recompute: (resolvedValue) => {
          recomputeCalls++
          return `derived-from-${resolvedValue}`
        },
      },
    ]

    const mostRecent = conflict.availablePolicies.find((p) => p.strategy === 'most-recent')!
    applyConflictPolicy(conflict, mostRecent)

    expect(recomputeCalls).toBe(1)
    expect(conflict.downstream[0].traced.value).toBe('derived-from-value-b')
  })

  it('switching to human-required clears `resolved` without touching the graph', () => {
    const conflict = makeConflict()
    const humanRequired = conflict.availablePolicies.find((p) => p.strategy === 'human-required')!

    applyConflictPolicy(conflict, humanRequired)

    expect(conflict.resolved).toBeNull()
    expect(conflict.policy.strategy).toBe('human-required')
    // a/b are completely unaffected — nothing was ever discarded.
    expect(resolve(conflict.a.id)?.value).toBe('value-a')
    expect(resolve(conflict.b.id)?.value).toBe('value-b')
  })

  it('switching between strategies that land on the same winner changes the policy but not the graph', () => {
    const conflict = makeConflict()
    const resolvedIdBefore = conflict.resolved!.id
    // source-priority already picked A; a strategy that also picks A should
    // update the active policy without superseding anything.
    const samePolicy: ConflictPolicy = { id: 'p-source-2', property: 'f', strategy: 'source-priority', sourcePriority: [sourceA, sourceB], rationale: 'r4' }
    applyConflictPolicy(conflict, samePolicy)
    expect(conflict.policy.id).toBe('p-source-2')
    expect(conflict.resolved!.id).toBe(resolvedIdBefore)
    expect(resolve(resolvedIdBefore)?.supersededBy).toBeNull()
  })
})
