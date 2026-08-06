import { describe, expect, it } from 'vitest'
import { clearRegistry } from './graph'
import { sourceReliability } from './folds'
import { observed, sourceId, actorId, asserted } from './traced'
import { matchesStateFilter, meaningBand } from './meaning'

describe('meaningBand', () => {
  it('bands a high-reliability observation as nominal', () => {
    clearRegistry()
    const tv = observed(sourceId('s'), 'f', 1, sourceReliability(0.9))
    expect(meaningBand(tv)).toBe('nominal')
  })

  it('bands a mid-reliability observation as watch', () => {
    clearRegistry()
    const tv = observed(sourceId('s'), 'f', 1, sourceReliability(0.6))
    expect(meaningBand(tv)).toBe('watch')
  })

  it('bands a low-reliability observation as anomaly', () => {
    clearRegistry()
    const tv = observed(sourceId('s'), 'f', 1, sourceReliability(0.3))
    expect(meaningBand(tv)).toBe('anomaly')
  })

  it('bands a human assertion as human regardless of confidence', () => {
    clearRegistry()
    const tv = asserted(actorId('a'), 'override', 1)
    expect(meaningBand(tv)).toBe('human')
  })
})

describe('matchesStateFilter', () => {
  it('"all" matches everything', () => {
    clearRegistry()
    const tv = observed(sourceId('s'), 'f', 1, sourceReliability(0.3))
    expect(matchesStateFilter(tv, 'all')).toBe(true)
  })

  it('matches the meaning band for anomaly/watch/nominal', () => {
    clearRegistry()
    const tv = observed(sourceId('s'), 'f', 1, sourceReliability(0.3))
    expect(matchesStateFilter(tv, 'anomaly')).toBe(true)
    expect(matchesStateFilter(tv, 'watch')).toBe(false)
    expect(matchesStateFilter(tv, 'nominal')).toBe(false)
  })

  it('"below-floor" uses the confidence floor, default or supplied', () => {
    clearRegistry()
    const tv = observed(sourceId('s'), 'f', 1, sourceReliability(0.7))
    expect(matchesStateFilter(tv, 'below-floor')).toBe(true) // below the 0.72 default
    expect(matchesStateFilter(tv, 'below-floor', { confidenceFloor: 0.5 })).toBe(false)
  })

  it('"awaiting-human" defaults to false without caller-supplied business state', () => {
    clearRegistry()
    const tv = observed(sourceId('s'), 'f', 1, sourceReliability(0.9))
    expect(matchesStateFilter(tv, 'awaiting-human')).toBe(false)
    expect(matchesStateFilter(tv, 'awaiting-human', { awaitingHuman: true })).toBe(true)
  })
})
