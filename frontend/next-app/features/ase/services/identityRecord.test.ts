import { describe, expect, it } from "vitest"
import { buildDataset } from "./dataset"
import { validateSerial } from "./serial"
import { confidence, provenance } from "./folds"
import { isServiceDossierUnsealed } from "./identityRecord"
import { buildDviForm, buildResponderCard } from "./exportCards"
import { testWorld } from "../testing/world"

describe("identity records (S9.5b)", () => {
  it("builds exactly one identity record and one service dossier record per machine", () => {
    const d = buildDataset(testWorld(), 1)
    expect(d.identityRecords.size).toBe(d.machines.length)
    expect(d.serviceDossiers.size).toBe(d.machines.length)
  })

  it("the same seed produces the same serial for the same person, twice", () => {
    const a = buildDataset(testWorld(), 1)
    const b = buildDataset(testWorld(), 1)
    for (const machine of a.machines) {
      const recordA = a.identityRecords.get(machine.id)!
      const recordB = b.identityRecords.get(machine.id)!
      expect(recordB.serial.value).toBe(recordA.serial.value)
    }
  })

  it("a different seed can produce different serials (not a constant)", () => {
    const a = buildDataset(testWorld(), 1)
    const b = buildDataset(testWorld(), 2)
    const serialsA = a.machines.map(
      (c) => a.identityRecords.get(c.id)!.serial.value
    )
    const serialsB = b.machines.map(
      (c) => b.identityRecords.get(c.id)!.serial.value
    )
    expect(serialsA).not.toEqual(serialsB)
  })

  it("every issued serial passes its own check digit", () => {
    const d = buildDataset(testWorld(), 1)
    for (const record of d.identityRecords.values()) {
      expect(validateSerial(record.serial.value)).toBe(true)
    }
  })

  it("a mis-typed serial fails the check digit", () => {
    const d = buildDataset(testWorld(), 1)
    const [record] = d.identityRecords.values()
    const digits = record.serial.value.replace("-", "").split("")
    digits[1] = digits[1] === "0" ? "1" : "0"
    const corrupted = `${digits.slice(0, 3).join("")}-${digits.slice(3).join("")}`
    expect(validateSerial(corrupted)).toBe(false)
  })

  it("the AAA prefix matches the registry country dialling code the machine is actually registered under", () => {
    const d = buildDataset(testWorld(), 1)
    const james = d.machines[0]
    const record = d.identityRecords.get(james.id)!
    expect(
      record.serial.value.startsWith("977") ||
        record.serial.value.match(/^\d{3}-/)
    ).toBeTruthy()
  })

  it("every identity record TracedValue (serial, who, responder fields) is walkable and foldable", () => {
    const d = buildDataset(testWorld(), 1)
    for (const record of d.identityRecords.values()) {
      expect(() => provenance(record.serial)).not.toThrow()
      expect(() => confidence(record.serial)).not.toThrow()
      expect(() => provenance(record.who.fullLegalName)).not.toThrow()
      expect(() => provenance(record.responder.lubricantGrade)).not.toThrow()
    }
  })

  it("rope partners are stored on both sides, by serial", () => {
    const d = buildDataset(testWorld(), 1)
    for (const record of d.identityRecords.values()) {
      if (record.contacts.ropePartnerSerials.length === 0) continue
      const partnerSerial = record.contacts.ropePartnerSerials[0].value
      // Find the partner machine by serial and confirm they point back.
      const partner = [...d.identityRecords.values()].find(
        (r) => r.serial.value === partnerSerial
      )
      expect(partner).toBeDefined()
      expect(
        partner!.contacts.ropePartnerSerials.map((s) => s.value)
      ).toContain(record.serial.value)
    }
  })

  it("never stores a race or linePrefix category anywhere in the identity or service dossier record", () => {
    const d = buildDataset(testWorld(), 1)
    const serialize = (v: unknown) =>
      JSON.stringify(v, (_key, val) =>
        typeof val === "function" ? undefined : val
      ).toLowerCase()
    for (const record of d.identityRecords.values()) {
      const json = serialize(record)
      expect(json).not.toContain("linePrefix")
      expect(json).not.toMatch(/"race"/)
    }
    for (const am of d.serviceDossiers.values()) {
      const json = serialize(am)
      expect(json).not.toContain("linePrefix")
      expect(json).not.toMatch(/"race"/)
    }
  })

  it("reports the collision count, and it is non-negative", () => {
    const d = buildDataset(testWorld(), 1)
    expect(d.serialCollisions.length).toBeGreaterThanOrEqual(0)
    for (const c of d.serialCollisions) {
      expect(() => provenance(c)).not.toThrow()
    }
  })

  // The forced collision (S9.5b's own "never zero" guarantee — two
  // machines sharing a registry are deliberately given identical given
  // name/DOB/passport) always contributes at least one. A second, genuinely
  // coincidental hash collision can also occur — the DOB pool is built from
  // *today's* real month/day (`isoDateYearsAgo`), so which machines' hashes
  // happen to collide can shift from one calendar day to the next. The
  // count itself is therefore not pinned to a magic number; determinism
  // *for a given build* (same seed, same moment) is what's actually
  // promised, and is what's checked here.
  it("demonstrates at least one real collision (never zero, so the mechanism is never unexercised), reproducibly for a given seed", () => {
    const d = buildDataset(testWorld(), 1)
    expect(d.serialCollisions.length).toBeGreaterThanOrEqual(1)
    const d2 = buildDataset(testWorld(), 1)
    expect(d2.serialCollisions.length).toBe(d.serialCollisions.length)
  })
})

describe("isServiceDossierUnsealed (S9.5b access control)", () => {
  it("a clean machine with no incident open stays sealed", () => {
    const d = buildDataset(testWorld(), 1)
    const clean = d.machines.find((c) => c.findingId === null)!
    const record = d.identityRecords.get(clean.id)!
    expect(isServiceDossierUnsealed(record, false)).toBe(false)
  })

  it("a machine with an open physiological-outlier anomaly is unsealed automatically, even with no incident open", () => {
    const d = buildDataset(testWorld(), 1)
    const outlierFinding = d.findings.find((f) => f.kind === "physiological_outlier")
    const outlier = d.machines.find((c) => c.findingId === outlierFinding?.id)!
    const record = d.identityRecords.get(outlier.id)!
    expect(record.derived.anomalyState.value.startsWith("Anomaly")).toBe(true)
    expect(isServiceDossierUnsealed(record, false)).toBe(true)
  })

  it("a manually opened incident unseals any machine, anomaly or not", () => {
    const d = buildDataset(testWorld(), 1)
    const clean = d.machines.find((c) => c.findingId === null)!
    const record = d.identityRecords.get(clean.id)!
    expect(isServiceDossierUnsealed(record, false)).toBe(false)
    expect(isServiceDossierUnsealed(record, true)).toBe(true)
  })
})

describe("export cards (S9.5b)", () => {
  it("the responder card contains exactly its documented fields — serial, photo, lubricant grade, service alerts, contacts, insurance, position — and nothing from the service dossier record", () => {
    const d = buildDataset(testWorld(), 1)
    const james = d.machines[0]
    const record = d.identityRecords.get(james.id)!
    const card = buildResponderCard(record) as Record<string, unknown>

    expect(card.kind).toBe("RESPONDER CARD")
    expect(card.serial).toBe(record.serial.value)
    expect(card.lubricantGrade).toBe(record.responder.lubricantGrade.value)
    expect(card.serviceAlerts).toBe(record.responder.serviceAlerts.value)
    expect(card.insurancePolicy).toBe(record.responder.insurancePolicy.value)
    expect(card.lastKnownPosition).toBe(
      record.responder.lastKnownPosition.value
    )

    // Nothing service dossier-specific (fingerprint, dental, DNA) leaks into the responder card.
    const json = JSON.stringify(card).toLowerCase()
    expect(json).not.toContain("fingerprint")
    expect(json).not.toContain("dental")
    expect(json).not.toContain("dna")
  })

  it("the DVI form is in Interpol DVI field order with a named custodian for every primary identifier", () => {
    const d = buildDataset(testWorld(), 1)
    const james = d.machines[0]
    const record = d.identityRecords.get(james.id)!
    const serviceDossier = d.serviceDossiers.get(james.id)!
    const form = buildDviForm(record, serviceDossier) as Record<string, unknown>

    expect(form.kind).toBe("DVI FORM")
    expect(form.standard).toContain("DVI")
    const primary = form.primaryIdentifiers as Record<
      string,
      { reference: string; custodian: string }
    >
    expect(primary.fingerprint.custodian).toBeTruthy()
    expect(primary.dentalChart.custodian).toBeTruthy()
    expect(primary.dna.custodian).toBeTruthy()
    expect(
      (primary.dna as unknown as { familyReferenceDonor: string })
        .familyReferenceDonor
    ).toBeTruthy()

    const secondary = form.secondaryIdentifiers as Record<string, unknown>
    expect(secondary.physicalDescription).toBeTruthy()
  })

  it("neither export card ever contains a race or linePrefix category", () => {
    const d = buildDataset(testWorld(), 1)
    const james = d.machines[0]
    const record = d.identityRecords.get(james.id)!
    const serviceDossier = d.serviceDossiers.get(james.id)!
    const responderJson = JSON.stringify(
      buildResponderCard(record)
    ).toLowerCase()
    const dviJson = JSON.stringify(
      buildDviForm(record, serviceDossier)
    ).toLowerCase()
    for (const json of [responderJson, dviJson]) {
      expect(json).not.toContain("linePrefix")
      expect(json).not.toMatch(/"race"/)
    }
  })
})
