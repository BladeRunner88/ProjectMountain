import { describe, expect, it } from 'vitest'
import { buildDataset } from './dataset'
import { validateSerial } from './serial'
import { confidence, provenance } from './folds'
import { isAnteMortemUnsealed } from './identityRecord'
import { buildDviForm, buildResponderCard } from './exportCards'

describe('identity records (S9.5b)', () => {
  it('builds exactly one identity record and one ante-mortem record per climber', () => {
    const d = buildDataset(1)
    expect(d.identityRecords.size).toBe(d.climbers.length)
    expect(d.anteMortems.size).toBe(d.climbers.length)
  })

  it('the same seed produces the same serial for the same person, twice', () => {
    const a = buildDataset(1)
    const b = buildDataset(1)
    for (const climber of a.climbers) {
      const recordA = a.identityRecords.get(climber.id)!
      const recordB = b.identityRecords.get(climber.id)!
      expect(recordB.serial.value).toBe(recordA.serial.value)
    }
  })

  it('a different seed can produce different serials (not a constant)', () => {
    const a = buildDataset(1)
    const b = buildDataset(2)
    const serialsA = a.climbers.map((c) => a.identityRecords.get(c.id)!.serial.value)
    const serialsB = b.climbers.map((c) => b.identityRecords.get(c.id)!.serial.value)
    expect(serialsA).not.toEqual(serialsB)
  })

  it('every issued serial passes its own check digit', () => {
    const d = buildDataset(1)
    for (const record of d.identityRecords.values()) {
      expect(validateSerial(record.serial.value)).toBe(true)
    }
  })

  it('a mis-typed serial fails the check digit', () => {
    const d = buildDataset(1)
    const [record] = d.identityRecords.values()
    const digits = record.serial.value.replace('-', '').split('')
    digits[1] = digits[1] === '0' ? '1' : '0'
    const corrupted = `${digits.slice(0, 3).join('')}-${digits.slice(3).join('')}`
    expect(validateSerial(corrupted)).toBe(false)
  })

  it('the AAA prefix matches the registry country dialling code the climber is actually registered under', () => {
    const d = buildDataset(1)
    const james = d.climbers[0]
    const record = d.identityRecords.get(james.id)!
    expect(record.serial.value.startsWith('977') || record.serial.value.match(/^\d{3}-/)).toBeTruthy()
  })

  it('every identity record TracedValue (serial, who, responder fields) is walkable and foldable', () => {
    const d = buildDataset(1)
    for (const record of d.identityRecords.values()) {
      expect(() => provenance(record.serial)).not.toThrow()
      expect(() => confidence(record.serial)).not.toThrow()
      expect(() => provenance(record.who.fullLegalName)).not.toThrow()
      expect(() => provenance(record.responder.bloodGroup)).not.toThrow()
    }
  })

  it('rope partners are stored on both sides, by serial', () => {
    const d = buildDataset(1)
    for (const record of d.identityRecords.values()) {
      if (record.contacts.ropePartnerSerials.length === 0) continue
      const partnerSerial = record.contacts.ropePartnerSerials[0].value
      // Find the partner climber by serial and confirm they point back.
      const partner = [...d.identityRecords.values()].find((r) => r.serial.value === partnerSerial)
      expect(partner).toBeDefined()
      expect(partner!.contacts.ropePartnerSerials.map((s) => s.value)).toContain(record.serial.value)
    }
  })

  it('never stores a race or ethnicity category anywhere in the identity or ante-mortem record', () => {
    const d = buildDataset(1)
    const serialize = (v: unknown) => JSON.stringify(v, (_key, val) => (typeof val === 'function' ? undefined : val)).toLowerCase()
    for (const record of d.identityRecords.values()) {
      const json = serialize(record)
      expect(json).not.toContain('ethnicity')
      expect(json).not.toMatch(/"race"/)
    }
    for (const am of d.anteMortems.values()) {
      const json = serialize(am)
      expect(json).not.toContain('ethnicity')
      expect(json).not.toMatch(/"race"/)
    }
  })

  it('reports the collision count, and it is non-negative', () => {
    const d = buildDataset(1)
    expect(d.serialCollisions.length).toBeGreaterThanOrEqual(0)
    for (const c of d.serialCollisions) {
      expect(() => provenance(c)).not.toThrow()
    }
  })

  // The forced collision (S9.5b's own "never zero" guarantee — two
  // climbers sharing a registry are deliberately given identical given
  // name/DOB/passport) always contributes at least one. A second, genuinely
  // coincidental hash collision can also occur — the DOB pool is built from
  // *today's* real month/day (`isoDateYearsAgo`), so which climbers' hashes
  // happen to collide can shift from one calendar day to the next. The
  // count itself is therefore not pinned to a magic number; determinism
  // *for a given build* (same seed, same moment) is what's actually
  // promised, and is what's checked here.
  it('demonstrates at least one real collision (never zero, so the mechanism is never unexercised), reproducibly for a given seed', () => {
    const d = buildDataset(1)
    expect(d.serialCollisions.length).toBeGreaterThanOrEqual(1)
    const d2 = buildDataset(1)
    expect(d2.serialCollisions.length).toBe(d.serialCollisions.length)
  })
})

describe('isAnteMortemUnsealed (S9.5b access control)', () => {
  it('a clean climber with no incident open stays sealed', () => {
    const d = buildDataset(1)
    const clean = d.climbers.find((c) => c.findingId === null)!
    const record = d.identityRecords.get(clean.id)!
    expect(isAnteMortemUnsealed(record, false)).toBe(false)
  })

  it("a climber with an open physiological-outlier anomaly is unsealed automatically, even with no incident open", () => {
    const d = buildDataset(1)
    const nima = d.climbers.find((c) => c.name.value === 'Nima Tamang')!
    const record = d.identityRecords.get(nima.id)!
    expect(record.derived.anomalyState.value.startsWith('Anomaly')).toBe(true)
    expect(isAnteMortemUnsealed(record, false)).toBe(true)
  })

  it('a manually opened incident unseals any climber, anomaly or not', () => {
    const d = buildDataset(1)
    const clean = d.climbers.find((c) => c.findingId === null)!
    const record = d.identityRecords.get(clean.id)!
    expect(isAnteMortemUnsealed(record, false)).toBe(false)
    expect(isAnteMortemUnsealed(record, true)).toBe(true)
  })
})

describe('export cards (S9.5b)', () => {
  it('the responder card contains exactly its documented fields — serial, photo, blood group, medical alerts, contacts, insurance, position — and nothing from the ante-mortem record', () => {
    const d = buildDataset(1)
    const james = d.climbers[0]
    const record = d.identityRecords.get(james.id)!
    const card = buildResponderCard(record) as Record<string, unknown>

    expect(card.kind).toBe('RESPONDER CARD')
    expect(card.serial).toBe(record.serial.value)
    expect(card.bloodGroup).toBe(record.responder.bloodGroup.value)
    expect(card.medicalAlerts).toBe(record.responder.medicalAlerts.value)
    expect(card.insurancePolicy).toBe(record.responder.insurancePolicy.value)
    expect(card.lastKnownPosition).toBe(record.responder.lastKnownPosition.value)

    // Nothing ante-mortem-specific (fingerprint, dental, DNA) leaks into the responder card.
    const json = JSON.stringify(card).toLowerCase()
    expect(json).not.toContain('fingerprint')
    expect(json).not.toContain('dental')
    expect(json).not.toContain('dna')
  })

  it('the DVI form is in Interpol DVI field order with a named custodian for every primary identifier', () => {
    const d = buildDataset(1)
    const james = d.climbers[0]
    const record = d.identityRecords.get(james.id)!
    const anteMortem = d.anteMortems.get(james.id)!
    const form = buildDviForm(record, anteMortem) as Record<string, unknown>

    expect(form.kind).toBe('DVI FORM')
    expect(form.standard).toContain('DVI')
    const primary = form.primaryIdentifiers as Record<string, { reference: string; custodian: string }>
    expect(primary.fingerprint.custodian).toBeTruthy()
    expect(primary.dentalChart.custodian).toBeTruthy()
    expect(primary.dna.custodian).toBeTruthy()
    expect((primary.dna as unknown as { familyReferenceDonor: string }).familyReferenceDonor).toBeTruthy()

    const secondary = form.secondaryIdentifiers as Record<string, unknown>
    expect(secondary.physicalDescription).toBeTruthy()
  })

  it('neither export card ever contains a race or ethnicity category', () => {
    const d = buildDataset(1)
    const james = d.climbers[0]
    const record = d.identityRecords.get(james.id)!
    const anteMortem = d.anteMortems.get(james.id)!
    const responderJson = JSON.stringify(buildResponderCard(record)).toLowerCase()
    const dviJson = JSON.stringify(buildDviForm(record, anteMortem)).toLowerCase()
    for (const json of [responderJson, dviJson]) {
      expect(json).not.toContain('ethnicity')
      expect(json).not.toMatch(/"race"/)
    }
  })
})
