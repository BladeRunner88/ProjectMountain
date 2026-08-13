import { describe, expect, it } from 'vitest'
import { buildDataset } from './dataset'
import { confidence, provenance } from './folds'
import {
  compositeScore,
  confusionMatrix,
  decisionBand,
  DEFAULT_THRESHOLDS,
  jaroSimilarity,
  percentileAmong,
  precision,
  recall,
  soundex,
} from './entityResolution'

describe('soundex (S9.6)', () => {
  it('matches the classic reference vectors', () => {
    expect(soundex('Robert')).toBe('R163')
    expect(soundex('Rupert')).toBe('R163')
    expect(soundex('Ashcraft')).toBe('A261')
    expect(soundex('Tymczak')).toBe('T522')
    expect(soundex('Pfister')).toBe('P123')
  })
})

describe('jaroSimilarity (S9.6)', () => {
  it('matches published reference examples', () => {
    expect(jaroSimilarity('MARTHA', 'MARHTA')).toBeCloseTo(0.944, 2)
    expect(jaroSimilarity('DIXON', 'DICKSONX')).toBeCloseTo(0.767, 2)
  })
  it('is 1 for identical strings and case-insensitive', () => {
    expect(jaroSimilarity('James', 'james')).toBe(1)
  })
})

describe('compositeScore + decisionBand (S9.6)', () => {
  it('a pair with nothing in common scores 0 and rejects', () => {
    const score = compositeScore({ passportMatch: false, nameA: 'Aaa', nameB: 'Zzz', sameOperator: false, dobWithinTwoDays: false })
    expect(score).toBe(0)
    expect(decisionBand(score)).toBe('reject')
  })
  it('a pair matching on everything scores near the formula max (98%) and auto-merges', () => {
    const score = compositeScore({ passportMatch: true, nameA: 'James', nameB: 'James', sameOperator: true, dobWithinTwoDays: true })
    expect(score).toBeCloseTo(0.98, 5)
    expect(decisionBand(score)).toBe('auto-merge')
  })
})

describe('the entity resolution ground truth set, wired through buildDataset (S9.6)', () => {
  it('has exactly 60 ground truth pairs', () => {
    const d = buildDataset(1)
    expect(d.entityResolution.groundTruthPairs).toHaveLength(60)
  })

  it('has exactly 14 pairs awaiting human review at the default thresholds, exactly one ambiguous', () => {
    const d = buildDataset(1)
    const review = d.entityResolution.groundTruthPairs.filter((p) => decisionBand(p.score, DEFAULT_THRESHOLDS) === 'human')
    expect(review).toHaveLength(14)
    const ambiguous = review.filter((p) => p.isAmbiguous)
    expect(ambiguous).toHaveLength(1)
    expect(ambiguous[0].isTrueMatch).toBe(false) // should be split, not merged
  })

  it('acceptance: dragging auto-merge from 90% to 84% drops precision from 98% to 91%, against the 60-pair ground truth', () => {
    const d = buildDataset(1)
    const pairs = d.entityResolution.groundTruthPairs.map((p) => ({ id: p.id, score: p.score, isTrueMatch: p.isTrueMatch }))

    const cm90 = confusionMatrix(pairs, 0.9)
    const precision90 = Math.round(precision(cm90) * 100)
    expect(precision90).toBe(98)

    const cm84 = confusionMatrix(pairs, 0.84)
    const precision84 = Math.round(precision(cm84) * 100)
    expect(precision84).toBe(91)

    // "with the number of affected people stated" — how many pairs moved
    // from human-review into auto-merge when the threshold dropped.
    const affected = (cm84.truePositive + cm84.falsePositive) - (cm90.truePositive + cm90.falsePositive)
    expect(affected).toBe(10)
  })

  it('recall is real and computable (not just precision)', () => {
    const d = buildDataset(1)
    const pairs = d.entityResolution.groundTruthPairs.map((p) => ({ id: p.id, score: p.score, isTrueMatch: p.isTrueMatch }))
    const cm = confusionMatrix(pairs, 0.9)
    const r = recall(cm)
    expect(r).toBeGreaterThan(0)
    expect(r).toBeLessThan(1)
  })

  it('every ground truth pair carries real, walkable TracedValue names', () => {
    const d = buildDataset(1)
    for (const p of d.entityResolution.groundTruthPairs) {
      expect(() => provenance(p.recordA.name)).not.toThrow()
      expect(() => provenance(p.recordB.name)).not.toThrow()
      expect(() => confidence(p.recordA.name)).not.toThrow()
    }
  })

  it('the worked example is James Marshall III with exactly the three given source strings', () => {
    const d = buildDataset(1)
    const worked = d.entityResolution.worked
    expect(worked.label).toBe('James Marshall III')
    const names = worked.records.map((r) => r.name.value)
    expect(names).toContain('James Marshall III')
    expect(names).toContain('J. Marshall')
    expect(names).toContain('Marshall, James')
  })

  it("the worked example's three records disagree on date of birth by exactly one day", () => {
    const d = buildDataset(1)
    const dobs = d.entityResolution.worked.records.map((r) => new Date(r.dobIso).getTime())
    const spread = (Math.max(...dobs) - Math.min(...dobs)) / (24 * 60 * 60 * 1000)
    expect(spread).toBe(1)
  })

  it('the worked example scores comfortably in the auto-merge band on every pairwise comparison', () => {
    const d = buildDataset(1)
    for (const p of d.entityResolution.worked.pairwiseScores) {
      expect(decisionBand(p.score)).toBe('auto-merge')
    }
  })

  it('the worked example produces a real merged() TracedValue with all three sources as inputs', () => {
    const d = buildDataset(1)
    const worked = d.entityResolution.worked
    expect(worked.merged.derivation.kind).toBe('merged')
    if (worked.merged.derivation.kind !== 'merged') throw new Error('expected merged')
    expect(worked.merged.derivation.from).toHaveLength(3)
    expect(() => provenance(worked.merged)).not.toThrow()
  })

  it('blocking: the loose key finds at least as many comparisons as the tight key, and both are less than the possible-pairs count', () => {
    const d = buildDataset(1)
    const [tight, loose] = d.entityResolution.blockingKeys
    expect(tight.key).toBe('tight')
    expect(loose.key).toBe('loose')
    expect(loose.comparisons).toBeGreaterThanOrEqual(tight.comparisons)
    expect(loose.comparisons).toBeLessThan(d.entityResolution.possiblePairs)
    expect(loose.recallPct).toBe(100)
    expect(tight.recallPct).toBeLessThan(100)
  })

  it('is fully deterministic for a given seed', () => {
    const a = buildDataset(1)
    const b = buildDataset(1)
    expect(a.entityResolution.groundTruthPairs.map((p) => p.score)).toEqual(b.entityResolution.groundTruthPairs.map((p) => p.score))
  })

  it("the worked cluster's serial matches James's real identity record serial (S9.6 rebuild)", () => {
    const d = buildDataset(1)
    const james = d.identityRecords.get(d.climbers[0].id)!
    expect(d.entityResolution.worked.serial).not.toBeNull()
    expect(d.entityResolution.worked.serial!.value).toBe(james.serial.value)
  })
})

describe('buildPersonScoring (S9.6 rebuild — per-person scoring for the athlete rating card)', () => {
  it('produces exactly one scoring profile per climber, each with three pairwise comparisons and a non-empty history ending nowhere in particular but present', () => {
    const d = buildDataset(1)
    expect(d.personScoring.size).toBe(d.climbers.length)
    for (const scoring of d.personScoring.values()) {
      expect(scoring.pairwise).toHaveLength(3)
      expect(scoring.history.length).toBeGreaterThan(1)
      expect(scoring.band).toMatch(/^(auto-merge|human|reject)$/)
    }
  })

  it('is fully deterministic for a given seed', () => {
    const a = buildDataset(1)
    const b = buildDataset(1)
    const aScores = Array.from(a.personScoring.values()).map((s) => s.overallScore)
    const bScores = Array.from(b.personScoring.values()).map((s) => s.overallScore)
    expect(aScores).toEqual(bScores)
  })
})

describe('percentileAmong (S9.6 rebuild)', () => {
  it('ranks a score against a population correctly', () => {
    expect(percentileAmong(50, [10, 20, 30, 40, 50])).toBe(80)
    expect(percentileAmong(10, [10, 20, 30, 40, 50])).toBe(0)
    expect(percentileAmong(100, [10, 20, 30, 40, 50])).toBe(100)
  })

  it('returns 0 for an empty population rather than dividing by zero', () => {
    expect(percentileAmong(50, [])).toBe(0)
  })
})
