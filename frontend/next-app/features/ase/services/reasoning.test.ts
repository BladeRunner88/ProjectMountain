import { describe, expect, it } from 'vitest'
import { buildDataset } from './dataset'
import { confidence, provenance } from './folds'
import { runCounterfactual } from './reasoning'

describe('reasoning (S9.8)', () => {
  it('the primary answer shows what was ruled out before the answer, each with disproving evidence', () => {
    const d = buildDataset(1)
    const answer = d.reasoningEngine.answers.get(d.reasoningEngine.cannedQuestions[0])!
    expect(answer.ruledOut.length).toBeGreaterThanOrEqual(3)
    const factors = answer.ruledOut.map((r) => r.factor)
    expect(factors).toContain('Sensor hardware fault')
    expect(factors).toContain('One operator ascending too fast')
    expect(factors).toContain('Delayed data')
    for (const r of answer.ruledOut) {
      expect(r.evidence.length).toBeGreaterThan(0)
      expect(() => provenance(r.evidenceTraced)).not.toThrow()
      expect(() => confidence(r.evidenceTraced)).not.toThrow()
    }
    expect(answer.activeFactor).toBe('Sustained ridge wind')
  })

  it('the primary chain has exactly 7 hops, each a real, walkable, foldable TracedValue', () => {
    const d = buildDataset(1)
    const answer = d.reasoningEngine.answers.get(d.reasoningEngine.cannedQuestions[0])!
    expect(answer.chain).toHaveLength(7)
    answer.chain.forEach((hop, i) => {
      expect(hop.n).toBe(i + 1)
      expect(() => provenance(hop.traced)).not.toThrow()
      expect(() => confidence(hop.traced)).not.toThrow()
    })
    // the dependency structure named in the spec: hop 2 reads from hop 1,
    // hop 7 (the learned pattern) reads from hop 2 and hop 6
    expect(answer.chain[1].dependsOnHopIds).toEqual(['hop-1'])
    expect(answer.chain[6].dependsOnHopIds).toEqual(['hop-2', 'hop-6'])
    expect(answer.causeDependsOnHopIds).toContain('hop-2')
    expect(answer.causeDependsOnHopIds).toContain('hop-7')
  })

  it('CAUSE is itself a real, foldable TracedValue with a real confidence, not an authored number', () => {
    const d = buildDataset(1)
    const answer = d.reasoningEngine.answers.get(d.reasoningEngine.cannedQuestions[0])!
    const conf = confidence(answer.cause)
    expect(conf).toBeGreaterThan(0)
    expect(conf).toBeLessThanOrEqual(1)
  })

  it('the three secondary questions resolve to real answers grounded in existing findings/conflicts', () => {
    const d = buildDataset(1)
    const questions = d.reasoningEngine.cannedQuestions
    expect(questions).toHaveLength(4)
    for (const q of questions.slice(1)) {
      const answer = d.reasoningEngine.answers.get(q)!
      expect(answer.chain.length).toBeGreaterThan(0)
      expect(answer.supportsCounterfactuals).toBe(false)
      expect(() => confidence(answer.cause)).not.toThrow()
    }
  })

  it('acceptance: counterfactuals recompute from the real dependency tree rather than replay a script', () => {
    const d = buildDataset(1)
    const { primaryChainIds, primaryInputs } = d.reasoningEngine
    const answer = d.reasoningEngine.answers.get(d.reasoningEngine.cannedQuestions[0])!
    const baseline = Math.round(confidence(answer.cause) * 100)

    const withoutWeather = runCounterfactual('without-weather-feed', primaryChainIds, primaryInputs)
    const ifSensorWrong = runCounterfactual('if-sensor-4-wrong', primaryChainIds, primaryInputs)
    const withoutPattern = runCounterfactual('without-learned-pattern', primaryChainIds, primaryInputs)

    // each one genuinely differs from the baseline and from each other —
    // three different real graph walks, not three authored strings
    expect(withoutWeather.confidencePct).not.toBe(baseline)
    expect(ifSensorWrong.confidencePct).not.toBe(baseline)
    expect(withoutPattern.confidencePct).not.toBe(baseline)
    const distinct = new Set([withoutWeather.confidencePct, ifSensorWrong.confidencePct, withoutPattern.confidencePct])
    expect(distinct.size).toBe(3)

    // removing the root sensor reading cascades to zero: hop2 and hop7 are
    // both transitively downstream of hop1, and CAUSE reads from both
    expect(ifSensorWrong.confidencePct).toBe(0)

    // removing the learned pattern leaves hop2 (the raw exceedance) as
    // CAUSE's other real input, so confidence should not collapse to zero
    expect(withoutPattern.confidencePct).toBeGreaterThan(0)
  })

  it('counterfactuals are pure: calling the same one twice produces the same result, and the base answer is untouched', () => {
    const d = buildDataset(1)
    const { primaryChainIds, primaryInputs } = d.reasoningEngine
    const answer = d.reasoningEngine.answers.get(d.reasoningEngine.cannedQuestions[0])!
    const before = confidence(answer.cause)

    const first = runCounterfactual('without-weather-feed', primaryChainIds, primaryInputs)
    const second = runCounterfactual('without-weather-feed', primaryChainIds, primaryInputs)
    expect(first.confidencePct).toBe(second.confidencePct)
    expect(confidence(answer.cause)).toBe(before)
  })

  it('is deterministic for a given seed', () => {
    // buildDataset resets the shared TracedValue registry, so folding `a`'s
    // values after `b` is built would hit a dangling id (same constraint
    // contextEngine.test.ts's own determinism test respects) — compare raw
    // values only, captured before the second build.
    const a = buildDataset(1)
    const qa = a.reasoningEngine.answers.get(a.reasoningEngine.cannedQuestions[0])!
    const aCauseValue = qa.cause.value
    const aChainValues = qa.chain.map((h) => h.traced.value)

    const b = buildDataset(1)
    const qb = b.reasoningEngine.answers.get(b.reasoningEngine.cannedQuestions[0])!
    expect(qb.cause.value).toBe(aCauseValue)
    expect(qb.chain.map((h) => h.traced.value)).toEqual(aChainValues)
  })
})
