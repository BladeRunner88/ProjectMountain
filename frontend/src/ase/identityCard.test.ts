import { describe, expect, it } from 'vitest'
import { buildDataset } from './dataset'
import { confidence, provenance } from './folds'
import { statusFromAnomalyState } from './identityCard'

describe('identityCard (S9.6 rebuild)', () => {
  it('builds exactly one card per climber, every field walkable and foldable', () => {
    const d = buildDataset(1)
    expect(d.identityCards.size).toBe(d.climbers.length)
    for (const card of d.identityCards.values()) {
      const tracedFields = [
        card.routeName,
        card.confidencePct,
        card.identity.age,
        card.identity.dateOfBirth,
        card.identity.sex,
        card.identity.ethnicity,
        card.identity.race,
        card.identity.languages,
        card.physical.height,
        card.physical.weight,
        card.physical.build,
        card.physical.eyeColour,
        card.physical.hairColour,
        card.physical.skinTone,
        card.physical.distinguishingMarks,
        card.medical.bloodGroup,
        card.medical.allergies,
        card.medical.medicalAlerts,
        card.medical.restingHeartRate,
        card.medical.acclimatisation,
        card.medical.baseline,
        card.documents.passportMasked,
        card.documents.countryOfOrigin,
        card.documents.nationalityOnPermit,
        card.documents.permitNumber,
        card.documents.fingerprintRef.reference,
        card.documents.fingerprintRef.custodian,
        card.documents.dentalRef.reference,
        card.documents.dentalRef.custodian,
        card.documents.dnaRef.reference,
        card.documents.dnaRef.custodian,
        card.footer.latitude,
        card.footer.longitude,
        card.footer.resolvedPlace,
        card.footer.altitudeM,
        card.footer.fixAgeSec,
        card.footer.fixSource,
      ]
      for (const tv of tracedFields) {
        expect(() => provenance(tv)).not.toThrow()
        expect(() => confidence(tv)).not.toThrow()
      }
    }
  })

  it('exactly one climber has a real ethnicity conflict, excluded from the S9.5b identity record', () => {
    const d = buildDataset(1)
    const withConflict = Array.from(d.identityCards.values()).filter((c) => c.identity.ethnicityHasConflict)
    expect(withConflict).toHaveLength(1)

    const conflict = d.conflicts.find((cf) => cf.propertyLabel === 'Ethnicity (as recorded)')
    expect(conflict).toBeDefined()
    // The conflict is real, resolvable, and drives the card's own value.
    expect(conflict!.resolved).not.toBeNull()
    expect(withConflict[0].identity.ethnicity.value).toBe(conflict!.resolved!.value)

    // ...but must never leak into the canonical S9.5b IdentityRecord's own
    // conflict list (that file's "never stores race/ethnicity" claim stays
    // true; the override is scoped to this card only).
    const climberId = Array.from(d.identityCards.entries()).find(([, c]) => c.identity.ethnicityHasConflict)![0]
    const record = d.identityRecords.get(climberId)!
    expect(record.derived.conflictingFields.some((cf) => cf.propertyLabel === 'Ethnicity (as recorded)')).toBe(false)
  })

  it('every other climber has a plain declared ethnicity/race with no conflict', () => {
    const d = buildDataset(1)
    const withoutConflict = Array.from(d.identityCards.values()).filter((c) => !c.identity.ethnicityHasConflict)
    expect(withoutConflict).toHaveLength(d.climbers.length - 1)
    for (const card of withoutConflict) {
      expect(card.identity.ethnicityDocument).toBe('Permit registry')
    }
  })

  it('the movement trail has the six canonical stops, exactly one current, and a contiguous reached prefix', () => {
    const d = buildDataset(1)
    for (const card of d.identityCards.values()) {
      expect(card.trail.map((s) => s.camp)).toEqual(['Base Camp', 'Camp I', 'Camp II', 'Camp III', 'Camp IV', 'Summit'])
      const currentStops = card.trail.filter((s) => s.isCurrent)
      expect(currentStops).toHaveLength(1)
      const reachedFlags = card.trail.map((s) => s.reached)
      const firstUnreached = reachedFlags.indexOf(false)
      if (firstUnreached !== -1) {
        expect(reachedFlags.slice(firstUnreached).every((r) => r === false)).toBe(true)
      }
      // Anomaly only ever marks the current stop.
      for (const stop of card.trail) {
        if (stop.anomaly) expect(stop.isCurrent).toBe(true)
      }
    }
  })

  it('rope partner associates are reciprocal', () => {
    const d = buildDataset(1)
    for (const [climberId, card] of d.identityCards) {
      const partner = card.associates.find((a) => a.kind === 'rope_partner')
      if (!partner?.climberId) continue
      const partnerCard = d.identityCards.get(partner.climberId)!
      const backLink = partnerCard.associates.find((a) => a.kind === 'rope_partner')
      expect(backLink?.climberId).toBe(climberId)
    }
  })

  it('statusFromAnomalyState maps every real anomalyState value seen in the dataset to a valid status', () => {
    const d = buildDataset(1)
    for (const record of d.identityRecords.values()) {
      const status = statusFromAnomalyState(record.derived.anomalyState.value)
      expect(['nominal', 'watch', 'anomaly']).toContain(status)
    }
    expect(statusFromAnomalyState('Clean — nothing currently flagged.')).toBe('nominal')
    expect(statusFromAnomalyState('Anomaly — X is out of baseline.')).toBe('anomaly')
    expect(statusFromAnomalyState('Flagged for review.')).toBe('watch')
  })

  it('is deterministic for a given seed', () => {
    const a = buildDataset(1)
    const b = buildDataset(1)
    const idA = Array.from(a.identityCards.values())[0]
    const idB = Array.from(b.identityCards.values())[0]
    expect(idA.identity.ethnicity.value).toBe(idB.identity.ethnicity.value)
    expect(idA.trail.map((s) => s.camp + s.reached)).toEqual(idB.trail.map((s) => s.camp + s.reached))
  })
})
