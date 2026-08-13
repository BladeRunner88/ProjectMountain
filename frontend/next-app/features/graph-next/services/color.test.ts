import { describe, expect, it } from 'vitest'
import { buildGraphDataset, GRAPH_SEED } from './dataset'
import { buildColorResolver } from './color'
import { ANOMALY_RED } from '../types/tokens'

function lightnessOf(hsl: string): number {
  const m = /hsl\([\d.]+,\s*[\d.]+%,\s*([\d.]+)%\)/.exec(hsl)
  return m ? parseFloat(m[1]) : Number.NaN
}
function hueOf(hsl: string): number {
  const m = /hsl\(([\d.]+),/.exec(hsl)
  return m ? parseFloat(m[1]) : Number.NaN
}

describe('buildColorResolver (S8.5)', () => {
  const dataset = buildGraphDataset(GRAPH_SEED)
  const colors = buildColorResolver(dataset)

  it('anomaly overrides hue entirely: every anomalous climber/sensor is the fixed anomaly red, regardless of country', () => {
    for (const id of [...dataset.anomalyClimberIds, ...dataset.anomalySensorIds]) {
      expect(colors.colorFor(id)).toBe(ANOMALY_RED)
      expect(colors.glowFor(id)).toBe(true)
    }
  })

  it('every alert-status sub-node is the fixed anomaly red', () => {
    const alertSubs = dataset.subNodes.filter((s) => s.status === 'alert')
    expect(alertSubs.length).toBeGreaterThan(0)
    for (const s of alertSubs) {
      expect(colors.colorFor(s.id)).toBe(ANOMALY_RED)
      expect(colors.glowFor(s.id)).toBe(true)
    }
  })

  it('a nominal node inherits its own country\'s hue — two entities under the same country share hue, and it differs from a different country\'s', () => {
    const countries = dataset.domainEntities.filter((e) => e.tier === 'country')
    const [c1, c2] = countries
    const region1 = dataset.domainEntities.find((e) => e.tier === 'region' && e.countryId === c1.id && e.status === 'nominal')!
    const region2 = dataset.domainEntities.find((e) => e.tier === 'region' && e.countryId === c2.id && e.status === 'nominal')!
    expect(hueOf(colors.colorFor(region1.id))).toBeCloseTo(hueOf(colors.colorFor(c1.id)), 1)
    expect(hueOf(colors.colorFor(region1.id))).not.toBeCloseTo(hueOf(colors.colorFor(region2.id)), 1)
  })

  it('lightness increases with depth: a nominal sub-node glows brighter than its own country entity', () => {
    const country = dataset.domainEntities.find((e) => e.tier === 'country')!
    const sub = dataset.subNodes.find((s) => s.status === 'nominal')!
    expect(lightnessOf(colors.colorFor(sub.id))).toBeGreaterThan(lightnessOf(colors.colorFor(country.id)))
  })

  it('an unresolvable id falls back to a defensive grey rather than throwing', () => {
    expect(() => colors.colorFor('does-not-exist')).not.toThrow()
    expect(colors.colorFor('does-not-exist')).toMatch(/^#/)
  })
})
