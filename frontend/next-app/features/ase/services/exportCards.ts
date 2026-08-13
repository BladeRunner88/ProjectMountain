// S9.5b: the two artefacts this whole record exists to produce. Only these
// two — a responder card for a live rescue, and a DVI form for a recovery
// or a coroner. Both are built from the same real TracedValues the
// Inspector renders, never a second, hand-maintained copy of the data.

import type { AnteMortemRecord, IdentityRecord } from './identityRecord'

function v<T>(tv: { value: T }): T {
  return tv.value
}

/** RESPONDER CARD: serial, photo, blood group, medical alerts, contacts, insurance, last known position and its age. Nothing else — this is what fits in a responder's hand mid-rescue. */
export function buildResponderCard(record: IdentityRecord): object {
  return {
    kind: 'RESPONDER CARD',
    serial: v(record.serial),
    name: v(record.who.fullLegalName),
    photographReference: v(record.who.photographReference),
    bloodGroup: v(record.responder.bloodGroup),
    knownAllergies: v(record.responder.knownAllergies),
    medicalAlerts: v(record.responder.medicalAlerts),
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

/** DVI FORM: the full ante-mortem record in Interpol DVI field order — primary identifiers first, each with a named custodian, then secondary identifiers, then who was with them, then photographs and family. */
export function buildDviForm(record: IdentityRecord, anteMortem: AnteMortemRecord): object {
  return {
    kind: 'DVI FORM',
    standard: 'Interpol DVI (ante-mortem)',
    serial: v(record.serial),
    name: v(record.who.fullLegalName),
    dateOfBirth: v(record.who.dateOfBirth),
    sex: v(record.who.sex),
    nationalityOnPermit: v(record.who.nationalityOnPermit),
    primaryIdentifiers: {
      fingerprint: { reference: v(anteMortem.primary.fingerprint.reference), custodian: v(anteMortem.primary.fingerprint.custodian) },
      dentalChart: { reference: v(anteMortem.primary.dentalChart.reference), custodian: v(anteMortem.primary.dentalChart.custodian) },
      dna: {
        reference: v(anteMortem.primary.dna.reference),
        custodian: v(anteMortem.primary.dna.custodian),
        familyReferenceDonor: v(anteMortem.primary.dna.familyDonor),
      },
    },
    secondaryIdentifiers: {
      physicalDescription: v(anteMortem.secondary.physicalDescription),
      distinguishingFeatures: v(anteMortem.secondary.distinguishingFeatures),
      dominantHand: v(anteMortem.secondary.dominantHand),
      correctiveLenses: v(anteMortem.secondary.correctiveLenses),
      denturesOrOrthodontics: v(anteMortem.secondary.dentures),
      clothingAndEquipment: v(anteMortem.secondary.clothingAndEquipment),
      personalEffects: v(anteMortem.secondary.personalEffects),
      lastKnownPosition: v(anteMortem.secondary.lastKnownPosition),
      lastConfirmedSighting: v(anteMortem.secondary.lastConfirmedSighting),
    },
    whoWasWithThem: {
      ropeTeamSerials: anteMortem.whoWasWithThem.ropeTeamSerials.map((tv) => v(tv)),
      partyManifest: v(anteMortem.whoWasWithThem.partyManifest),
      leadGuide: v(anteMortem.whoWasWithThem.leadGuide),
      lastWithWhenAndWhere: v(anteMortem.whoWasWithThem.lastWithWhenAndWhere),
      tentAssignment: v(anteMortem.whoWasWithThem.tentAssignment),
      supportStaff: v(anteMortem.whoWasWithThem.supportStaff),
    },
    photographsAndFamily: {
      photographReference: v(anteMortem.photoAndFamily.photographReference),
      familyContact: {
        name: v(anteMortem.photoAndFamily.familyContact.name),
        relationship: v(anteMortem.photoAndFamily.familyContact.relationship),
        phone: v(anteMortem.photoAndFamily.familyContact.phone),
        country: v(anteMortem.photoAndFamily.familyContact.country),
      },
      consentToRelease: v(anteMortem.photoAndFamily.consentToRelease),
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
