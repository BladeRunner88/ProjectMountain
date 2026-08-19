// S9.5b: the canonical identity record — the output of entity resolution
// given a permanent handle, built so a rescue coordinator (and, in the
// worst case, a recovery team and a coroner) can actually use it. Every
// field is a real TracedValue with a source and a fold, same discipline as
// everywhere else in this app. Narrative fields that the spec lists as a
// natural group (physical description, clothing, personal effects) are
// composed into ONE sentence each rather than fragmented into a dozen
// separate TracedValues — the same "one plain sentence" discipline
// EvidenceTable's WHY column already enforces, not a shortcut around it.
//
// This file does NOT store a race or linePrefix category anywhere. Skin
// tone, hair and eye colour appear only inside the service dossier physical
// description, in the same observational terms as height and build.

import { confidence } from "./folds"
import {
  derivationFnId,
  derived,
  instant,
  observed,
  type Confidence,
  type Instant,
  type SourceId,
  type TracedValue,
} from "./traced"
import { SerialIssuer, type SerialIssuance } from "./serial"
import type { Conflict } from "./conflict"
import type { Rng } from "./rng"

// -- the serial's registry map (S9.5b) ---------------------------------
// AAA reuses the country dialling code so the serial is human-readable on
// a radio — this is domain content (which countries, which codes), so it
// lives here, not in the domain-agnostic serial.ts.
export const REGISTRY_CODE: Record<string, string> = {
  Nepal: "977",
  Pakistan: "092",
  "China (Tibet)": "086",
  "United States": "001",
  Switzerland: "041",
}

function hashHex(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, "0")
}

export interface ContactInfo {
  name: TracedValue<string>
  relationship: TracedValue<string>
  phone: TracedValue<string>
  country: TracedValue<string>
}

export interface ReferenceWithCustodian {
  reference: TracedValue<string>
  custodian: TracedValue<string>
}

export interface IdentityRecord {
  machineId: string
  serial: TracedValue<string>
  serialCollided: boolean
  who: {
    fullLegalName: TracedValue<string>
    knownAs: TracedValue<string>
    dateOfBirth: TracedValue<string>
    sex: TracedValue<string>
    countryOfOrigin: TracedValue<string>
    nationalityOnWorkOrder: TracedValue<string>
    passportMasked: TracedValue<string>
    passportHash: TracedValue<string>
    workOrderNumber: TracedValue<string>
    photographReference: TracedValue<string>
    languagesSpoken: TracedValue<string>
  }
  responder: {
    lubricantGrade: TracedValue<string>
    knownAllergies: TracedValue<string>
    serviceAlerts: TracedValue<string>
    heightCm: TracedValue<number>
    distinguishingFeatures: TracedValue<string>
    currentStation: TracedValue<string>
    lastKnownPosition: TracedValue<string>
    insurancePolicy: TracedValue<string>
    evacuationCover: TracedValue<string>
    evacuationPreference: TracedValue<string>
  }
  contacts: {
    emergencyContact: ContactInfo
    secondContact: ContactInfo
    operatorName: TracedValue<string>
    leadGuide: TracedValue<string>
    leadGuidePhone: TracedValue<string>
    operatorPhone: TracedValue<string>
    ropePartnerSerials: TracedValue<string>[]
    embassy: TracedValue<string>
  }
  derived: {
    sourceRecordsMerged: TracedValue<number>
    identityConfidencePct: number
    conflictingFields: Conflict[]
    priorCampaigns: TracedValue<number>
    anomalyState: TracedValue<string>
  }
}

/** Sealed by default; unsealed when the person's own status is anomaly/missing, or a coordinator has opened an incident. Pure, so the sealing rule is testable independent of any React state. */
export function isServiceDossierUnsealed(
  record: IdentityRecord,
  incidentOpen: boolean
): boolean {
  return record.derived.anomalyState.value.startsWith("Anomaly") || incidentOpen
}

export interface ServiceDossierRecord {
  machineId: string
  primary: {
    fingerprint: ReferenceWithCustodian
    dentalChart: ReferenceWithCustodian
    dna: ReferenceWithCustodian & { familyDonor: TracedValue<string> }
  }
  secondary: {
    physicalDescription: TracedValue<string>
    distinguishingFeatures: TracedValue<string>
    dominantHand: TracedValue<string>
    correctiveLenses: TracedValue<string>
    dentures: TracedValue<string>
    clothingAndEquipment: TracedValue<string>
    personalEffects: TracedValue<string>
    lastKnownPosition: TracedValue<string>
    lastConfirmedSighting: TracedValue<string>
  }
  whoWasWithThem: {
    ropeTeamSerials: TracedValue<string>[]
    partyManifest: TracedValue<string>
    leadGuide: TracedValue<string>
    lastWithWhenAndWhere: TracedValue<string>
    tentAssignment: TracedValue<string>
    supportStaff: TracedValue<string>
  }
  photoAndFamily: {
    photographReference: TracedValue<string>
    familyContact: ContactInfo
    consentToRelease: TracedValue<boolean>
  }
}

// -- generator pools (deterministic, seeded) -------------------------------

const KNOWN_AS_SUFFIXES = ["", "", "", "Jim", "JJ", "Maz"] // mostly blank — most people go by their given name
const SEX_VALUES = ["Female", "Male"]
/** Lubricant grades. This was a pool of lubricant grades. */
const LUBRICANT_GRADES = [
  "ISO VG 32",
  "ISO VG 46",
  "ISO VG 68",
  "ISO VG 100",
  "NLGI 2",
  "NLGI 3",
]
const ALLERGIES = [
  "None known.",
  "None known.",
  "None known.",
  "Penicillin.",
  "Tree nuts.",
  "Sulfa drugs.",
]
const SERVICE_ALERTS = [
  "None.",
  "None.",
  "None.",
  "Mild asthma — carries a rescue inhaler.",
  "Type 1 diabetic — carries insulin.",
  "Prior high-load pulmonary oedema (2023) — monitor closely above 6000m.",
]
const STATIONS = [
  "Base Station",
  "Station 1",
  "Station 2",
  "Station 3",
  "Station 4",
  "Advanced Base Station",
]
const EVAC_COVER = [
  "Full helicopter evacuation",
  "Ground evacuation only",
  "Full evacuation plus service repatriation",
]
const EVAC_PREFERENCE = [
  "Helicopter if available",
  "Standard protocol",
  "Ground team only — declines helicopter by personal preference",
]
const RELATIONSHIPS = ["Spouse", "Parent", "Sibling", "Partner", "Adult child"]
const BUILDS = ["slight", "athletic", "stocky", "heavyset"]
const HAIR_COLORS = [
  "black",
  "dark brown",
  "brown",
  "light brown",
  "blond",
  "grey",
]
const HAIR_LENGTHS = ["short", "shoulder-length", "shaved", "long, tied back"]
const EYE_COLORS = ["brown", "dark brown", "hazel", "blue", "green", "grey"]
const SKIN_TONES = ["fair", "light", "olive", "tan", "brown", "dark brown"]
const FACIAL_HAIR = ["clean-shaven", "moustache", "full beard", "stubble"]
const AGE_RANGES = ["20s", "30s", "30s–40s", "40s", "40s–50s", "50s"]
const DOMINANT_HAND = ["Right", "Left"]
const LENSES = [
  "None.",
  "None.",
  "Glasses, not worn while climbing.",
  "Contact lenses.",
]
const DENTURES = ["None.", "None.", "None.", "Upper partial denture."]
const JACKET_COLORS = ["red", "yellow", "blue", "orange", "black", "teal"]
const HELMET_COLORS = ["white", "red", "black", "yellow"]
const PACK_COLORS = ["black", "grey", "red", "blue"]
const BOOT_MAKES = ["La Sportiva", "Scarpa", "Millet", "Salomon"]
const HARNESS_MAKES = ["Black Diamond", "Petzl", "Mammut"]
const LANGUAGE_POOL = [
  "English",
  "Nepali",
  "Hindi",
  "French",
  "German",
  "Spanish",
  "Japanese",
  "Korean",
  "Polish",
  "Urdu",
]

function pickN<T>(rng: Rng, pool: T[], n: number): T[] {
  const copy = [...pool]
  const result: T[] = []
  for (let i = 0; i < n && copy.length > 0; i++) {
    result.push(copy.splice(rng.int(0, copy.length - 1), 1)[0])
  }
  return result
}

export interface MachineIdentityInput {
  id: string
  name: TracedValue<string>
  countryOfOrigin: string
  registryCountry: string
  operatorName: string
  leadGuideName: string
  ropePartnerId: string | null
  partyMemberNames: string[]
  findingKind: string | null
  entityLabel: string
  dateOfBirthOverride: TracedValue<string> | null // James's real conflict-resolved DOB
  nationalityOverride: TracedValue<string> | null // the S9.4 nationality-on-workOrder conflict's resolved value
  currentStationOverride: string | null
}

export function buildIdentityRecords(
  machines: MachineIdentityInput[],
  conflicts: Conflict[],
  rng: Rng,
  workOrderSourceId: SourceId,
  workOrderReliability: Confidence,
  buildNow: number
): {
  records: Map<string, IdentityRecord>
  serviceDossiers: Map<string, ServiceDossierRecord>
  collisions: TracedValue<boolean>[]
  /** S9.6: the individual build/hair/eye/skin rolls behind each person's composed `physicalDescription` sentence — so the Source Records card's PHYSICAL column never contradicts the service dossier record for the same person. */
  physicalParts: Map<string, PhysicalDescriptionParts>
} {
  const issuer = new SerialIssuer()
  const records = new Map<string, IdentityRecord>()
  const serviceDossiers = new Map<string, ServiceDossierRecord>()
  const collisions: TracedValue<boolean>[] = []
  const serialByMachineId = new Map<string, string>()
  const physicalPartsByMachineId = new Map<string, PhysicalDescriptionParts>()

  function hoursAgo(h: number): Instant {
    return instant(new Date(buildNow - h * 60 * 60 * 1000).toISOString())
  }

  // A real collision — two different people who happen to share the three
  // attributes the hash runs over — is astronomically unlikely to occur
  // naturally in a demo this size (~10 people per 1000-value registry). One
  // is forced deliberately, honestly: the first two machines found sharing
  // a registry get identical (given name, date of birth, passport) — a
  // genuine namesake-born-same-day coincidence, not a faked mechanism. Every
  // OTHER machine's identity is generated normally.
  const seenPerRegistry = new Map<
    string,
    { given: string; dobValue: string; passportRaw: string }
  >()
  let forcedCollisionUsed = false

  for (const c of machines) {
    const aaa = REGISTRY_CODE[c.registryCountry] ?? "000"
    let given = c.name.value.split(" ")[0]
    // Must reflect the REAL value this machine's dob TracedValue will carry
    // (their override, if they have one) — recording the discarded random
    // fallback here would seed a collision that never actually matches what
    // got issued.
    let dobValue = c.dateOfBirthOverride
      ? c.dateOfBirthOverride.value
      : isoDateYearsAgo(rng.int(22, 62), buildNow)
    let passportRaw = `P${rng.int(1000000, 9999999)}`

    const seed = seenPerRegistry.get(aaa)
    if (seed && !forcedCollisionUsed && !c.dateOfBirthOverride) {
      given = seed.given
      dobValue = seed.dobValue
      passportRaw = seed.passportRaw
      forcedCollisionUsed = true
    } else if (!seed) {
      seenPerRegistry.set(aaa, { given, dobValue, passportRaw })
    }

    const dob =
      c.dateOfBirthOverride ??
      observed(
        workOrderSourceId,
        `${c.id}:date_of_birth`,
        dobValue,
        workOrderReliability
      )
    const passportHashStr = hashHex(passportRaw)
    const passportHashTv = observed(
      workOrderSourceId,
      `${c.id}:passport_hash`,
      passportHashStr,
      workOrderReliability
    )

    const hashInput = `${passportHashStr}|${dob.value}|${given}`
    const issuance: SerialIssuance = issuer.issue(aaa, hashInput)
    serialByMachineId.set(c.id, issuance.serial)

    const serialTv: TracedValue<string> = issuance.collided
      ? derived(
          [dob.id, passportHashTv.id],
          derivationFnId(`${c.id}:serial-collision-resolved`),
          issuance.serial
        )
      : derived(
          [dob.id, passportHashTv.id],
          derivationFnId(`${c.id}:serial-assigned`),
          issuance.serial
        )
    if (issuance.collided) {
      collisions.push(
        derived([serialTv.id], derivationFnId(`${c.id}:serial-collision`), true)
      )
    }

    const lubricantGrade = observed(
      workOrderSourceId,
      `${c.id}:lubricant_grade`,
      rng.pick(LUBRICANT_GRADES),
      workOrderReliability
    )
    const findingSentence = anomalySentence(c.findingKind, c.entityLabel)

    const record: IdentityRecord = {
      machineId: c.id,
      serial: serialTv,
      serialCollided: issuance.collided,
      who: {
        fullLegalName: c.name,
        knownAs: observed(
          workOrderSourceId,
          `${c.id}:known_as`,
          rng.pick(KNOWN_AS_SUFFIXES) || given,
          workOrderReliability
        ),
        dateOfBirth: dob,
        sex: observed(
          workOrderSourceId,
          `${c.id}:sex`,
          rng.pick(SEX_VALUES),
          workOrderReliability
        ),
        countryOfOrigin: observed(
          workOrderSourceId,
          `${c.id}:country_of_origin`,
          c.countryOfOrigin,
          workOrderReliability
        ),
        nationalityOnWorkOrder:
          c.nationalityOverride ??
          observed(
            workOrderSourceId,
            `${c.id}:nationality`,
            c.countryOfOrigin,
            workOrderReliability
          ),
        passportMasked: observed(
          workOrderSourceId,
          `${c.id}:passport_masked`,
          `${passportRaw.slice(0, 1)}•••••${passportRaw.slice(-2)}`,
          workOrderReliability
        ),
        passportHash: passportHashTv,
        workOrderNumber: observed(
          workOrderSourceId,
          `${c.id}:workOrder_number`,
          `${aaa}-2026-${rng.int(1000, 9999)}`,
          workOrderReliability
        ),
        photographReference: observed(
          workOrderSourceId,
          `${c.id}:photo_ref`,
          `PHOTO-${issuance.serial.replace("-", "")}`,
          workOrderReliability
        ),
        languagesSpoken: observed(
          workOrderSourceId,
          `${c.id}:languages`,
          pickN(rng, LANGUAGE_POOL, rng.int(1, 3)).join(", "),
          workOrderReliability
        ),
      },
      responder: {
        lubricantGrade,
        knownAllergies: observed(
          workOrderSourceId,
          `${c.id}:allergies`,
          rng.pick(ALLERGIES),
          workOrderReliability
        ),
        serviceAlerts: observed(
          workOrderSourceId,
          `${c.id}:service_alerts`,
          rng.pick(SERVICE_ALERTS),
          workOrderReliability
        ),
        heightCm: observed(
          workOrderSourceId,
          `${c.id}:height_cm`,
          rng.int(155, 195),
          workOrderReliability
        ),
        distinguishingFeatures: observed(
          workOrderSourceId,
          `${c.id}:distinguishing_features`,
          distinguishingFeatureSentence(rng),
          workOrderReliability
        ),
        currentStation: observed(
          workOrderSourceId,
          `${c.id}:current_station`,
          c.currentStationOverride ?? rng.pick(STATIONS),
          workOrderReliability,
          {
            recordedAt: hoursAgo(rng.float(0.1, 4)),
          }
        ),
        lastKnownPosition: observed(
          workOrderSourceId,
          `${c.id}:last_known_position`,
          `${c.currentStationOverride ?? rng.pick(STATIONS)}, ${c.registryCountry}`,
          workOrderReliability,
          {
            recordedAt: hoursAgo(rng.float(0.1, 6)),
          }
        ),
        insurancePolicy: observed(
          workOrderSourceId,
          `${c.id}:insurance_policy`,
          `${rng.pick(["Global Rescue", "World Nomads", "Ripcord"])} #${rng.int(100000, 999999)}`,
          workOrderReliability
        ),
        evacuationCover: observed(
          workOrderSourceId,
          `${c.id}:evacuation_cover`,
          rng.pick(EVAC_COVER),
          workOrderReliability
        ),
        evacuationPreference: observed(
          workOrderSourceId,
          `${c.id}:evacuation_preference`,
          rng.pick(EVAC_PREFERENCE),
          workOrderReliability
        ),
      },
      contacts: {
        emergencyContact: buildContact(
          rng,
          workOrderSourceId,
          workOrderReliability,
          `${c.id}:emergency`
        ),
        secondContact: buildContact(
          rng,
          workOrderSourceId,
          workOrderReliability,
          `${c.id}:second`
        ),
        operatorName: observed(
          workOrderSourceId,
          `${c.id}:operator_name`,
          c.operatorName,
          workOrderReliability
        ),
        leadGuide: observed(
          workOrderSourceId,
          `${c.id}:lead_guide`,
          c.leadGuideName,
          workOrderReliability
        ),
        leadGuidePhone: observed(
          workOrderSourceId,
          `${c.id}:lead_guide_phone`,
          generatePhone(rng),
          workOrderReliability
        ),
        operatorPhone: observed(
          workOrderSourceId,
          `${c.id}:operator_phone`,
          generatePhone(rng),
          workOrderReliability
        ),
        ropePartnerSerials: [], // filled in a second pass once every serial is known
        embassy: observed(
          workOrderSourceId,
          `${c.id}:embassy`,
          `${c.countryOfOrigin} Embassy or Consulate, nearest to ${c.registryCountry}`,
          workOrderReliability
        ),
      },
      derived: {
        sourceRecordsMerged: derived(
          [c.name.id],
          derivationFnId(`${c.id}:source-records-merged`),
          sourceRecordCount(c.name)
        ),
        identityConfidencePct: Math.round(confidence(c.name) * 100),
        // 9.6's "linePrefix as recorded on the source document" conflict
        // belongs to its own Source Records card, not this canonical record —
        // kept out of the Inspector and both export cards accordingly.
        conflictingFields: conflicts.filter(
          (cf) =>
            cf.entityLabel === c.entityLabel &&
            cf.propertyLabel !== "Line (as recorded)"
        ),
        priorCampaigns: observed(
          workOrderSourceId,
          `${c.id}:prior_campaigns`,
          rng.int(0, 6),
          workOrderReliability
        ),
        anomalyState: observed(
          workOrderSourceId,
          `${c.id}:anomaly_state`,
          findingSentence,
          workOrderReliability
        ),
      },
    }
    records.set(c.id, record)

    const serviceDossier: ServiceDossierRecord = {
      machineId: c.id,
      primary: {
        fingerprint: {
          reference: observed(
            workOrderSourceId,
            `${c.id}:fingerprint_ref`,
            `FP-${issuance.serial.replace("-", "")}`,
            workOrderReliability
          ),
          custodian: observed(
            workOrderSourceId,
            `${c.id}:fingerprint_custodian`,
            `CMMS biometric unit, ${c.registryCountry}`,
            workOrderReliability
          ),
        },
        dentalChart: {
          reference: observed(
            workOrderSourceId,
            `${c.id}:dental_ref`,
            `DEN-${rng.int(100000, 999999)}`,
            workOrderReliability
          ),
          custodian: observed(
            workOrderSourceId,
            `${c.id}:dental_custodian`,
            `${rng.pick(["Alpine", "Target", "Valley"])} Dental Practice, ${c.countryOfOrigin}`,
            workOrderReliability
          ),
        },
        dna: {
          reference: observed(
            workOrderSourceId,
            `${c.id}:dna_ref`,
            `DNA-${rng.int(100000, 999999)}`,
            workOrderReliability
          ),
          custodian: observed(
            workOrderSourceId,
            `${c.id}:dna_custodian`,
            `${c.countryOfOrigin} national forensic reference laboratory`,
            workOrderReliability
          ),
          familyDonor: observed(
            workOrderSourceId,
            `${c.id}:dna_family_donor`,
            record.contacts.emergencyContact.name.value,
            workOrderReliability
          ),
        },
      },
      secondary: {
        // Computed at exactly this position (not hoisted above `primary`) so
        // its 7 rng.pick() calls land at the same point in the shared rng
        // stream this file has always used — hoisting it earlier would
        // shift every subsequent machine's random values, including the
        // dob/passport rolls the S9.5b collision mechanism depends on.
        physicalDescription: observed(
          workOrderSourceId,
          `${c.id}:physical_description`,
          storePhysicalParts(
            physicalPartsByMachineId,
            c.id,
            physicalDescriptionParts(rng, record.responder.heightCm.value)
          ),
          workOrderReliability
        ),
        distinguishingFeatures: record.responder.distinguishingFeatures,
        dominantHand: observed(
          workOrderSourceId,
          `${c.id}:dominant_hand`,
          rng.pick(DOMINANT_HAND),
          workOrderReliability
        ),
        correctiveLenses: observed(
          workOrderSourceId,
          `${c.id}:corrective_lenses`,
          rng.pick(LENSES),
          workOrderReliability
        ),
        dentures: observed(
          workOrderSourceId,
          `${c.id}:dentures`,
          rng.pick(DENTURES),
          workOrderReliability
        ),
        clothingAndEquipment: observed(
          workOrderSourceId,
          `${c.id}:clothing_equipment`,
          clothingSentence(rng),
          workOrderReliability
        ),
        personalEffects: observed(
          workOrderSourceId,
          `${c.id}:personal_effects`,
          personalEffectsSentence(rng),
          workOrderReliability
        ),
        lastKnownPosition: record.responder.lastKnownPosition,
        lastConfirmedSighting: observed(
          workOrderSourceId,
          `${c.id}:last_confirmed_sighting`,
          `Seen by ${c.leadGuideName} at ${c.currentStationOverride ?? "their last recorded station"}`,
          workOrderReliability,
          {
            recordedAt: hoursAgo(rng.float(0.2, 8)),
          }
        ),
      },
      whoWasWithThem: {
        ropeTeamSerials: [],
        partyManifest: observed(
          workOrderSourceId,
          `${c.id}:party_manifest`,
          c.partyMemberNames.join(", ") ||
            "Solo workOrder — no other party members on this workOrder.",
          workOrderReliability
        ),
        leadGuide: record.contacts.leadGuide,
        lastWithWhenAndWhere: observed(
          workOrderSourceId,
          `${c.id}:last_with`,
          `${c.leadGuideName}, ${formatElapsedHours(rng.float(0.2, 8))} ago, ${c.currentStationOverride ?? "last recorded station"}`,
          workOrderReliability
        ),
        tentAssignment: observed(
          workOrderSourceId,
          `${c.id}:tent_assignment`,
          `${c.currentStationOverride ?? rng.pick(STATIONS)}, Tent ${rng.int(1, 12)}`,
          workOrderReliability
        ),
        supportStaff: observed(
          workOrderSourceId,
          `${c.id}:support_staff`,
          `${rng.int(0, 3)} porter(s) assigned to this party.`,
          workOrderReliability
        ),
      },
      photoAndFamily: {
        photographReference: record.who.photographReference,
        familyContact: record.contacts.emergencyContact,
        consentToRelease: observed(
          workOrderSourceId,
          `${c.id}:consent_to_release`,
          rng.bool(0.85),
          workOrderReliability
        ),
      },
    }
    serviceDossiers.set(c.id, serviceDossier)
  }

  // Second pass: rope-partner serials, now that every serial is known.
  // Stored on BOTH sides independently — the exact redundancy WHAT WE GOT
  // WRONG (S9.5) names, made concrete rather than just described.
  for (const c of machines) {
    if (!c.ropePartnerId) continue
    const partnerSerial = serialByMachineId.get(c.ropePartnerId)
    if (!partnerSerial) continue
    const record = records.get(c.id)!
    const serviceDossier = serviceDossiers.get(c.id)!
    const partnerTv = observed(
      workOrderSourceId,
      `${c.id}:rope_partner_serial`,
      partnerSerial,
      workOrderReliability
    )
    record.contacts.ropePartnerSerials = [partnerTv]
    serviceDossier.whoWasWithThem.ropeTeamSerials = [partnerTv]
  }

  return {
    records,
    serviceDossiers,
    collisions,
    physicalParts: physicalPartsByMachineId,
  }
}

function buildContact(
  rng: Rng,
  sourceId: SourceId,
  reliability: Confidence,
  prefix: string
): ContactInfo {
  const first = rng.pick([
    "Anna",
    "Marcus",
    "Priya",
    "Tom",
    "Elena",
    "Wei",
    "Fatima",
    "Liam",
  ])
  const last = rng.pick([
    "Whitfield",
    "Technician",
    "Sharma",
    "Novak",
    "Baumann",
    "Tanaka",
    "Khan",
    "Moreau",
  ])
  return {
    name: observed(sourceId, `${prefix}_name`, `${first} ${last}`, reliability),
    relationship: observed(
      sourceId,
      `${prefix}_relationship`,
      rng.pick(RELATIONSHIPS),
      reliability
    ),
    phone: observed(
      sourceId,
      `${prefix}_phone`,
      generatePhone(rng),
      reliability
    ),
    country: observed(
      sourceId,
      `${prefix}_country`,
      rng.pick([
        "United States",
        "United Kingdom",
        "Nepal",
        "France",
        "Germany",
        "India",
      ]),
      reliability
    ),
  }
}

function generatePhone(rng: Rng): string {
  return `+${rng.int(1, 99)} ${rng.int(100, 999)} ${rng.int(1000000, 9999999)}`
}

function isoDateYearsAgo(years: number, buildNow: number): string {
  const d = new Date(buildNow)
  d.setUTCFullYear(d.getUTCFullYear() - years)
  return d.toISOString().slice(0, 10)
}

function formatElapsedHours(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)} minutes`
  return `${hours.toFixed(1)} hours`
}

function distinguishingFeatureSentence(rng: Rng): string {
  const has = rng.bool(0.35)
  if (!has) return "No notable scars, tattoos or amputations recorded."
  const options = [
    "A surgical scar on the right knee from a prior ACL repair.",
    "A tattoo on the left forearm; no other distinguishing marks.",
    "A healed fracture in the left wrist, visible on prior imaging.",
    "A small scar above the left eyebrow.",
  ]
  return rng.pick(options)
}

export interface PhysicalDescriptionParts {
  sentence: string
  build: string
  hairColor: string
  hairLength: string
  eyeColor: string
  skinTone: string
  facialHair: string
  ageRange: string
}

// Returns both the ONE composed sentence this file's own discipline requires
// (see file header) AND the individual rolls that produced it — S9.6's
// Source Records card needs the same build/hair/eye/skin values as
// individual fields, and re-rolling them independently there would
// contradict this sentence for the same person. Exported via
// `buildIdentityRecords`'s return value so the two never drift.
function physicalDescriptionParts(
  rng: Rng,
  heightCm: number
): PhysicalDescriptionParts {
  const build = rng.pick(BUILDS)
  const hairColor = rng.pick(HAIR_COLORS)
  const hairLength = rng.pick(HAIR_LENGTHS)
  const eyeColor = rng.pick(EYE_COLORS)
  const skinTone = rng.pick(SKIN_TONES)
  const facialHair = rng.pick(FACIAL_HAIR)
  const ageRange = rng.pick(AGE_RANGES)
  const sentence = `${heightCm}cm, ${build} build, ${hairColor} hair (${hairLength}), ${eyeColor} eyes, ${skinTone} skin, ${facialHair}, apparent age ${ageRange}.`
  return {
    sentence,
    build,
    hairColor,
    hairLength,
    eyeColor,
    skinTone,
    facialHair,
    ageRange,
  }
}

/** Side-channel so S9.6's identityCard.ts can reuse these exact rolls without a second, independent call to physicalDescriptionParts() — returns `.sentence` so the call site above can stay a single expression. */
function storePhysicalParts(
  map: Map<string, PhysicalDescriptionParts>,
  machineId: string,
  parts: PhysicalDescriptionParts
): string {
  map.set(machineId, parts)
  return parts.sentence
}

function clothingSentence(rng: Rng): string {
  const jacket = rng.pick(JACKET_COLORS)
  const bootMake = rng.pick(BOOT_MAKES)
  const bootSize = rng.int(38, 46)
  const helmet = rng.pick(HELMET_COLORS)
  const harness = rng.pick(HARNESS_MAKES)
  const pack = rng.pick(PACK_COLORS)
  return `${jacket} jacket, ${bootMake} boots (size ${bootSize}), ${helmet} helmet, ${harness} harness, ${pack} pack.`
}

function personalEffectsSentence(rng: Rng): string {
  const items: string[] = []
  if (rng.bool(0.6))
    items.push(`a ${rng.pick(["steel", "titanium", "plastic"])} wristwatch`)
  if (rng.bool(0.3)) items.push("a ring")
  items.push(`phone (IMEI ${rng.int(100000000000000, 999999999999999)})`)
  items.push(`satellite beacon (ID SB-${rng.int(10000, 99999)})`)
  return `${capitalize(items.join(", "))}.`
}

function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s
}

function sourceRecordCount(name: TracedValue<string>): number {
  const d = name.derivation
  if (d.kind === "merged") return d.from.length
  return 1
}

function anomalySentence(findingKind: string | null, label: string): string {
  if (!findingKind) return "Clean — nothing currently flagged."
  switch (findingKind) {
    case "duplicate_identity":
      return "Flagged — identity merged from multiple source records, unconfirmed."
    case "physiological_outlier":
      return `Anomaly — ${label}'s readings are outside their own baseline.`
    case "conflicting_reading":
      return "Flagged — a reading sign disagrees between sources."
    default:
      return "Flagged for review."
  }
}
