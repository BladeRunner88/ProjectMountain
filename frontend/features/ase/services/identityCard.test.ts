import { describe, expect, it } from "vitest"
import { buildDataset } from "./dataset"
import { confidence, provenance } from "./folds"
import { statusFromAnomalyState } from "./identityCard"
import { testWorld } from "../testing/world"

describe("identityCard (S9.6 rebuild)", () => {
  it("builds exactly one card per machine, every field walkable and foldable", () => {
    const d = buildDataset(testWorld(), 1)
    expect(d.identityCards.size).toBe(d.machines.length)
    for (const card of d.identityCards.values()) {
      const tracedFields = [
        card.lineName,
        card.confidencePct,
        card.identity.age,
        card.identity.dateOfBirth,
        card.identity.sex,
        card.identity.linePrefix,
        card.identity.manufacturer,
        card.identity.languages,
        card.physical.height,
        card.physical.ratedLoad,
        card.physical.build,
        card.physical.eyeColour,
        card.physical.hairColour,
        card.physical.skinTone,
        card.physical.distinguishingMarks,
        card.service.lubricantGrade,
        card.service.allergies,
        card.service.serviceAlerts,
        card.service.restingHeartRate,
        card.service.runIn,
        card.service.baseline,
        card.documents.passportMasked,
        card.documents.countryOfOrigin,
        card.documents.nationalityOnWorkOrder,
        card.documents.workOrderNumber,
        card.documents.fingerprintRef.reference,
        card.documents.fingerprintRef.custodian,
        card.documents.dentalRef.reference,
        card.documents.dentalRef.custodian,
        card.documents.dnaRef.reference,
        card.documents.dnaRef.custodian,
        card.footer.latitude,
        card.footer.longitude,
        card.footer.resolvedPlace,
        card.footer.loadM,
        card.footer.fixAgeSec,
        card.footer.fixSource,
      ]
      for (const tv of tracedFields) {
        expect(() => provenance(tv)).not.toThrow()
        expect(() => confidence(tv)).not.toThrow()
      }
    }
  })

  it("exactly one machine has a real linePrefix conflict, excluded from the S9.5b identity record", () => {
    const d = buildDataset(testWorld(), 1)
    const withConflict = Array.from(d.identityCards.values()).filter(
      (c) => c.identity.linePrefixHasConflict
    )
    expect(withConflict).toHaveLength(1)

    const conflict = d.conflicts.find(
      (cf) => cf.propertyLabel === "Line (as recorded)"
    )
    expect(conflict).toBeDefined()
    // The conflict is real, resolvable, and drives the card's own value.
    expect(conflict!.resolved).not.toBeNull()
    expect(withConflict[0].identity.linePrefix.value).toBe(
      conflict!.resolved!.value
    )

    // ...but must never leak into the canonical S9.5b IdentityRecord's own
    // conflict list (that file's "never stores manufacturer/linePrefix" claim stays
    // true; the override is scoped to this card only).
    const machineId = Array.from(d.identityCards.entries()).find(
      ([, c]) => c.identity.linePrefixHasConflict
    )![0]
    const record = d.identityRecords.get(machineId)!
    expect(
      record.derived.conflictingFields.some(
        (cf) => cf.propertyLabel === "Line (as recorded)"
      )
    ).toBe(false)
  })

  it("every other machine has a plain declared linePrefix/manufacturer with no conflict", () => {
    const d = buildDataset(testWorld(), 1)
    const withoutConflict = Array.from(d.identityCards.values()).filter(
      (c) => !c.identity.linePrefixHasConflict
    )
    expect(withoutConflict).toHaveLength(d.machines.length - 1)
    for (const card of withoutConflict) {
      expect(card.identity.linePrefixDocument).toBe("CMMS")
    }
  })

  it("the movement trail has the six canonical stops, exactly one current, and a contiguous reached prefix", () => {
    const d = buildDataset(testWorld(), 1)
    for (const card of d.identityCards.values()) {
      expect(card.trail.map((s) => s.station)).toEqual([
        "Base Station",
        "Station I",
        "Station II",
        "Station III",
        "Station IV",
        "Target",
      ])
      const currentStops = card.trail.filter((s) => s.isCurrent)
      expect(currentStops).toHaveLength(1)
      const reachedFlags = card.trail.map((s) => s.reached)
      const firstUnreached = reachedFlags.indexOf(false)
      if (firstUnreached !== -1) {
        expect(
          reachedFlags.slice(firstUnreached).every((r) => r === false)
        ).toBe(true)
      }
      // Anomaly only ever marks the current stop.
      for (const stop of card.trail) {
        if (stop.anomaly) expect(stop.isCurrent).toBe(true)
      }
    }
  })

  it("rope partner associates are reciprocal", () => {
    const d = buildDataset(testWorld(), 1)
    for (const [machineId, card] of d.identityCards) {
      const partner = card.associates.find((a) => a.kind === "rope_partner")
      if (!partner?.machineId) continue
      const partnerCard = d.identityCards.get(partner.machineId)!
      const backLink = partnerCard.associates.find(
        (a) => a.kind === "rope_partner"
      )
      expect(backLink?.machineId).toBe(machineId)
    }
  })

  it("statusFromAnomalyState maps every real anomalyState value seen in the dataset to a valid status", () => {
    const d = buildDataset(testWorld(), 1)
    for (const record of d.identityRecords.values()) {
      const status = statusFromAnomalyState(record.derived.anomalyState.value)
      expect(["nominal", "watch", "anomaly"]).toContain(status)
    }
    expect(statusFromAnomalyState("Clean — nothing currently flagged.")).toBe(
      "nominal"
    )
    expect(statusFromAnomalyState("Anomaly — X is out of baseline.")).toBe(
      "anomaly"
    )
    expect(statusFromAnomalyState("Flagged for review.")).toBe("watch")
  })

  it("is deterministic for a given seed", () => {
    const a = buildDataset(testWorld(), 1)
    const b = buildDataset(testWorld(), 1)
    const idA = Array.from(a.identityCards.values())[0]
    const idB = Array.from(b.identityCards.values())[0]
    expect(idA.identity.linePrefix.value).toBe(idB.identity.linePrefix.value)
    expect(idA.trail.map((s) => s.station + s.reached)).toEqual(
      idB.trail.map((s) => s.station + s.reached)
    )
  })
})
