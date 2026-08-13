import { describe, expect, it } from 'vitest'
import { buildGraphDataset, GRAPH_SEED } from './dataset'
import { computeFlaggedRecords, computeRecentRecords, computeRecordCounts } from './attachedRecords'

describe('graph/attachedRecords (S8.9)', () => {
  const dataset = buildGraphDataset(GRAPH_SEED)
  const climber = dataset.domainEntities.find((e) => e.tier === 'climber')!

  it('counts sum to the total number of that entity\'s own sub-nodes', () => {
    const counts = computeRecordCounts(dataset, climber.id)
    const sum = counts.reduce((a, c) => a + c.count, 0)
    const expected = dataset.subNodes.filter((s) => s.parentId === climber.id).length
    expect(sum).toBe(expected)
  })

  it('returns at most 10 records, sorted most-recent first', () => {
    const recent = computeRecentRecords(dataset, climber.id, 10)
    expect(recent.length).toBeLessThanOrEqual(10)
    for (let i = 1; i < recent.length; i++) expect(recent[i - 1].ts).toBeGreaterThanOrEqual(recent[i].ts)
  })

  it('every returned record actually belongs to the requested parent', () => {
    const recent = computeRecentRecords(dataset, climber.id, 10)
    for (const r of recent) expect(r.parentId).toBe(climber.id)
  })

  it('an id with no sub-nodes returns empty, not a throw', () => {
    expect(computeRecordCounts(dataset, 'not-a-real-id')).toEqual([])
    expect(computeRecentRecords(dataset, 'not-a-real-id')).toEqual([])
  })

  it('computeFlaggedRecords is exactly the alert-status subset of the same parent\'s records', () => {
    const anomalousClimberId = dataset.anomalyClimberIds[0]
    const flagged = computeFlaggedRecords(dataset, anomalousClimberId)
    for (const r of flagged) {
      expect(r.parentId).toBe(anomalousClimberId)
      expect(r.status).toBe('alert')
    }
    const expectedCount = dataset.subNodes.filter((s) => s.parentId === anomalousClimberId && s.status === 'alert').length
    expect(flagged.length).toBe(expectedCount)
  })
})
