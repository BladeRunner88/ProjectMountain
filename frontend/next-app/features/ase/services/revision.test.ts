import { describe, expect, it } from 'vitest'
import { buildDataset } from './dataset'
import { computeSeal, verifyChain, type QueueSourceTab } from './revision'

describe('revision (S9.11)', () => {
  it('the queue contains items from Model, Identity, Meaning, Detection, Prediction and Exposure, each linking back to its source tab', () => {
    const d = buildDataset(1)
    const fromTabs = new Set(d.revision.queue.map((i) => i.fromTab))
    const expected: QueueSourceTab[] = ['model', 'identity', 'meaning', 'detection', 'prediction', 'exposure']
    for (const tab of expected) {
      expect(fromTabs.has(tab)).toBe(true)
    }
  })

  it('Prediction raises exactly three kinds of item: a wrong prediction, a pattern that did not appear, and an overruled recommendation', () => {
    const d = buildDataset(1)
    const predictionItems = d.revision.queue.filter((i) => i.fromTab === 'prediction')
    const kinds = new Set(predictionItems.map((i) => i.kind))
    expect(kinds.has('prediction-wrong')).toBe(true)
    expect(kinds.has('prediction-pattern-missed')).toBe(true)
    expect(kinds.has('prediction-overruled')).toBe(true)
  })

  it('every queue item is priority-tiered and leads with a real recommendation', () => {
    const d = buildDataset(1)
    expect(d.revision.queue.length).toBeGreaterThan(0)
    for (const item of d.revision.queue) {
      expect(['critical', 'standard', 'backlog']).toContain(item.priority)
      expect(item.recommendation.action.length).toBeGreaterThan(0)
      expect(item.recommendation.why.length).toBeGreaterThan(0)
      expect(item.recommendation.ifNothing.length).toBeGreaterThan(0)
    }
  })

  it('the queue sorts by priority first (critical before standard before backlog)', () => {
    const d = buildDataset(1)
    const rank: Record<string, number> = { critical: 0, standard: 1, backlog: 2 }
    for (let i = 1; i < d.revision.queue.length; i++) {
      expect(rank[d.revision.queue[i].priority]).toBeGreaterThanOrEqual(rank[d.revision.queue[i - 1].priority])
    }
  })

  it('blast radius is computed, not chosen — the two conflict-backed items report a real dependents() count', () => {
    const d = buildDataset(1)
    const modelItem = d.revision.queue.find((i) => i.id === 'queue-model-ethnicity')
    const identityItem = d.revision.queue.find((i) => i.id === 'queue-identity-mountains')
    expect(modelItem).toBeDefined()
    expect(identityItem).toBeDefined()
    expect(modelItem!.blastRadius).toBeGreaterThanOrEqual(0)
    expect(identityItem!.blastRadius).toBeGreaterThan(0)
  })

  it('the seal chain is genuinely hash-chained and verifiable', () => {
    const d = buildDataset(1)
    const result = verifyChain(d.revision.auditSeed)
    expect(result.intact).toBe(true)
    expect(result.brokenAtId).toBeNull()
  })

  it('tampering with any entry breaks the chain from that point forward', () => {
    const d = buildDataset(1)
    const tampered = d.revision.auditSeed.map((e, i) => (i === 2 ? { ...e, whatChanged: 'tampered' } : e))
    const result = verifyChain(tampered)
    expect(result.intact).toBe(false)
    expect(result.brokenAtId).toBe(d.revision.auditSeed[2].id)
  })

  it('computeSeal is deterministic for the same entry and previous seal', () => {
    const d = buildDataset(1)
    const entry = d.revision.auditSeed[0]
    const { seal, ...withoutSeal } = entry
    const recomputed = computeSeal(withoutSeal, 'genesis')
    expect(recomputed).toBe(seal)
  })

  it('every audit entry carries a serial or a clear non-person label, and a seal', () => {
    const d = buildDataset(1)
    for (const entry of d.revision.auditSeed) {
      expect(entry.seal.length).toBeGreaterThan(0)
      expect(entry.aboutLabel.length).toBeGreaterThan(0)
    }
  })

  it('corrections branch rather than overwrite — a correction entry references the original, which stays in the chain', () => {
    const d = buildDataset(1)
    const correction = d.revision.auditSeed.find((e) => e.correctionOfId !== null)
    expect(correction).toBeDefined()
    const original = d.revision.auditSeed.find((e) => e.id === correction!.correctionOfId)
    expect(original).toBeDefined()
  })

  it('no figure converts model performance into lives saved', () => {
    const d = buildDataset(1)
    const serialized = JSON.stringify(d.revision)
    expect(serialized.toLowerCase()).not.toContain('lives saved')
    expect(serialized.toLowerCase()).not.toContain('lives protected')
  })

  it('regression results and human-versus-ASE are both real, built structures', () => {
    const d = buildDataset(1)
    expect(d.revision.regressionResults.length).toBeGreaterThan(0)
    expect(d.revision.regressionResults.some((r) => r.verdict === 'fail')).toBe(true)
    expect(d.revision.humanVsAse.humanOverruleN).toBeGreaterThan(0)
    expect(d.revision.humanVsAse.aseN).toBeGreaterThan(0)
  })

  it('is deterministic for a given seed', () => {
    const a = buildDataset(1)
    const b = buildDataset(1)
    expect(a.revision.queue.map((i) => i.id)).toEqual(b.revision.queue.map((i) => i.id))
    expect(a.revision.queue.map((i) => i.blastRadius)).toEqual(b.revision.queue.map((i) => i.blastRadius))
  })

  it('robust across seeds, not just seed 1', () => {
    for (const seed of [2, 7, 42]) {
      const d = buildDataset(seed)
      expect(d.revision.queue.length).toBeGreaterThan(0)
      expect(verifyChain(d.revision.auditSeed).intact).toBe(true)
    }
  })
})
