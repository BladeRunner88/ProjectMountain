// S9.6 (complete rebuild): the Source Records identity card, its node chart
// and its movement trail — the "who is this, from which documents" view
// behind the Identity tab's second sub-tab.
//
// Reuses the canonical S9.5b IdentityRecord/AnteMortemRecord wherever a
// field already exists there (date of birth, sex, languages, height,
// distinguishing marks, blood group, allergies, medical alerts, passport,
// nationality, permit number, biometric references — respecting the same
// seal), and adds only what 9.6 needs that 9.5b deliberately does not
// carry: ethnicity and race AS RECORDED ON THE SOURCE DOCUMENT. These are
// declared values quoted from a specific document, not an ASE observation
// and not a categorical judgement ASE itself is making — 9.6 is explicit
// that they must be labelled as document-declared and show which document
// each came from. That is why these two fields live here and nowhere near
// identityRecord.ts, and why the conflict that feeds them is excluded from
// IdentityRecord's own `conflictingFields` (identityRecord.ts keeps its own
// "does not store one anywhere" claim true — that rule governs the
// canonical record and its exports, not this document facsimile).
//
// Weight, build, eye colour, hair colour and skin tone reuse the EXACT
// rolls behind the ante-mortem record's composed `physicalDescription`
// sentence (via `physicalParts`, returned from `buildIdentityRecords`) —
// generating these independently here would silently contradict that
// sentence for the same person.

import { derivationFnId, derived, observed, type Confidence, type SourceId, type TracedValue } from './traced'
import type { Rng } from '../mock/rng'
import type { AnteMortemRecord, IdentityRecord, PhysicalDescriptionParts } from './identityRecord'
import type { Conflict } from './conflict'
import type { NodeStatus } from './nodeLanguage'

// S9.6b convention #2: this is the same three-state status the node
// language module defines — re-exported under its pre-existing name so
// every call site that already imports `PersonStatus` from here (List's
// status dot, Scoring's band) keeps working unchanged.
export type PersonStatus = NodeStatus

/** Shared 3-state read of `IdentityRecord.derived.anomalyState` — List's status dot, the node chart's node/edge colours, and Scoring's band all key off the same mapping. */
export function statusFromAnomalyState(value: string): PersonStatus {
  if (value.startsWith('Anomaly')) return 'anomaly'
  if (value.startsWith('Flagged')) return 'watch'
  return 'nominal'
}

// -- declared-value pools (S9.6 only) ---------------------------------------

// Exported (S8.9): the graph's investigation panel reuses this exact pool
// for its own climbers' "ethnicity" field — same vocabulary as the Control
// Room's source-document facsimile, though the graph's own climbers are an
// independently generated roster (S8.3), so this is shared WORDS, not a
// shared per-person value.
export const ETHNICITY_POOL = [
  'Sherpa', 'Tamang', 'Gurung', 'Punjabi', 'Pashtun', 'Sindhi', 'Han Chinese', 'Tibetan',
  'Anglo', 'Basque', 'Yamato', 'Korean', 'Castilian', 'Polish', 'Kazakh', 'Rajput',
]
const RACE_POOL = ['Asian', 'White', 'South Asian', 'Black or African descent', 'Hispanic or Latino', 'Middle Eastern', 'Mixed / Other']
const WEIGHT_KG_RANGE: [number, number] = [54, 92]
const ACCLIMATISATION = [
  'Acclimatised through Camp II — no altitude symptoms reported.',
  'Acclimatising normally — mild headache above Camp II, resolved with rest.',
  'Fully acclimatised to current altitude; cleared for further ascent.',
  'Acclimatisation behind schedule — held an extra rotation at Camp I.',
]
const FIX_SOURCES = ['GPS tracker', 'Satellite beacon', 'Manual check-in']
const MOVEMENT_CAMPS = ['Base Camp', 'Camp I', 'Camp II', 'Camp III', 'Camp IV', 'Summit']
const MOVEMENT_ALTITUDES_M = [5364, 5943, 6400, 7162, 7900, 8849]

export interface Associate {
  id: string
  label: string
  kind: 'rope_partner' | 'party_member' | 'lead_guide' | 'operator' | 'tent_camp' | 'porter' | 'emergency_contact' | 'prior_expedition'
  status: NodeStatus
  /** 0..1 — drives node size. Rope partner is largest, prior acquaintance smallest. */
  strength: number
  when: 'present' | 'past'
  /** Only set for associates who are themselves a resolved climber (currently just the rope partner) — "clicking a node swaps the whole Identity tab to that person" only makes sense where there's someone real to swap to. */
  climberId?: string
}

export interface MovementStop {
  camp: string
  dateIso: string
  altitudeM: number
  durationHeld: string
  reached: boolean
  isCurrent: boolean
  anomaly: boolean
  sharedWithAssociateIds: string[]
}

export interface IdentityCard {
  climberId: string
  /** For LIST's ROUTE column — not part of any of the four card groups, so it lives at the top level. */
  routeName: TracedValue<string>
  /** The same figure as `IdentityRecord.derived.identityConfidencePct`, but as a real TracedValue rather than a plain number — every value on this rebuilt tab has to be a Metric with a derivation, LIST's CONFIDENCE column included. */
  confidencePct: TracedValue<number>
  identity: {
    age: TracedValue<number>
    dateOfBirth: TracedValue<string>
    sex: TracedValue<string>
    ethnicity: TracedValue<string>
    ethnicityHasConflict: boolean
    ethnicityDocument: string
    race: TracedValue<string>
    raceDocument: string
    languages: TracedValue<string>
  }
  physical: {
    height: TracedValue<number>
    weight: TracedValue<number>
    build: TracedValue<string>
    eyeColour: TracedValue<string>
    hairColour: TracedValue<string>
    skinTone: TracedValue<string>
    distinguishingMarks: TracedValue<string>
  }
  medical: {
    bloodGroup: TracedValue<string>
    allergies: TracedValue<string>
    medicalAlerts: TracedValue<string>
    restingHeartRate: TracedValue<number>
    acclimatisation: TracedValue<string>
    baseline: TracedValue<string>
  }
  documents: {
    passportMasked: TracedValue<string>
    countryOfOrigin: TracedValue<string>
    nationalityOnPermit: TracedValue<string>
    permitNumber: TracedValue<string>
    fingerprintRef: AnteMortemRecord['primary']['fingerprint']
    dentalRef: AnteMortemRecord['primary']['dentalChart']
    dnaRef: AnteMortemRecord['primary']['dna']
  }
  footer: {
    latitude: TracedValue<number>
    longitude: TracedValue<number>
    resolvedPlace: TracedValue<string>
    camp: TracedValue<string>
    altitudeM: TracedValue<number>
    fixAgeSec: TracedValue<number>
    fixSource: TracedValue<string>
  }
  associates: Associate[]
  trail: MovementStop[]
}

export interface IdentityCardInput {
  id: string
  name: string
  operatorName: string
  leadGuideName: string
  routeName: string
  registryCountry: string
  ropePartnerId: string | null
  partyMemberNames: string[]
}

function ageFromDob(dobIso: string, buildNow: number): number {
  const dob = new Date(dobIso)
  const now = new Date(buildNow)
  let age = now.getUTCFullYear() - dob.getUTCFullYear()
  const hasHadBirthdayThisYear = now.getUTCMonth() > dob.getUTCMonth() || (now.getUTCMonth() === dob.getUTCMonth() && now.getUTCDate() >= dob.getUTCDate())
  if (!hasHadBirthdayThisYear) age--
  return age
}

export function buildIdentityCards(
  climbers: IdentityCardInput[],
  identityRecords: Map<string, IdentityRecord>,
  anteMortems: Map<string, AnteMortemRecord>,
  physicalParts: Map<string, PhysicalDescriptionParts>,
  conflicts: Conflict[],
  rng: Rng,
  permitSourceId: SourceId,
  permitReliability: Confidence,
  buildNow: number
): Map<string, IdentityCard> {
  const cards = new Map<string, IdentityCard>()
  const byId = new Map(climbers.map((c) => [c.id, c]))
  const ethnicityConflict = conflicts.find((cf) => cf.propertyLabel === 'Ethnicity (as recorded)')
  const hrConflict = conflicts.find((cf) => cf.propertyLabel === 'Resting heart rate')
  const usedPriorNames = new Set<string>()

  function personStatus(climberId: string): NodeStatus {
    const value = identityRecords.get(climberId)?.derived.anomalyState.value
    return value ? statusFromAnomalyState(value) : 'nominal'
  }

  for (const c of climbers) {
    const record = identityRecords.get(c.id)
    const anteMortem = anteMortems.get(c.id)
    const parts = physicalParts.get(c.id)
    if (!record || !anteMortem || !parts) continue

    // -- IDENTITY -------------------------------------------------------
    const hasEthnicityConflict = ethnicityConflict?.entityLabel === c.name
    const ethnicity = hasEthnicityConflict
      ? (ethnicityConflict!.resolved as TracedValue<string>)
      : observed(permitSourceId, `${c.id}:ethnicity_declared`, rng.pick(ETHNICITY_POOL), permitReliability)
    const race = observed(permitSourceId, `${c.id}:race_declared`, rng.pick(RACE_POOL), permitReliability)
    const age = derived([record.who.dateOfBirth.id], derivationFnId(`${c.id}:age`), ageFromDob(record.who.dateOfBirth.value, buildNow))

    // -- PHYSICAL ---------------------------------------------------------
    const weight = observed(permitSourceId, `${c.id}:weight_kg`, rng.int(WEIGHT_KG_RANGE[0], WEIGHT_KG_RANGE[1]), permitReliability)
    const build = observed(permitSourceId, `${c.id}:build`, parts.build, permitReliability)
    const eyeColour = observed(permitSourceId, `${c.id}:eye_colour`, parts.eyeColor, permitReliability)
    const hairColour = observed(permitSourceId, `${c.id}:hair_colour`, `${parts.hairColor} (${parts.hairLength})`, permitReliability)
    const skinTone = observed(permitSourceId, `${c.id}:skin_tone`, parts.skinTone, permitReliability)

    // -- MEDICAL ------------------------------------------------------------
    const restingHeartRate =
      hrConflict?.entityLabel === c.name
        ? (hrConflict.resolved as TracedValue<number>)
        : observed(permitSourceId, `${c.id}:resting_hr_bpm`, rng.int(50, 85), permitReliability)
    const acclimatisation = observed(permitSourceId, `${c.id}:acclimatisation`, rng.pick(ACCLIMATISATION), permitReliability)
    const baseline = observed(
      permitSourceId,
      `${c.id}:baseline`,
      `Resting SpO2 ${rng.int(88, 96)}%, HR ${restingHeartRate.value} bpm at ${record.responder.currentCamp.value}.`,
      permitReliability
    )

    // -- FOOTER ---------------------------------------------------------
    const latitude = observed(permitSourceId, `${c.id}:last_fix_lat`, rng.float(27.5, 36.9), permitReliability)
    const longitude = observed(permitSourceId, `${c.id}:last_fix_lon`, rng.float(74.5, 88.2), permitReliability)
    const fixAgeSec = observed(permitSourceId, `${c.id}:last_fix_age_sec`, rng.int(30, 5400), permitReliability)
    const fixSource = observed(permitSourceId, `${c.id}:last_fix_source`, rng.pick(FIX_SOURCES), permitReliability)

    // -- MOVEMENT TRAIL -------------------------------------------------
    // Weighted toward the lower camps — most of an expedition's time is
    // spent low, only a few climbers are ever near the summit at once.
    const currentIndex = rng.pick([0, 0, 0, 1, 1, 1, 2, 2, 3, 3, 4, 5])
    const stopAnomaly = personStatus(c.id) === 'anomaly'
    let cursorDate = new Date(buildNow - rng.int(4, 9) * 24 * 60 * 60 * 1000)
    const trail: MovementStop[] = MOVEMENT_CAMPS.map((camp, i) => {
      const reached = i <= currentIndex
      const isCurrent = i === currentIndex
      if (reached && i > 0) cursorDate = new Date(cursorDate.getTime() + rng.int(12, 30) * 60 * 60 * 1000)
      return {
        camp,
        dateIso: reached ? cursorDate.toISOString().slice(0, 10) : '',
        altitudeM: MOVEMENT_ALTITUDES_M[i] + rng.int(-40, 40),
        durationHeld: !reached ? '—' : isCurrent ? `${rng.int(2, 18)}h so far` : `${rng.int(1, 3)} day(s)`,
        reached,
        isCurrent,
        anomaly: isCurrent && stopAnomaly,
        sharedWithAssociateIds: isCurrent ? ['assoc-rope-partner', 'assoc-lead-guide'] : [],
      }
    })
    const currentStop = trail[currentIndex]

    // -- ASSOCIATES / NODE CHART ------------------------------------------
    const associates: Associate[] = []
    if (c.ropePartnerId) {
      associates.push({
        id: 'assoc-rope-partner',
        label: byId.get(c.ropePartnerId)?.name ?? 'Rope partner',
        kind: 'rope_partner',
        status: personStatus(c.ropePartnerId),
        strength: 1,
        when: 'present',
        climberId: c.ropePartnerId,
      })
    }
    c.partyMemberNames.slice(0, 3).forEach((name, i) => {
      associates.push({ id: `assoc-party-${i}`, label: name, kind: 'party_member', status: 'nominal', strength: 0.65, when: 'present' })
    })
    associates.push({ id: 'assoc-lead-guide', label: c.leadGuideName, kind: 'lead_guide', status: 'nominal', strength: 0.5, when: 'present' })
    associates.push({ id: 'assoc-operator', label: c.operatorName, kind: 'operator', status: 'nominal', strength: 0.35, when: 'present' })
    associates.push({
      id: 'assoc-tent',
      label: `${currentStop.camp}, Tent ${rng.int(1, 12)}`,
      kind: 'tent_camp',
      status: 'nominal',
      strength: 0.3,
      when: 'present',
    })
    if (rng.bool(0.7)) {
      associates.push({ id: 'assoc-porters', label: `${rng.int(1, 3)} porter(s)`, kind: 'porter', status: 'nominal', strength: 0.25, when: 'present' })
    }
    associates.push({
      id: 'assoc-emergency',
      label: anteMortem.photoAndFamily.familyContact.name.value,
      kind: 'emergency_contact',
      status: 'nominal',
      strength: 0.3,
      when: 'present',
    })
    const priorCount = rng.int(0, 2)
    for (let i = 0; i < priorCount; i++) {
      let name = `${rng.pick(['Alex', 'Sam', 'Chris', 'Jordan', 'Kai', 'Riley'])} ${rng.pick(['Novak', 'Reyes', 'Brandt', 'Okafor', 'Lindqvist'])}`
      while (usedPriorNames.has(name)) name = `${name} Jr.`
      usedPriorNames.add(name)
      associates.push({ id: `assoc-prior-${i}`, label: name, kind: 'prior_expedition', status: 'nominal', strength: 0.15, when: 'past' })
    }

    cards.set(c.id, {
      climberId: c.id,
      routeName: observed(permitSourceId, `${c.id}:route_name`, c.routeName, permitReliability),
      confidencePct: derived([record.who.fullLegalName.id], derivationFnId(`${c.id}:identity-confidence-pct`), record.derived.identityConfidencePct),
      identity: {
        age,
        dateOfBirth: record.who.dateOfBirth,
        sex: record.who.sex,
        ethnicity,
        ethnicityHasConflict: hasEthnicityConflict,
        ethnicityDocument: hasEthnicityConflict ? 'Permit registry vs Operator rosters (free text)' : 'Permit registry',
        race,
        raceDocument: 'Permit registry',
        languages: record.who.languagesSpoken,
      },
      physical: {
        height: record.responder.heightCm,
        weight,
        build,
        eyeColour,
        hairColour,
        skinTone,
        distinguishingMarks: record.responder.distinguishingFeatures,
      },
      medical: {
        bloodGroup: record.responder.bloodGroup,
        allergies: record.responder.knownAllergies,
        medicalAlerts: record.responder.medicalAlerts,
        restingHeartRate,
        acclimatisation,
        baseline,
      },
      documents: {
        passportMasked: record.who.passportMasked,
        countryOfOrigin: record.who.countryOfOrigin,
        nationalityOnPermit: record.who.nationalityOnPermit,
        permitNumber: record.who.permitNumber,
        fingerprintRef: anteMortem.primary.fingerprint,
        dentalRef: anteMortem.primary.dentalChart,
        dnaRef: anteMortem.primary.dna,
      },
      footer: {
        latitude,
        longitude,
        resolvedPlace: observed(permitSourceId, `${c.id}:resolved_place`, `${currentStop.camp}, ${c.registryCountry}`, permitReliability),
        camp: observed(permitSourceId, `${c.id}:current_camp_trail`, currentStop.camp, permitReliability),
        altitudeM: observed(permitSourceId, `${c.id}:current_altitude_m`, currentStop.altitudeM, permitReliability),
        fixAgeSec,
        fixSource,
      },
      associates,
      trail,
    })
  }

  return cards
}
