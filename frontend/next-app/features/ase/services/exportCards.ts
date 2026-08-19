// S9.5b: the two artefacts this whole record exists to produce. Only these
// two — a responder card for a live rescue, and a DVI form for a recovery
// or a coroner. Both are built from the same real TracedValues the
// Inspector renders, never a second, hand-maintained copy of the data.

import type { ServiceDossierRecord, IdentityRecord } from './identityRecord'

function v<T>(tv: { value: T }): T {
  return tv.value
}

/** RESPONDER CARD: serial, photo, lubricant grade, service alerts, contacts, insurance, last known position and its age. Nothing else — this is what fits in a responder's hand mid-rescue. */
export function buildResponderCard(record: IdentityRecord): object {
  return {
    kind: 'RESPONDER CARD',
    serial: v(record.serial),
    name: v(record.who.fullLegalName),
    photographReference: v(record.who.photographReference),
    lubricantGrade: v(record.responder.lubricantGrade),
    knownAllergies: v(record.responder.knownAllergies),
    serviceAlerts: v(record.responder.serviceAlerts),
    emergencyContact: {
      name: v(record.contacts.emergencyContact.name),
      relationship: v(record.contacts.emergencyContact.relationship),
      phone: v(record.contacts.emergencyContact.phone),
    },
    secondContact: {
      name: v(record.contacts.secondContact.name),
      relationship: v(record.contacts.secondContact.relationship),
      phone: v(record.contacts.secondContact.phone),
    },
    insurancePolicy: v(record.responder.insurancePolicy),
    evacuationCover: v(record.responder.evacuationCover),
    evacuationPreference: v(record.responder.evacuationPreference),
    lastKnownPosition: v(record.responder.lastKnownPosition),
    lastKnownPositionAsOf: record.responder.lastKnownPosition.recordedAt,
  }
}

/** DVI FORM: the full service dossier record in Interpol DVI field order — primary identifiers first, each with a named custodian, then secondary identifiers, then who was with them, then photographs and family. */
export function buildDviForm(record: IdentityRecord, serviceDossier: ServiceDossierRecord): object {
  return {
    kind: 'DVI FORM',
    standard: 'Interpol DVI (service dossier)',
    serial: v(record.serial),
    name: v(record.who.fullLegalName),
    dateOfBirth: v(record.who.dateOfBirth),
    sex: v(record.who.sex),
    nationalityOnWorkOrder: v(record.who.nationalityOnWorkOrder),
    primaryIdentifiers: {
      fingerprint: { reference: v(serviceDossier.primary.fingerprint.reference), custodian: v(serviceDossier.primary.fingerprint.custodian) },
      dentalChart: { reference: v(serviceDossier.primary.dentalChart.reference), custodian: v(serviceDossier.primary.dentalChart.custodian) },
      dna: {
        reference: v(serviceDossier.primary.dna.reference),
        custodian: v(serviceDossier.primary.dna.custodian),
        familyReferenceDonor: v(serviceDossier.primary.dna.familyDonor),
      },
    },
    secondaryIdentifiers: {
      physicalDescription: v(serviceDossier.secondary.physicalDescription),
      distinguishingFeatures: v(serviceDossier.secondary.distinguishingFeatures),
      dominantHand: v(serviceDossier.secondary.dominantHand),
      correctiveLenses: v(serviceDossier.secondary.correctiveLenses),
      denturesOrOrthodontics: v(serviceDossier.secondary.dentures),
      clothingAndEquipment: v(serviceDossier.secondary.clothingAndEquipment),
      personalEffects: v(serviceDossier.secondary.personalEffects),
      lastKnownPosition: v(serviceDossier.secondary.lastKnownPosition),
      lastConfirmedSighting: v(serviceDossier.secondary.lastConfirmedSighting),
    },
    whoWasWithThem: {
      ropeTeamSerials: serviceDossier.whoWasWithThem.ropeTeamSerials.map((tv) => v(tv)),
      partyManifest: v(serviceDossier.whoWasWithThem.partyManifest),
      leadGuide: v(serviceDossier.whoWasWithThem.leadGuide),
      lastWithWhenAndWhere: v(serviceDossier.whoWasWithThem.lastWithWhenAndWhere),
      tentAssignment: v(serviceDossier.whoWasWithThem.tentAssignment),
      supportStaff: v(serviceDossier.whoWasWithThem.supportStaff),
    },
    photographsAndFamily: {
      photographReference: v(serviceDossier.photoAndFamily.photographReference),
      familyContact: {
        name: v(serviceDossier.photoAndFamily.familyContact.name),
        relationship: v(serviceDossier.photoAndFamily.familyContact.relationship),
        phone: v(serviceDossier.photoAndFamily.familyContact.phone),
        country: v(serviceDossier.photoAndFamily.familyContact.country),
      },
      consentToRelease: v(serviceDossier.photoAndFamily.consentToRelease),
    },
  }
}

export function downloadJson(filename: string, data: object): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
