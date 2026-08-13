import { describe, expect, it } from 'vitest'
import { clearRegistry, supersede } from './graph'
import { sourceReliability } from './folds'
import { instant, observed, sourceId } from './traced'
import { asOf, nowView, validAt } from './bitemporal'
import { buildDataset } from './dataset'

describe('asOf', () => {
  it('a fact recorded after t is invisible', () => {
    clearRegistry()
    const tv = observed(sourceId('s'), 'f', 1, sourceReliability(0.9), {
      recordedAt: instant('2026-01-01T12:00:00.000Z'),
    })
    expect(asOf(instant('2026-01-01T11:59:59.000Z')).resolve(tv.id)).toBeUndefined()
    expect(asOf(instant('2026-01-01T12:00:00.000Z')).resolve(tv.id)?.id).toBe(tv.id)
  })

  it('supersededAt > t is ignored — the pre-supersession value is still what was known at t', () => {
    clearRegistry()
    const original = observed(sourceId('s'), 'f', 'old', sourceReliability(0.9), {
      recordedAt: instant('2026-01-01T10:00:00.000Z'),
    })
    const next = observed(sourceId('s'), 'f', 'new', sourceReliability(0.9), {
      recordedAt: instant('2026-01-01T14:00:00.000Z'),
    })
    supersede(original.id, next)

    // At noon, the supersession (recorded at 14:00) hasn't happened yet.
    const atNoon = asOf(instant('2026-01-01T12:00:00.000Z')).resolve(original.id)
    expect(atNoon?.value).toBe('old')

    // By 15:00 it has.
    const at3pm = asOf(instant('2026-01-01T15:00:00.000Z')).resolve(original.id)
    expect(at3pm?.value).toBe('new')
  })

  it('nowView always returns the latest link in the chain', () => {
    clearRegistry()
    const original = observed(sourceId('s'), 'f', 'old', sourceReliability(0.9))
    const next = observed(sourceId('s'), 'f', 'new', sourceReliability(0.9))
    supersede(original.id, next)
    expect(nowView().resolve(original.id)?.value).toBe('new')
  })
})

describe('validAt', () => {
  it('finds a backlogged record by its real-world valid time, even though it was recorded much later', () => {
    clearRegistry()
    const tv = observed(sourceId('s'), 'balance', 500, sourceReliability(0.9), {
      validFrom: instant('2026-01-01T00:00:00.000Z'),
      recordedAt: instant('2026-01-20T00:00:00.000Z'), // learned 19 days later
    })

    // Valid then, even though asOf(then) can't see it yet — it hadn't been recorded.
    expect(validAt(instant('2026-01-05T00:00:00.000Z')).resolve(tv.id)?.value).toBe(500)
    expect(asOf(instant('2026-01-05T00:00:00.000Z')).resolve(tv.id)).toBeUndefined()

    // Once actually recorded, asOf also sees it as of any time from then on.
    expect(asOf(instant('2026-01-20T00:00:00.000Z')).resolve(tv.id)?.value).toBe(500)
  })

  it('is empty outside the valid window', () => {
    clearRegistry()
    const tv = observed(sourceId('s'), 'f', 1, sourceReliability(0.9), {
      validFrom: instant('2026-01-01T00:00:00.000Z'),
      validTo: instant('2026-01-02T00:00:00.000Z'),
    })
    expect(validAt(instant('2025-12-31T00:00:00.000Z')).resolve(tv.id)).toBeUndefined()
    expect(validAt(instant('2026-01-01T12:00:00.000Z')).resolve(tv.id)?.id).toBe(tv.id)
    expect(validAt(instant('2026-01-03T00:00:00.000Z')).resolve(tv.id)).toBeUndefined()
  })
})

// THE ACCEPTANCE SCENARIO: "scrub to a point before a merge and the same
// person appears as three separate records again."
describe('scrubbing before a merge (the S3 acceptance scenario)', () => {
  it('the three raw records exist and the merged identity does not, before the merge; after it, the identity exists too', () => {
    const dataset = buildDataset(1)
    const dup = dataset.climbers.find((c) => c.findingId?.startsWith('finding-dup-'))!
    expect(dup).toBeDefined()

    const mergedTv = dup.name // the merged identity itself
    const mergeTime = mergedTv.recordedAt

    // Immediately before the merge: the identity is invisible...
    const justBefore = instant(new Date(new Date(mergeTime).getTime() - 1000).toISOString())
    expect(asOf(justBefore).resolve(mergedTv.id)).toBeUndefined()

    // ...but its three raw inputs are not — they were recorded hours earlier.
    if (mergedTv.derivation.kind !== 'merged') throw new Error('expected a merged derivation')
    const rawIds = mergedTv.derivation.from
    expect(rawIds).toHaveLength(3)
    for (const rawId of rawIds) {
      expect(asOf(justBefore).resolve(rawId)).toBeDefined()
    }

    // At the merge instant itself, the identity becomes visible.
    expect(asOf(mergeTime).resolve(mergedTv.id)?.id).toBe(mergedTv.id)

    // The climber's status genuinely moves too: "clean" before, "flagged" after.
    expect(asOf(justBefore).resolve(dup.status.id)?.value).toBe('clean')
    expect(asOf(mergeTime).resolve(dup.status.id)?.value).toBe('flagged')

    // And live/now always shows the resolved, merged state.
    expect(nowView().resolve(mergedTv.id)?.id).toBe(mergedTv.id)
    expect(nowView().resolve(dup.status.id)?.value).toBe('flagged')
  })
})
