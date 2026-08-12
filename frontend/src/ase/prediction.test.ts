import { describe, expect, it } from 'vitest'
import { buildDataset } from './dataset'
import { confidence, provenance } from './folds'
import { distributeContributions, PATTERN_LIBRARY, sumContributions } from './prediction'
import { Rng } from '../mock/rng'

describe('prediction (S9.10)', () => {
  it('builds at least one open prediction, every one foldable and provable', () => {
    const d = buildDataset(1)
    expect(d.predictions.order.length).toBeGreaterThan(0)
    expect(d.predictions.predictions.size).toBe(d.predictions.order.length)
    for (const climberId of d.predictions.order) {
      const p = d.predictions.predictions.get(climberId)!
      expect(() => provenance(p.likelihoodTraced)).not.toThrow()
      expect(() => confidence(p.likelihoodTraced)).not.toThrow()
      expect(p.likelihoodPct).toBeGreaterThanOrEqual(0)
      expect(p.likelihoodPct).toBeLessThanOrEqual(100)
    }
  })

  it('a prediction with no traceable drivers does not render — every built prediction has at least one', () => {
    const d = buildDataset(1)
    for (const climberId of d.predictions.order) {
      const p = d.predictions.predictions.get(climberId)!
      expect(p.drivers.length).toBeGreaterThan(0)
      for (const driver of p.drivers) {
        expect(driver.evidence.length).toBeGreaterThan(0)
        expect(driver.authority.length).toBeGreaterThan(0)
      }
    }
  })

  it("cognitive indicator contributions sum exactly to the axis's deficit from 100 — computed, not authored", () => {
    const d = buildDataset(1)
    for (const climberId of d.predictions.order) {
      const p = d.predictions.predictions.get(climberId)!
      const total = sumContributions(p.cognitive.indicators)
      expect(total).toBe(100 - p.cognitive.decisionCapacity)
      expect(p.cognitive.indicators).toHaveLength(8)
      for (const ind of p.cognitive.indicators) {
        expect(ind.contributionPts).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('Nima Tamang is the hero case, grounded in the real SpO2 chain and the real wind pattern', () => {
    const d = buildDataset(1)
    const nima = Array.from(d.identityRecords.values()).find((r) => r.who.fullLegalName.value === 'Nima Tamang')!
    const climberId = Array.from(d.identityRecords.entries()).find(([, r]) => r === nima)![0]
    expect(d.predictions.order).toContain(climberId)
    const p = d.predictions.predictions.get(climberId)!
    expect(p.likelihoodPct).toBe(68)
    expect(p.withinHours).toBe(6)
    const oxygenDriver = p.drivers.find((dr) => dr.id === 'driver-oxygen-recovery')!
    expect(oxygenDriver.evidence).toContain('90%')
    expect(oxygenDriver.evidence).toContain('81%')
    const windDriver = p.drivers.find((dr) => dr.id === 'driver-wind-exposure')!
    expect(windDriver.evidence).toContain('78 kph')
    const learnedDriver = p.drivers.find((dr) => dr.id === 'driver-learned-wind-oxygen')!
    expect(learnedDriver.label).toContain('18 minutes')
    expect(learnedDriver.evidence).toContain('47 of 52')
  })

  it('is deterministic for a given seed', () => {
    const a = buildDataset(1)
    const b = buildDataset(1)
    expect(a.predictions.order).toEqual(b.predictions.order)
    for (const id of a.predictions.order) {
      expect(a.predictions.predictions.get(id)!.cognitive.decisionCapacity).toBe(b.predictions.predictions.get(id)!.cognitive.decisionCapacity)
      expect(a.predictions.predictions.get(id)!.likelihoodPct).toBe(b.predictions.predictions.get(id)!.likelihoodPct)
    }
  })

  it('robust across seeds, not just seed 1', () => {
    for (const seed of [2, 7, 42]) {
      const d = buildDataset(seed)
      expect(d.predictions.order.length).toBeGreaterThan(0)
      for (const climberId of d.predictions.order) {
        const p = d.predictions.predictions.get(climberId)!
        expect(sumContributions(p.cognitive.indicators)).toBe(100 - p.cognitive.decisionCapacity)
      }
    }
  })

  it('calibration includes at least one confident miss and states the sample-size limit honestly', () => {
    const d = buildDataset(1)
    const { calibration } = d.predictions
    expect(calibration.resolved.some((r) => !r.correct)).toBe(true)
    expect(calibration.resolved.length).toBeGreaterThan(0)
    expect(calibration.totalResolvedCases).toBeGreaterThan(0)
    expect(calibration.reliability.reduce((sum, b) => sum + b.n, 0)).toBe(calibration.totalResolvedCases)
  })

  it('the pattern library has exactly the eight named patterns', () => {
    expect(PATTERN_LIBRARY).toHaveLength(8)
    for (const entry of PATTERN_LIBRARY) {
      expect(entry.triggers.length).toBeGreaterThan(0)
      expect(entry.observableMarkers.length).toBeGreaterThan(0)
    }
  })

  it('pattern likelihoods on a person are bands, never a bare percentage', () => {
    const d = buildDataset(1)
    for (const climberId of d.predictions.order) {
      const p = d.predictions.predictions.get(climberId)!
      for (const pattern of p.patterns) {
        expect(['likely', 'possible', 'unlikely']).toContain(pattern.likelihoodBand)
        expect(pattern.sampleSize).toBeGreaterThan(0)
      }
    }
  })

  it('the decision capacity timeline draws observed and projected with a real distinction', () => {
    const d = buildDataset(1)
    for (const climberId of d.predictions.order) {
      const p = d.predictions.predictions.get(climberId)!
      expect(p.timeline.some((pt) => pt.observed)).toBe(true)
      expect(p.timeline.some((pt) => !pt.observed)).toBe(true)
    }
  })
})

describe('distributeContributions', () => {
  it('always sums exactly to the requested total', () => {
    const rng = new Rng(1)
    for (let i = 0; i < 50; i++) {
      const total = rng.int(0, 100)
      const count = rng.int(1, 10)
      const parts = distributeContributions(total, count, rng)
      expect(parts).toHaveLength(count)
      expect(parts.reduce((a, b) => a + b, 0)).toBe(total)
      for (const part of parts) expect(part).toBeGreaterThanOrEqual(0)
    }
  })

  it('handles zero total and zero count without producing negatives', () => {
    const rng = new Rng(2)
    expect(distributeContributions(0, 5, rng).every((p) => p === 0)).toBe(true)
    expect(distributeContributions(10, 0, rng)).toEqual([])
    expect(distributeContributions(10, 1, rng)).toEqual([10])
  })
})
