// S9.6 (complete rebuild): the Source Records identity card, its node chart
// and its movement trail — the "who is this, from which documents" view
// behind the Identity tab's second sub-tab.
//
// Reuses the canonical S9.5b IdentityRecord/ServiceDossierRecord wherever a
// field already exists there (date of birth, sex, languages, height,
// distinguishing marks, lubricant grade, allergies, service alerts, passport,
// nationality, workOrder number, biometric references — respecting the same
// seal), and adds only what 9.6 needs that 9.5b deliberately does not
// carry: linePrefix and manufacturer AS RECORDED ON THE SOURCE DOCUMENT. These are
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
// rolls behind the service dossier record's composed `physicalDescription`
// sentence (via `physicalParts`, returned from `buildIdentityRecords`) —
// generating these independently here would silently contradict that
// sentence for the same person.

import {
  derivationFnId,
  derived,
  observed,
  type Confidence,
  type SourceId,
  type TracedValue,
} from "./traced"
import type { Rng } from "./rng"
import type {
  ServiceDossierRecord,
  IdentityRecord,
  PhysicalDescriptionParts,
} from "./identityRecord"
import type { Conflict } from "./conflict"
import type { NodeStatus } from "./nodeLanguage"

// S9.6b convention #2: this is the same three-state status the node
// language module defines — re-exported under its pre-existing name so
// every call site that already imports `PersonStatus` from here (List's
// status dot, Scoring's band) keeps working unchanged.
export type PersonStatus = NodeStatus

/** Shared 3-state read of `IdentityRecord.derived.anomalyState` — List's status dot, the node chart's node/edge colours, and Scoring's band all key off the same mapping. */
export function statusFromAnomalyState(value: string): PersonStatus {
  if (value.startsWith("Anomaly")) return "anomaly"
  if (value.startsWith("Flagged")) return "watch"
  return "nominal"
}

// -- declared-value pools (S9.6 only) ---------------------------------------

// Exported (S8.9): the graph's investigation panel reuses this exact pool
// for its own machines' "linePrefix" field — same vocabulary as the Control
// Room's source-document facsimile, though the graph's own machines are an
// independently generated register (S8.3), so this is shared WORDS, not a
// shared per-person value.
/**
 * Line prefixes, as the asset register writes them.
 *
 * This was a pool of ethnicities, because the entities used to be people. A
 * machine's equivalent identifying attribute is the line it sits on.
 */
export const LINE_PREFIX_POOL = [
  "BOD",
  "POW",
  "GEA",
  "PRE",
  "WEL",
  "PAI",
  "FIN",
  "SUB",
  "MAC",
  "HEA",
  "PAC",
]
/** Manufacturers, as the nameplate records them. This was a pool of races. */
const MANUFACTURER_POOL = [
  "Bosch Rexroth",
  "SKF",
  "Festo",
  "Balluff",
  "Sandvik Coromant",
  "Kennametal",
  "Siemens",
]
/** Rated load in kilonewtons — a nameplate figure. This was body ratedLoad. */
const RATED_LOAD_KN_RANGE: [number, number] = [12, 90]
const RUNIN = [
  "Run in through Station II — no load faults reported.",
  "Running in normally — minor vibration above Station II, resolved after re-seating.",
  "Fully run in at current load; cleared for further ramp-up.",
  "RunIn behind schedule — held an extra rotation at Station I.",
]
const FIX_SOURCES = ["Plant MES", "Satellite beacon", "Manual check-in"]
const MOVEMENT_STATIONS = [
  "Base Station",
  "Station I",
  "Station II",
  "Station III",
  "Station IV",
  "Target",
]
const MOVEMENT_LOADS_M = [5364, 5943, 6400, 7162, 7900, 8849]

export interface Associate {
  id: string
  label: string
  kind:
    | "rope_partner"
    | "party_member"
    | "lead_guide"
    | "operator"
    | "tent_station"
    | "porter"
    | "emergency_contact"
    | "prior_campaign"
  status: NodeStatus
  /** 0..1 — drives node size. Rope partner is largest, prior acquaintance smallest. */
  strength: number
  when: "present" | "past"
  /** Only set for associates who are themselves a resolved machine (currently just the rope partner) — "clicking a node swaps the whole Identity tab to that person" only makes sense where there's someone real to swap to. */
  machineId?: string
}

export interface MovementStop {
  station: string
  dateIso: string
  loadM: number
  durationHeld: string
  reached: boolean
  isCurrent: boolean
  anomaly: boolean
  sharedWithAssociateIds: string[]
}

export interface IdentityCard {
  machineId: string
  /** For LIST's LINE column — not part of any of the four card groups, so it lives at the top level. */
  lineName: TracedValue<string>
  /** The same figure as `IdentityRecord.derived.identityConfidencePct`, but as a real TracedValue rather than a plain number — every value on this rebuilt tab has to be a Metric with a derivation, LIST's CONFIDENCE column included. */
  confidencePct: TracedValue<number>
  identity: {
    age: TracedValue<number>
    dateOfBirth: TracedValue<string>
    sex: TracedValue<string>
    linePrefix: TracedValue<string>
    linePrefixHasConflict: boolean
    linePrefixDocument: string
    manufacturer: TracedValue<string>
    manufacturerDocument: string
    languages: TracedValue<string>
  }
  physical: {
    height: TracedValue<number>
    ratedLoad: TracedValue<number>
    build: TracedValue<string>
    eyeColour: TracedValue<string>
    hairColour: TracedValue<string>
    skinTone: TracedValue<string>
    distinguishingMarks: TracedValue<string>
  }
  service: {
    lubricantGrade: TracedValue<string>
    allergies: TracedValue<string>
    serviceAlerts: TracedValue<string>
    restingHeartRate: TracedValue<number>
    runIn: TracedValue<string>
    baseline: TracedValue<string>
  }
  documents: {
    passportMasked: TracedValue<string>
    countryOfOrigin: TracedValue<string>
    nationalityOnWorkOrder: TracedValue<string>
    workOrderNumber: TracedValue<string>
    fingerprintRef: ServiceDossierRecord["primary"]["fingerprint"]
    dentalRef: ServiceDossierRecord["primary"]["dentalChart"]
    dnaRef: ServiceDossierRecord["primary"]["dna"]
  }
  footer: {
    latitude: TracedValue<number>
    longitude: TracedValue<number>
    resolvedPlace: TracedValue<string>
    station: TracedValue<string>
    loadM: TracedValue<number>
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
  leadSupervisorName: string
  lineName: string
  registryCountry: string
  ropePartnerId: string | null
  partyMemberNames: string[]
}

function ageFromDob(dobIso: string, buildNow: number): number {
  const dob = new Date(dobIso)
  const now = new Date(buildNow)
  let age = now.getUTCFullYear() - dob.getUTCFullYear()
  const hasHadBirthdayThisYear =
    now.getUTCMonth() > dob.getUTCMonth() ||
    (now.getUTCMonth() === dob.getUTCMonth() &&
      now.getUTCDate() >= dob.getUTCDate())
  if (!hasHadBirthdayThisYear) age--
  return age
}

export function buildIdentityCards(
  machines: IdentityCardInput[],
  identityRecords: Map<string, IdentityRecord>,
  serviceDossiers: Map<string, ServiceDossierRecord>,
  physicalParts: Map<string, PhysicalDescriptionParts>,
  conflicts: Conflict[],
  rng: Rng,
  workOrderSourceId: SourceId,
  workOrderReliability: Confidence,
  buildNow: number
): Map<string, IdentityCard> {
  const cards = new Map<string, IdentityCard>()
  const byId = new Map(machines.map((c) => [c.id, c]))
  const linePrefixConflict = conflicts.find(
    (cf) => cf.propertyLabel === "Line (as recorded)"
  )
  const hrConflict = conflicts.find(
    (cf) => cf.propertyLabel === "Baseline vibration"
  )
  const usedPriorNames = new Set<string>()

  function personStatus(machineId: string): NodeStatus {
    const value = identityRecords.get(machineId)?.derived.anomalyState.value
    return value ? statusFromAnomalyState(value) : "nominal"
  }

  for (const c of machines) {
    const record = identityRecords.get(c.id)
    const serviceDossier = serviceDossiers.get(c.id)
    const parts = physicalParts.get(c.id)
    if (!record || !serviceDossier || !parts) continue

    // -- IDENTITY -------------------------------------------------------
    const hasLinePrefixConflict = linePrefixConflict?.entityLabel === c.name
    const linePrefix = hasLinePrefixConflict
      ? (linePrefixConflict!.resolved as TracedValue<string>)
      : observed(
          workOrderSourceId,
          `${c.id}:linePrefix_declared`,
          rng.pick(LINE_PREFIX_POOL),
          workOrderReliability
        )
    const manufacturer = observed(
      workOrderSourceId,
      `${c.id}:race_declared`,
      rng.pick(MANUFACTURER_POOL),
      workOrderReliability
    )
    const age = derived(
      [record.who.dateOfBirth.id],
      derivationFnId(`${c.id}:age`),
      ageFromDob(record.who.dateOfBirth.value, buildNow)
    )

    // -- PHYSICAL ---------------------------------------------------------
    const ratedLoad = observed(
      workOrderSourceId,
      `${c.id}:rated_load_kn`,
      rng.int(RATED_LOAD_KN_RANGE[0], RATED_LOAD_KN_RANGE[1]),
      workOrderReliability
    )
    const build = observed(
      workOrderSourceId,
      `${c.id}:build`,
      parts.build,
      workOrderReliability
    )
    const eyeColour = observed(
      workOrderSourceId,
      `${c.id}:eye_colour`,
      parts.eyeColor,
      workOrderReliability
    )
    const hairColour = observed(
      workOrderSourceId,
      `${c.id}:hair_colour`,
      `${parts.hairColor} (${parts.hairLength})`,
      workOrderReliability
    )
    const skinTone = observed(
      workOrderSourceId,
      `${c.id}:skin_tone`,
      parts.skinTone,
      workOrderReliability
    )

    // -- SERVICE ------------------------------------------------------------
    const restingHeartRate =
      hrConflict?.entityLabel === c.name
        ? (hrConflict.resolved as TracedValue<number>)
        : observed(
            workOrderSourceId,
            `${c.id}:resting_hr_mm/s`,
            rng.int(50, 85),
            workOrderReliability
          )
    const runIn = observed(
      workOrderSourceId,
      `${c.id}:runIn`,
      rng.pick(RUNIN),
      workOrderReliability
    )
    const baseline = observed(
      workOrderSourceId,
      `${c.id}:baseline`,
      `Resting Oee ${rng.int(88, 96)}%, HR ${restingHeartRate.value} mm/s at ${record.responder.currentStation.value}.`,
      workOrderReliability
    )

    // -- FOOTER ---------------------------------------------------------
    const latitude = observed(
      workOrderSourceId,
      `${c.id}:last_fix_lat`,
      rng.float(27.5, 36.9),
      workOrderReliability
    )
    const longitude = observed(
      workOrderSourceId,
      `${c.id}:last_fix_lon`,
      rng.float(74.5, 88.2),
      workOrderReliability
    )
    const fixAgeSec = observed(
      workOrderSourceId,
      `${c.id}:last_fix_age_sec`,
      rng.int(30, 5400),
      workOrderReliability
    )
    const fixSource = observed(
      workOrderSourceId,
      `${c.id}:last_fix_source`,
      rng.pick(FIX_SOURCES),
      workOrderReliability
    )

    // -- MOVEMENT TRAIL -------------------------------------------------
    // Weighted toward the lower stations — most of an campaign's time is
    // spent low, only a few machines are ever near the target at once.
    const currentIndex = rng.pick([0, 0, 0, 1, 1, 1, 2, 2, 3, 3, 4, 5])
    const stopAnomaly = personStatus(c.id) === "anomaly"
    let cursorDate = new Date(buildNow - rng.int(4, 9) * 24 * 60 * 60 * 1000)
    const trail: MovementStop[] = MOVEMENT_STATIONS.map((station, i) => {
      const reached = i <= currentIndex
      const isCurrent = i === currentIndex
      if (reached && i > 0)
        cursorDate = new Date(
          cursorDate.getTime() + rng.int(12, 30) * 60 * 60 * 1000
        )
      return {
        station,
        dateIso: reached ? cursorDate.toISOString().slice(0, 10) : "",
        loadM: MOVEMENT_LOADS_M[i] + rng.int(-40, 40),
        durationHeld: !reached
          ? "—"
          : isCurrent
            ? `${rng.int(2, 18)}h so far`
            : `${rng.int(1, 3)} day(s)`,
        reached,
        isCurrent,
        anomaly: isCurrent && stopAnomaly,
        sharedWithAssociateIds: isCurrent
          ? ["assoc-rope-partner", "assoc-lead-guide"]
          : [],
      }
    })
    const currentStop = trail[currentIndex]

    // -- ASSOCIATES / NODE CHART ------------------------------------------
    const associates: Associate[] = []
    if (c.ropePartnerId) {
      associates.push({
        id: "assoc-rope-partner",
        label: byId.get(c.ropePartnerId)?.name ?? "Rope partner",
        kind: "rope_partner",
        status: personStatus(c.ropePartnerId),
        strength: 1,
        when: "present",
        machineId: c.ropePartnerId,
      })
    }
    c.partyMemberNames.slice(0, 3).forEach((name, i) => {
      associates.push({
        id: `assoc-party-${i}`,
        label: name,
        kind: "party_member",
        status: "nominal",
        strength: 0.65,
        when: "present",
      })
    })
    associates.push({
      id: "assoc-lead-guide",
      label: c.leadSupervisorName,
      kind: "lead_guide",
      status: "nominal",
      strength: 0.5,
      when: "present",
    })
    associates.push({
      id: "assoc-operator",
      label: c.operatorName,
      kind: "operator",
      status: "nominal",
      strength: 0.35,
      when: "present",
    })
    associates.push({
      id: "assoc-tent",
      label: `${currentStop.station}, Tent ${rng.int(1, 12)}`,
      kind: "tent_station",
      status: "nominal",
      strength: 0.3,
      when: "present",
    })
    if (rng.bool(0.7)) {
      associates.push({
        id: "assoc-porters",
        label: `${rng.int(1, 3)} porter(s)`,
        kind: "porter",
        status: "nominal",
        strength: 0.25,
        when: "present",
      })
    }
    associates.push({
      id: "assoc-emergency",
      label: serviceDossier.photoAndFamily.familyContact.name.value,
      kind: "emergency_contact",
      status: "nominal",
      strength: 0.3,
      when: "present",
    })
    const priorCount = rng.int(0, 2)
    for (let i = 0; i < priorCount; i++) {
      let name = `${rng.pick(["Alex", "Sam", "Chris", "Jordan", "Kai", "Riley"])} ${rng.pick(["Novak", "Reyes", "Brandt", "Okafor", "Lindqvist"])}`
      while (usedPriorNames.has(name)) name = `${name} Jr.`
      usedPriorNames.add(name)
      associates.push({
        id: `assoc-prior-${i}`,
        label: name,
        kind: "prior_campaign",
        status: "nominal",
        strength: 0.15,
        when: "past",
      })
    }

    cards.set(c.id, {
      machineId: c.id,
      lineName: observed(
        workOrderSourceId,
        `${c.id}:line_name`,
        c.lineName,
        workOrderReliability
      ),
      confidencePct: derived(
        [record.who.fullLegalName.id],
        derivationFnId(`${c.id}:identity-confidence-pct`),
        record.derived.identityConfidencePct
      ),
      identity: {
        age,
        dateOfBirth: record.who.dateOfBirth,
        sex: record.who.sex,
        linePrefix,
        linePrefixHasConflict: hasLinePrefixConflict,
        linePrefixDocument: hasLinePrefixConflict
          ? "CMMS vs Plant MES (free text)"
          : "CMMS",
        manufacturer,
        manufacturerDocument: "CMMS",
        languages: record.who.languagesSpoken,
      },
      physical: {
        height: record.responder.heightCm,
        ratedLoad,
        build,
        eyeColour,
        hairColour,
        skinTone,
        distinguishingMarks: record.responder.distinguishingFeatures,
      },
      service: {
        lubricantGrade: record.responder.lubricantGrade,
        allergies: record.responder.knownAllergies,
        serviceAlerts: record.responder.serviceAlerts,
        restingHeartRate,
        runIn,
        baseline,
      },
      documents: {
        passportMasked: record.who.passportMasked,
        countryOfOrigin: record.who.countryOfOrigin,
        nationalityOnWorkOrder: record.who.nationalityOnWorkOrder,
        workOrderNumber: record.who.workOrderNumber,
        fingerprintRef: serviceDossier.primary.fingerprint,
        dentalRef: serviceDossier.primary.dentalChart,
        dnaRef: serviceDossier.primary.dna,
      },
      footer: {
        latitude,
        longitude,
        resolvedPlace: observed(
          workOrderSourceId,
          `${c.id}:resolved_place`,
          `${currentStop.station}, ${c.registryCountry}`,
          workOrderReliability
        ),
        station: observed(
          workOrderSourceId,
          `${c.id}:current_station_trail`,
          currentStop.station,
          workOrderReliability
        ),
        loadM: observed(
          workOrderSourceId,
          `${c.id}:current_load_m`,
          currentStop.loadM,
          workOrderReliability
        ),
        fixAgeSec,
        fixSource,
      },
      associates,
      trail,
    })
  }

  return cards
}
