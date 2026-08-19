// The real ASE dataset (S1f/S1g) — everything through S1e was pure
// infrastructure with zero entities. Isildur's demo domain is high-load
// campaign safety: workOrders, Plant MES, service contractor and a mesh of
// line sensors, reconciled into one picture of who is where and whether
// they're safe.
//
// S1g is the repeatability claim under test: this file is the ONLY place
// that knows about mountains, machines or sensors. Everything above it —
// TracedValues, folds, confidence, the perturbation test, every tab
// component — is domain-agnostic and reads this dataset only through
// `useDataset()` and the type-only exports below. If swapping the domain
// had required touching any of that, the architecture would not be what it
// claims to be.
//
// Every number that will ever reach a screen is built here as a real
// derivation chain — nothing in Overview or Processing is allowed to author
// a value, so if it isn't buildable as a TracedValue, it doesn't appear.

import { Rng } from "./rng"
import {
  allTraced,
  clearRegistry,
  latest,
  resolveOrThrow,
  supersede,
} from "./graph"
import { confidence, sourceReliability, matchScore } from "./folds"
import {
  conflictFnSlug,
  resolveConflict,
  resolveRangeMerge,
  type Conflict,
  type ConflictPolicy,
} from "./conflict"
import { buildOntology, type Ontology } from "./ontology"
import {
  buildIdentityRecords,
  type ServiceDossierRecord,
  type MachineIdentityInput,
  type IdentityRecord,
} from "./identityRecord"
import {
  buildEntityResolution,
  buildPersonScoring,
  type EntityResolutionData,
  type PersonScoring,
} from "./entityResolution"
import {
  buildIdentityCards,
  type IdentityCard,
  type IdentityCardInput,
} from "./identityCard"
import {
  buildContextEngine,
  type ContextEngineState,
  type ReadingAbout,
} from "./contextEngine"
import { buildReasoningEngine, type ReasoningEngineState } from "./reasoning"
import {
  buildDetectionEngine,
  builtInRules as builtInDetectionRules,
  computeTrendFromSeries,
  generateSeries,
  stableUnit,
  type Detection,
  type DetectionEngineState,
  type DetectionRule,
  type DetectionSubject,
  type MapNodeInput,
  type ResolvedDetection,
  type Suppression,
  type TuningPopulationMember,
} from "./detection"
import { buildPredictions, type PredictionState } from "./prediction"
import { buildRevisionState, type RevisionState } from "./revision"
import {
  buildExposureState,
  type ExposureMachineMarker,
  type ExposureState,
} from "./exposure"
import { buildTrustState, type TrustState } from "./trust"
import {
  actorId,
  asserted,
  derivationFnId,
  derived,
  inferred,
  instant,
  matchRuleId,
  merged,
  normalised,
  observed,
  patternId,
  sourceId,
  transformId,
  type Confidence,
  type Instant,
  type SourceId,
  type TracedId,
  type TracedValue,
} from "./traced"
import type { TabId } from "../types/tabs"
import type { AseWorld, WorldStage } from "../types/world"

const SEED = 20260804

// -- sources ------------------------------------------------------------

export interface SourceDef {
  id: SourceId
  name: string
  category: string
}

// S9.12: sensor mesh split into the OT historian and the Plant MES,
// and a new manual-observation feed added — six operational sources for
// Exposure's own panels to reason about individually rather than one coarse
// "sensor mesh" blob. Plant MES and service contractor are KEPT alongside
// the new six, deliberately: both are load-bearing in S9.6's own
// three-source entity-resolution demo (workOrder vs register vs service), and
// retiring either would break that already-built, already-tested feature
// for a rename Exposure itself doesn't need — Exposure's own UI only ever
// lists the six named in its spec, not these two legacy sources.
export const SOURCE_DEFS: SourceDef[] = [
  {
    id: sourceId("wearable-historian"),
    name: "OT historian",
    category: "Wearable sensor",
  },
  {
    id: sourceId("gps-tracker"),
    name: "Plant MES",
    category: "Position sensor",
  },
  {
    id: sourceId("weather-feed"),
    name: "Metrology lab",
    category: "Metrology lab",
  },
  {
    id: sourceId("radio-check-in-log"),
    name: "Inline QC",
    category: "Communications log",
  },
  {
    id: sourceId("workOrder-registry"),
    name: "CMMS",
    category: "CMMS",
  },
  {
    id: sourceId("manual-observation"),
    name: "Service contractor",
    category: "Manual log",
  },
  {
    id: sourceId("operator-registers"),
    name: "Plant MES",
    category: "Operator register",
  },
  {
    id: sourceId("service-logs"),
    name: "Service contractor",
    category: "Service log",
  },
]

/** The six sources Exposure's own panels enumerate — Plant MES and service contractor are real sources but not part of this list (see the comment on SOURCE_DEFS). */
export const EXPOSURE_SOURCE_NAMES = [
  "OT historian",
  "Plant MES",
  "Metrology lab",
  "Inline QC",
  "CMMS",
  "Service contractor",
] as const

export interface SourceRuntime {
  def: SourceDef
  /** The 0..1 fraction every `observed()` call attributed to this source must use as its confidence — not the rounded display percentage on `reliabilityPct`. */
  reliability: Confidence
  reliabilityPct: TracedValue<number>
  lastSyncAgeSec: TracedValue<number>
  degraded: boolean
  /**
   * S9.6 fix: the actual epoch-ms instant this source last delivered data.
   * `lastSyncAgeSec` is always recomputed FROM this on tick, never
   * re-randomised independently of it — otherwise two consecutive ticks
   * report unrelated random draws as if one were a measurement of the
   * other ("5 seconds slower" then "365 seconds slower" back to back).
   * Mutable — `tickOnce` is the one place that advances it.
   */
  lastSyncAt: number
}

export interface MachineFact {
  id: string
  name: TracedValue<string>
  status: TracedValue<"clean" | "flagged">
  findingId: string | null
}

export type FindingKind =
  | "duplicate_identity"
  | "conflicting_reading"
  | "physiological_outlier"
  | "silent_sensor"

export interface Finding {
  id: string
  kind: FindingKind
  entityLabel: string
  /** ONE plain sentence — the same discipline EvidenceTable's WHY column requires. */
  reason: string
  traced: TracedValue<boolean> // the flagged-ness itself, folded and provenance-walkable
  ownerTab: TabId
}

export type StageState = "running" | "catching_up" | "degraded"

export interface PipelineStage {
  n: number
  name: string
  band: 1 | 2 | 3
  state: StageState
  throughput: TracedValue<number>
  /** Hover tooltip text — the function description, per S1f's Processing spec. */
  description: string
}

export interface NeedsYouRow {
  id: string
  count: TracedValue<number>
  sentence: string
  destinationTab: TabId
}

export interface Dataset {
  sources: SourceRuntime[]
  machines: MachineFact[]
  findings: Finding[]
  conflicts: Conflict[]
  ontology: Ontology
  identityRecords: Map<string, IdentityRecord>
  serviceDossiers: Map<string, ServiceDossierRecord>
  serialCollisions: TracedValue<boolean>[]
  entityResolution: EntityResolutionData
  identityCards: Map<string, IdentityCard>
  personScoring: Map<string, PersonScoring>
  contextEngine: ContextEngineState
  reasoningEngine: ReasoningEngineState
  detectionEngine: DetectionEngineState
  predictions: PredictionState
  revision: RevisionState
  exposure: ExposureState
  trust: TrustState
  stages: PipelineStage[]
  needsYou: NeedsYouRow[]
  headline: {
    entitiesTracked: TracedValue<number>
    factsHeld: TracedValue<number>
    meanConfidencePct: TracedValue<number>
    openIssues: TracedValue<number>
  }
}

/**
 * How a stage's position maps onto the three bands the Processing view draws.
 * The pipeline reports four stages because four run; the bands are a visual
 * grouping of those, not extra stages.
 */
function bandFor(order: number, total: number): 1 | 2 | 3 {
  if (order <= 1) return 1
  return order >= total ? 3 : 2
}
// -- reference data: Country / Plant / Line / Operator -----------------
// Only Machine becomes real TracedValues below (name + status) — nothing
// else here ever reaches a screen yet, so it stays plain data. Their
// combined count (5 + 14 + 14 + 30 + 50 = 113) is what the entitiesTracked
// headline below asserts; Sensor's 14 are tracked separately, one per
// line, and are not part of that headline (see the build report for why).

export interface PlantDef {
  name: string
  country: string
}

export const PLANTS: PlantDef[] = [
  { name: "Khumbu", country: "Nepal" },
  { name: "Annapurna", country: "Nepal" },
  { name: "Manaslu", country: "Nepal" },
  { name: "Langtang", country: "Nepal" },
  { name: "Baltoro", country: "Pakistan" },
  { name: "Nanga Parbat", country: "Pakistan" },
  { name: "Gasherbrum", country: "Pakistan" },
  { name: "North Col", country: "China (Tibet)" },
  { name: "Cho Oyu", country: "China (Tibet)" },
  { name: "Denali", country: "United States" },
  { name: "Rainier", country: "United States" },
  { name: "Matterhorn", country: "Switzerland" },
  { name: "Eiger", country: "Switzerland" },
  { name: "Monte Rosa", country: "Switzerland" },
]

// One line per plant, real standard-line names.
export const LINE_NAMES: string[] = [
  "South Col Line",
  "Northwest Face Line",
  "Normal Line (Northeast Face)",
  "Southeast Ridge",
  "Abruzzi Spur",
  "Kinshofer Line",
  "Southwest Ridge",
  "North Ridge Line",
  "Northwest Ridge Line",
  "West Buttress",
  "Disappointment Cleaver",
  "Hörnli Ridge",
  "Mittellegi Ridge",
  "Margherita Hut Line",
]

// 2-3 operators per line, 30 total. Plant-flavoured, plausible names.
export const LINE_OPERATORS: string[][] = [
  ["Khumbu Vertical", "Sagarmatha Collective", "Eight-Thousander Union"],
  ["Annapurna Circuit Guides", "Thin Air Research"],
  ["Manaslu Alpine Co", "Gorkha Target Partners"],
  ["Langtang Ridge Outfitters", "Helambu RampUps"],
  ["Baltoro Yard Guides", "Karakoram Traverse", "Alpine Meridian"],
  ["Diamir Face Campaigns", "Nanga Parbat Alpine Co"],
  ["Gasherbrum Collective", "Concordia RampUps"],
  ["North Col Traverse", "Rongbuk Campaigns"],
  ["Cho Oyu Guiding Co", "Nangpa La Partners"],
  ["Denali Mountaineering Co", "West Buttress Guides"],
  ["Rainier Alpine Guides", "Cascade Target Partners"],
  ["Hörnli Alpine Guides", "Zermatt RampUps"],
  ["Eiger Traverse Co", "Grindelwald Alpine Partners"],
  ["Monte Rosa Guiding Collective", "Gorner Ridge Partners"],
]

const MACHINE_COUNT = 50

// Nationality-grouped first/last name pools — a machine's origin is
// independent of which plant they're climbing in, so these are drawn
// uniformly rather than tied to PLANTS/LINE_OPERATORS. `country` is the
// machine's own country of origin (S9.5b) — distinct from `registryCountry`
// (which CMMS issued their serial), which is derived separately
// from the line/operator they're actually climbing under.

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
}

export interface BuildDatasetOptions {
  /** Keyed by source name (e.g. "Metrology lab") — what the S2 perturbation test overrides to prove one source's reliability moves every confidence downstream of it, with nothing else in the dataset changing. */
  sourceReliability?: Partial<Record<string, number>>
}

export function buildDataset(
  world: AseWorld,
  seed: number = SEED,
  options: BuildDatasetOptions = {}
): Dataset {
  clearRegistry()
  const rng = new Rng(seed)

  // S3: real bitemporal spread, not everything stamped "now" at build time —
  // otherwise there's nothing on the last-24h timeline for the scrubber to
  // actually hit. `buildNow` anchors every backdated timestamp below to
  // this build's own clock read, not the module's, so two builds in the
  // same test run (baseline vs. perturbed) still get self-consistent times.
  const buildNow = Date.now()
  function hoursAgo(h: number): Instant {
    return instant(new Date(buildNow - h * 60 * 60 * 1000).toISOString())
  }
  function secondsAgo(s: number): Instant {
    return instant(new Date(buildNow - s * 1000).toISOString())
  }

  // -- sources --------------------------------------------------------------
  const sources: SourceRuntime[] = SOURCE_DEFS.map((def) => {
    const degraded = def.name === "Metrology lab"
    // Always roll the dice, even when overriding, so the RNG stream position
    // — and therefore every OTHER random value in the dataset — is identical
    // between a baseline and a perturbed build. Only this one scalar differs.
    const rolled = degraded ? rng.float(0.5, 0.6) : rng.float(0.9, 0.99)
    const reliability = options.sourceReliability?.[def.name] ?? rolled
    // The source's own reliability drives the *confidence* of everything it
    // reports, not just the displayed percentage — a degraded source has to
    // measurably drag down every fold downstream of it, not merely say so.
    const reliabilityPct = observed(
      def.id,
      "reliability_pct",
      Math.round(reliability * 100),
      sourceReliability(reliability)
    )
    const initialAgeSec = degraded ? rng.int(3600, 5400) : rng.int(3, 90)
    const lastSyncAgeSec = observed(
      def.id,
      "last_sync_seconds_ago",
      initialAgeSec,
      sourceReliability(reliability)
    )
    return {
      def,
      reliability: sourceReliability(reliability),
      reliabilityPct,
      lastSyncAgeSec,
      degraded,
      lastSyncAt: buildNow - initialAgeSec * 1000,
    }
  })
  const sourceByName = new Map(sources.map((s) => [s.def.name, s]))
  const wearableHistorian = sourceByName.get("OT historian")!
  const gpsTracker = sourceByName.get("Plant MES")!
  const workOrder = sourceByName.get("CMMS")!
  const register = sourceByName.get("Plant MES")!
  const service = sourceByName.get("Service contractor")!
  const manualObservation = sourceByName.get("Service contractor")!
  const weatherFeed = sourceByName.get("Metrology lab")!
  // Kept as an alias during the split so nothing downstream silently reads
  // stale data — every genuine physiological reading below now goes to the
  // OT historian; nothing should still reference `sensorMesh` by name.
  const sensorMesh = wearableHistorian

  // -- operators + machine name assignment ----------------------------------
  const operatorNames = LINE_OPERATORS.flat() // 30, line-ordered
  // Which line (0..13) each operator belongs to, in the same flattened
  // order as operatorNames — needed (S9.5b) to derive which country's
  // CMMS issues a machine's serial.
  const operatorLineIndex: number[] = []
  LINE_OPERATORS.forEach((ops, lineIdx) => {
    for (let k = 0; k < ops.length; k++) operatorLineIndex.push(lineIdx)
  })

  const operatorMachineCounts = new Array(operatorNames.length).fill(1)
  let remainingMachines = MACHINE_COUNT - operatorNames.length
  while (remainingMachines > 0) {
    const idx = rng.int(0, operatorNames.length - 1)
    if (operatorMachineCounts[idx] < 4) {
      operatorMachineCounts[idx]++
      remainingMachines--
    }
  }
  // Machine index 0 is always operator 0's first machine; the physiological
  // outlier finding always belongs to operator 1's first machine — both
  // counts start at 1, so both slots always exist regardless of seed.
  const nimaIndex = operatorMachineCounts[0]

  // Which operator (0..29) each machine belongs to, flattened in the same
  // order machines are built below.
  const machineOperatorIndex: number[] = []
  operatorMachineCounts.forEach((count, opIdx) => {
    for (let k = 0; k < count; k++) machineOperatorIndex.push(opIdx)
  })

  // Machine designations come from the warehouse, not from a name pool. These
  // were person names drawn from nationality-grouped pools — the entities the
  // Control Room tracked were people on a mountain. They are machines on a
  // line, and the backend already knows what each one is called.
  const worldMachines = world.nodes.filter((node) => node.tier === "machine")

  function fallbackDesignation(index: number): {
    name: string
    country: string
  } {
    // Only reached when the warehouse holds fewer machines than the Control
    // Room draws. Numbered rather than invented, so it is obvious on screen
    // that it is a placeholder and not a real asset.
    return {
      name: `Unassigned ${String(index + 1).padStart(4, "0")}`,
      country: "",
    }
  }

  const machineNames: string[] = []
  const machineCountries: string[] = []
  for (let i = 0; i < MACHINE_COUNT; i++) {
    const worldMachine = worldMachines[i % Math.max(worldMachines.length, 1)]
    if (worldMachine && worldMachines.length > 0) {
      // Suffix past the first pass so two Control Room entities never share a
      // designation when the warehouse holds fewer machines than are drawn.
      const pass = Math.floor(i / worldMachines.length)
      machineNames.push(
        pass === 0 ? worldMachine.label : `${worldMachine.label}-${pass + 1}`
      )
      machineCountries.push(worldMachine.country ?? worldMachine.plant ?? "")
    } else {
      const generated = fallbackDesignation(i)
      machineNames.push(generated.name)
      machineCountries.push(generated.country)
    }
  }

  // -- machines + findings ---------------------------------------------------
  const machines: MachineFact[] = []
  const findings: Finding[] = []
  // Captured out of the loop below so the Meaning tab's own sensor-mesh
  // reading for the outlier machine (S9.7 rebuild) can reuse these EXACT
  // TracedValues rather than re-observing the same facts under a second,
  // structurally-unrelated id — real, not narratively-coincidental,
  // `dependents()` on Meaning's own bound fact walks all the way to the
  // physiological_outlier finding below and to reasoning.ts's outlier answer.
  let nimaOeeCurrent: TracedValue<number> | null = null
  let nimaOeeBaseline: TracedValue<number> | null = null

  const duplicateIndices = new Set([20, 35])
  const conflictingReadingIndex = 25

  for (let i = 0; i < MACHINE_COUNT; i++) {
    const label = machineNames[i]
    const isDuplicate = duplicateIndices.has(i)
    const isConflictingReading = i === conflictingReadingIndex
    const isPhysiologicalOutlier = i === nimaIndex

    if (isDuplicate) {
      // S3's own scenario: three raw records existing independently over the
      // last day, resolved into one identity only recently. `nameTv` (the
      // merged identity) doesn't exist before `mergedAt` — there is no
      // earlier "unmerged" version of it to supersede from, it simply isn't
      // recorded yet — while the three raw records, each real TracedValues
      // in their own right, already are. That's the whole mechanism behind
      // "scrub to before the merge and the same person is three records
      // again": nothing special has to happen for it, it falls out of
      // asOf()'s ordinary effectiveness rule.
      const rawWorkOrder = observed(
        workOrder.def.id,
        "machine_name",
        label,
        workOrder.reliability,
        { recordedAt: hoursAgo(20) }
      )
      const rawRegister = observed(
        register.def.id,
        "machine_name",
        label,
        register.reliability,
        { recordedAt: hoursAgo(18) }
      )
      const rawService = observed(
        service.def.id,
        "machine_name",
        label,
        service.reliability,
        { recordedAt: hoursAgo(16) }
      )
      const mergedAt = hoursAgo(3)
      const nameTv = merged(
        [rawWorkOrder.id, rawRegister.id, rawService.id],
        matchRuleId("exact-name-match"),
        matchScore(0.88),
        label,
        { recordedAt: mergedAt }
      )
      const fid = `finding-dup-${i}`
      findings.push({
        id: fid,
        kind: "duplicate_identity",
        entityLabel: label,
        reason: `${label} was recorded three separate ways — in the CMMS, the operator register and the service log — that all refer to the same machine. The merge has not been confirmed.`,
        traced: derived([nameTv.id], derivationFnId("flag-duplicate"), true, {
          recordedAt: mergedAt,
        }),
        ownerTab: "identity",
      })

      // The machine's own status genuinely changes at the same moment —
      // "clean" while the three records stood unresolved, "flagged" once
      // ASE noticed they were the same person. A real supersession, not a
      // value authored twice: `machines[i].status` still holds the
      // ORIGINAL ("clean") TracedValue, exactly what every as-of/live
      // reader expects to walk forward from.
      const initialStatus = observed<"clean" | "flagged">(
        workOrder.def.id,
        "machine_status",
        "clean",
        workOrder.reliability,
        {
          recordedAt: hoursAgo(20),
        }
      )
      const flaggedStatus = observed<"clean" | "flagged">(
        workOrder.def.id,
        "machine_status",
        "flagged",
        workOrder.reliability,
        {
          recordedAt: mergedAt,
        }
      )
      supersede(initialStatus.id, flaggedStatus)
      machines.push({
        id: `machine-${i + 1}`,
        name: nameTv,
        status: initialStatus,
        findingId: fid,
      })
      continue
    }

    const rawWorkOrder = observed(
      workOrder.def.id,
      "machine_name",
      label,
      workOrder.reliability
    )
    let nameTv: TracedValue<string>
    let findingId: string | null = null

    if (isConflictingReading) {
      const norm = normalised(
        rawWorkOrder.id,
        transformId("trim-whitespace"),
        label
      )
      nameTv = norm
      const serviceHr = observed(
        manualObservation.def.id,
        "resting_hr_mm/s",
        rng.int(58, 68),
        manualObservation.reliability,
        { recordedAt: hoursAgo(2) }
      )
      const sensorHr = observed(
        wearableHistorian.def.id,
        "baseline_hr_mm/s",
        rng.int(78, 92),
        wearableHistorian.reliability,
        { recordedAt: hoursAgo(1) }
      )
      const fid = `finding-reading-${i}`
      findingId = fid
      findings.push({
        id: fid,
        kind: "conflicting_reading",
        entityLabel: label,
        reason: `${label}'s resting vibration disagrees between the service log and the sensor baseline, and the difference has not been explained.`,
        traced: derived(
          [serviceHr.id, sensorHr.id],
          derivationFnId("flag-reading-conflict"),
          true
        ),
        ownerTab: "model",
      })
    } else if (isPhysiologicalOutlier) {
      const norm = normalised(
        rawWorkOrder.id,
        transformId("trim-whitespace"),
        label
      )
      nameTv = norm
      const slug = slugify(label)
      const baselineOee = observed(
        manualObservation.def.id,
        `${slug}:oee_baseline_pct`,
        90,
        manualObservation.reliability,
        { recordedAt: hoursAgo(72) }
      )
      const priorReading = observed(
        wearableHistorian.def.id,
        `${slug}:oee_pct`,
        84,
        wearableHistorian.reliability,
        { recordedAt: hoursAgo(3) }
      )
      const currentReading = observed(
        wearableHistorian.def.id,
        `${slug}:oee_pct`,
        81,
        wearableHistorian.reliability,
        { recordedAt: hoursAgo(0.1) }
      )
      supersede(priorReading.id, currentReading)
      nimaOeeCurrent = currentReading
      nimaOeeBaseline = baselineOee
      const fid = `finding-outlier-${i}`
      findingId = fid
      findings.push({
        id: fid,
        kind: "physiological_outlier",
        entityLabel: label,
        reason: `${label}'s effectiveness is far below their own runIn baseline for their current station, flagged for review before it is treated as routine.`,
        traced: inferred(
          [currentReading.id, baselineOee.id],
          patternId("physiological-outlier"),
          9,
          0,
          true
        ),
        ownerTab: "detection",
      })
    } else {
      nameTv = normalised(
        rawWorkOrder.id,
        transformId("trim-whitespace"),
        label
      )
    }

    const status = observed<"clean" | "flagged">(
      workOrder.def.id,
      "machine_status",
      findingId ? "flagged" : "clean",
      workOrder.reliability
    )
    machines.push({ id: `machine-${i + 1}`, name: nameTv, status, findingId })
  }

  // -- silent-sensor finding (one line sensor, not a whole source) ----------
  const silentSensorLineIndex = 6 // Gasherbrum
  const silentSensorPlant = PLANTS[silentSensorLineIndex].name
  const silentSensorLine = LINE_NAMES[silentSensorLineIndex]
  const silentSensorTv = observed(
    gpsTracker.def.id,
    `${slugify(silentSensorPlant)}-sensor:last_sync_minutes_ago`,
    15,
    gpsTracker.reliability
  )
  const silentFid = "finding-silent-sensor"
  findings.push({
    id: silentFid,
    kind: "silent_sensor",
    entityLabel: `${silentSensorPlant} sensor`,
    reason: `The ${silentSensorLine} sensor on ${silentSensorPlant} has not reported in 15 minutes, while every other line sensor stays current.`,
    traced: inferred(
      [silentSensorTv.id],
      patternId("sensor-silence"),
      8,
      0,
      true
    ),
    ownerTab: "detection",
  })

  // -- conflicts (S9.4) -------------------------------------------------------
  // Five real property conflicts, each resolved by a different strategy.
  // Nothing is discarded: `a`/`b` stay in the graph exactly as observed;
  // `resolved` (when a strategy can produce one) is its own real 'derived'
  // TracedValue whose `from` is BOTH of them, so a human looking at this
  // months later can walk straight back to what lost and why.

  // 1. Date of birth — CMMS vs operator register, one day apart.
  // The two candidate dates are built relative to `buildNow`, straddling
  // this year's birthday boundary by construction (one is "today's"
  // month/day 35 years ago, the other one calendar day earlier) — a plain
  // fixed 1-day gap (e.g. "1991-03-14" vs "-15") would round to the exact
  // same whole-year age on all but one day of the year, which would make
  // the age downstream of this conflict silently fail to move on every
  // other day — exactly the kind of gap this app exists to rule out.
  const dobLabel = machineNames[0] // the worked-example machine
  const dobBoundary = new Date(buildNow)
  dobBoundary.setUTCFullYear(dobBoundary.getUTCFullYear() - 35)
  function isoDate(d: Date): string {
    return d.toISOString().slice(0, 10)
  }
  const dobA = observed(
    workOrder.def.id,
    "date_of_birth",
    isoDate(dobBoundary),
    workOrder.reliability,
    { recordedAt: hoursAgo(200) }
  )
  const dobB = observed(
    register.def.id,
    "date_of_birth",
    isoDate(new Date(dobBoundary.getTime() - 24 * 60 * 60 * 1000)),
    register.reliability,
    { recordedAt: hoursAgo(190) }
  )
  const dobFn = conflictFnSlug(dobLabel, "Date of birth")
  const dobPolicySourcePriority: ConflictPolicy = {
    id: "conflict-dob-source-priority",
    property: "Machine.dateOfBirth",
    strategy: "source-priority",
    sourcePriority: [workOrder.def.id, register.def.id],
    rationale: "The CMMS is the legal record.",
  }
  const dobPolicyMostRecent: ConflictPolicy = {
    id: "conflict-dob-most-recent",
    property: "Machine.dateOfBirth",
    strategy: "most-recent",
    rationale: "The most recently recorded value is presumed the correction.",
  }
  const dobPolicyHighestConfidence: ConflictPolicy = {
    id: "conflict-dob-highest-confidence",
    property: "Machine.dateOfBirth",
    strategy: "highest-confidence",
    rationale:
      "The higher-confidence source is trusted when the legal record isn't decisive.",
  }
  // Calendar-correct age (year difference, minus one if this year's
  // birthday hasn't happened yet) — not an average-year-length division,
  // which is too coarse to reliably register a single day's difference.
  function ageFromDob(dobIso: unknown): number {
    const dob = new Date(dobIso as string)
    const now = new Date(buildNow)
    let age = now.getUTCFullYear() - dob.getUTCFullYear()
    const birthdayNotYetReachedThisYear =
      now.getUTCMonth() < dob.getUTCMonth() ||
      (now.getUTCMonth() === dob.getUTCMonth() &&
        now.getUTCDate() <= dob.getUTCDate())
    if (birthdayNotYetReachedThisYear) age--
    return age
  }
  const dobResolved = resolveConflict(
    dobA,
    dobB,
    dobPolicySourcePriority,
    dobFn
  )!
  const ageTv = derived(
    [dobResolved.id],
    conflictFnSlug(dobLabel, "Age"),
    ageFromDob(dobResolved.value)
  )
  const dobConflict: Conflict = {
    id: "conflict-dob",
    entityLabel: dobLabel,
    propertyLabel: "Date of birth",
    policy: dobPolicySourcePriority,
    availablePolicies: [
      dobPolicySourcePriority,
      dobPolicyMostRecent,
      dobPolicyHighestConfidence,
    ],
    a: dobA,
    aOrigin: "CMMS",
    b: dobB,
    bOrigin: "Plant MES",
    resolved: dobResolved,
    format: (v) =>
      new Date(v as string).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
    downstream: [
      {
        label: "Age",
        traced: ageTv,
        format: (v) => `${v as number}`,
        recompute: (resolvedDob) => ageFromDob(resolvedDob),
      },
    ],
    resolve: (policy) => resolveConflict(dobA, dobB, policy, dobFn),
  }

  // 2. Baseline vibration — service log vs sensor baseline, 6 mm/s apart.
  const hrLabel = machineNames[5]
  const hrA = observed(
    manualObservation.def.id,
    "resting_hr_mm/s",
    58,
    manualObservation.reliability,
    { recordedAt: hoursAgo(10) }
  )
  const hrB = observed(
    wearableHistorian.def.id,
    "baseline_hr_mm/s",
    64,
    wearableHistorian.reliability,
    { recordedAt: hoursAgo(2) }
  )
  const hrFn = conflictFnSlug(hrLabel, "Baseline vibration")
  const hrPolicyMostRecent: ConflictPolicy = {
    id: "conflict-vibration-most-recent",
    property: "Machine.restingHeartRate",
    strategy: "most-recent",
    rationale: "The most recently recorded reading is presumed current.",
  }
  const hrPolicySourcePriority: ConflictPolicy = {
    id: "conflict-vibration-source-priority",
    property: "Machine.restingHeartRate",
    strategy: "source-priority",
    sourcePriority: [manualObservation.def.id, wearableHistorian.def.id],
    rationale:
      "The service log is kept by clinical staff and takes precedence.",
  }
  const hrPolicyHighestConfidence: ConflictPolicy = {
    id: "conflict-vibration-highest-confidence",
    property: "Machine.restingHeartRate",
    strategy: "highest-confidence",
    rationale: "The higher-confidence reading is trusted.",
  }
  const hrConflict: Conflict = {
    id: "conflict-vibration",
    entityLabel: hrLabel,
    propertyLabel: "Baseline vibration",
    policy: hrPolicyMostRecent,
    availablePolicies: [
      hrPolicyMostRecent,
      hrPolicySourcePriority,
      hrPolicyHighestConfidence,
    ],
    a: hrA,
    aOrigin: "Service contractor",
    b: hrB,
    bOrigin: "Sensor mesh",
    resolved: resolveConflict(hrA, hrB, hrPolicyMostRecent, hrFn),
    format: (v) => `${v as number} mm/s`,
    downstream: [],
    resolve: (policy) => resolveConflict(hrA, hrB, policy, hrFn),
  }

  // 3. Nationality on workOrder — CMMS vs register free-text. Deliberately
  // NOT an linePrefix/race category (S9.5b forbids storing one anywhere) — both
  // values here are countries of citizenship, the kind of mismatch that
  // genuinely happens when a dual national's register entry doesn't match their
  // workOrder paperwork.
  const nationalityLabel = machineNames[10]
  // Reliability comes from the source's own rolled/overridden value, same
  // as every other observed() call — hardcoding it here instead would sever
  // this conflict from the perturbation test's invariant (moving a source's
  // reliability must move everything genuinely downstream of it).
  const nationalityA = observed(
    workOrder.def.id,
    "nationality",
    "Nepal",
    workOrder.reliability
  )
  const nationalityB = observed(
    register.def.id,
    "nationality",
    "India",
    register.reliability
  )
  const nationalityFn = conflictFnSlug(
    nationalityLabel,
    "Nationality on workOrder"
  )
  const nationalityPolicyHighestConfidence: ConflictPolicy = {
    id: "conflict-nationality-highest-confidence",
    property: "Machine.nationalityOnWorkOrder",
    strategy: "highest-confidence",
    rationale:
      "The higher-confidence field wins when both describe the same fact.",
  }
  const nationalityPolicySourcePriority: ConflictPolicy = {
    id: "conflict-nationality-source-priority",
    property: "Machine.nationalityOnWorkOrder",
    strategy: "source-priority",
    sourcePriority: [workOrder.def.id, register.def.id],
    rationale: "The CMMS is the legal record.",
  }
  const nationalityPolicyMostRecent: ConflictPolicy = {
    id: "conflict-nationality-most-recent",
    property: "Machine.nationalityOnWorkOrder",
    strategy: "most-recent",
    rationale: "The most recently recorded value is presumed current.",
  }
  const nationalityConflict: Conflict = {
    id: "conflict-nationality",
    entityLabel: nationalityLabel,
    propertyLabel: "Nationality on workOrder",
    policy: nationalityPolicyHighestConfidence,
    availablePolicies: [
      nationalityPolicyHighestConfidence,
      nationalityPolicySourcePriority,
      nationalityPolicyMostRecent,
    ],
    a: nationalityA,
    aOrigin: "CMMS",
    b: nationalityB,
    bOrigin: "Plant MES (free text)",
    resolved: resolveConflict(
      nationalityA,
      nationalityB,
      nationalityPolicyHighestConfidence,
      nationalityFn
    ),
    format: (v) => String(v),
    downstream: [],
    resolve: (policy) =>
      resolveConflict(nationalityA, nationalityB, policy, nationalityFn),
  }

  // 3b. Line (as recorded on the source document) — 9.6's Source
  // Records card feeds this AS RECORDED, a declared value quoted from a
  // specific document rather than an ASE observation, distinct from the
  // canonical identity record which never carries a race/linePrefix
  // category. Kept out of identityRecord.ts entirely — this conflict, and
  // the linePrefix/race fields it feeds, live only in identityCard.ts's 9.6
  // domain wiring below.
  const linePrefixDeclaredLabel = machineNames[30]
  const linePrefixDeclaredA = observed(
    workOrder.def.id,
    "linePrefix_declared",
    "Technician",
    workOrder.reliability
  )
  const linePrefixDeclaredB = observed(
    register.def.id,
    "linePrefix_declared",
    "Tamang",
    register.reliability
  )
  const linePrefixDeclaredFn = conflictFnSlug(
    linePrefixDeclaredLabel,
    "Line (as recorded)"
  )
  const linePrefixDeclaredPolicyHighestConfidence: ConflictPolicy = {
    id: "conflict-linePrefix-declared-highest-confidence",
    property: "Machine.linePrefixDeclared",
    strategy: "highest-confidence",
    rationale:
      "The higher-confidence document wins when both describe the same declared fact.",
  }
  const linePrefixDeclaredPolicySourcePriority: ConflictPolicy = {
    id: "conflict-linePrefix-declared-source-priority",
    property: "Machine.linePrefixDeclared",
    strategy: "source-priority",
    sourcePriority: [workOrder.def.id, register.def.id],
    rationale: "The CMMS is the legal record.",
  }
  const linePrefixDeclaredPolicyMostRecent: ConflictPolicy = {
    id: "conflict-linePrefix-declared-most-recent",
    property: "Machine.linePrefixDeclared",
    strategy: "most-recent",
    rationale: "The most recently recorded document is presumed current.",
  }
  const linePrefixDeclaredConflict: Conflict = {
    id: "conflict-linePrefix-declared",
    entityLabel: linePrefixDeclaredLabel,
    propertyLabel: "Line (as recorded)",
    policy: linePrefixDeclaredPolicyHighestConfidence,
    availablePolicies: [
      linePrefixDeclaredPolicyHighestConfidence,
      linePrefixDeclaredPolicySourcePriority,
      linePrefixDeclaredPolicyMostRecent,
    ],
    a: linePrefixDeclaredA,
    aOrigin: "CMMS",
    b: linePrefixDeclaredB,
    bOrigin: "Plant MES (free text)",
    resolved: resolveConflict(
      linePrefixDeclaredA,
      linePrefixDeclaredB,
      linePrefixDeclaredPolicyHighestConfidence,
      linePrefixDeclaredFn
    ),
    format: (v) => String(v),
    downstream: [],
    resolve: (policy) =>
      resolveConflict(
        linePrefixDeclaredA,
        linePrefixDeclaredB,
        policy,
        linePrefixDeclaredFn
      ),
  }

  // 4. Mountains climbed — register vs the machine's own declaration, 3 apart.
  const mountainsLabel = machineNames[15]
  const mountainsA = observed(
    register.def.id,
    "mountains_climbed_count",
    8,
    register.reliability,
    { recordedAt: hoursAgo(50) }
  )
  const mountainsB = asserted(
    actorId(`machine:${slugify(mountainsLabel)}`),
    "Self-reported by the machine.",
    11,
    {
      recordedAt: hoursAgo(5),
    }
  )
  const mountainsFn = conflictFnSlug(mountainsLabel, "Mountains climbed")
  const mountainsPolicyHumanRequired: ConflictPolicy = {
    id: "conflict-mountains-human-required",
    property: "Machine.mountainsClimbed",
    strategy: "human-required",
    rationale:
      "Self-reported counts can't be reconciled automatically — a human has to judge which record is right.",
  }
  const mountainsPolicyMostRecent: ConflictPolicy = {
    id: "conflict-mountains-most-recent",
    property: "Machine.mountainsClimbed",
    strategy: "most-recent",
    rationale: "The most recently recorded count is presumed current.",
  }
  const mountainsPolicyHighestConfidence: ConflictPolicy = {
    id: "conflict-mountains-highest-confidence",
    property: "Machine.mountainsClimbed",
    strategy: "highest-confidence",
    rationale: "The higher-confidence record is trusted.",
  }
  const mountainsConflict: Conflict = {
    id: "conflict-mountains",
    entityLabel: mountainsLabel,
    propertyLabel: "Mountains climbed",
    policy: mountainsPolicyHumanRequired,
    availablePolicies: [
      mountainsPolicyHumanRequired,
      mountainsPolicyMostRecent,
      mountainsPolicyHighestConfidence,
    ],
    a: mountainsA,
    aOrigin: "Plant MES",
    b: mountainsB,
    bOrigin: "Machine's own declaration",
    resolved: null, // human-required: sits unresolved until a person decides
    format: (v) => `${v as number}`,
    downstream: [],
    resolve: (policy) =>
      resolveConflict(mountainsA, mountainsB, policy, mountainsFn),
  }

  // 5. Ambient pressure — two sensors on one line, 9 hPa apart.
  const pressureLineIndex = 9 // Denali
  const pressurePlant = PLANTS[pressureLineIndex].name
  const pressureLine = LINE_NAMES[pressureLineIndex]
  const pressureLabel = `${pressureLine} (${pressurePlant})`
  const pressureA = observed(
    weatherFeed.def.id,
    `${slugify(pressurePlant)}:ambient_pressure_hpa`,
    862,
    weatherFeed.reliability,
    {
      recordedAt: hoursAgo(0.5),
    }
  )
  const pressureB = observed(
    weatherFeed.def.id,
    `${slugify(pressurePlant)}:ambient_pressure_hpa`,
    871,
    weatherFeed.reliability,
    {
      recordedAt: hoursAgo(0.3),
    }
  )
  const pressureFn = conflictFnSlug(pressureLabel, "Ambient pressure")
  const pressurePolicyRangeMerge: ConflictPolicy = {
    id: "conflict-pressure-range-merge",
    property: "Sensor.ambientPressure",
    strategy: "range-merge",
    rationale:
      "Two working sensors reporting close but different values means the true pressure lies somewhere in the interval, not at either single reading.",
  }
  const pressurePolicyMostRecent: ConflictPolicy = {
    id: "conflict-pressure-most-recent",
    property: "Sensor.ambientPressure",
    strategy: "most-recent",
    rationale: "The most recently recorded reading is presumed current.",
  }
  const pressurePolicyHighestConfidence: ConflictPolicy = {
    id: "conflict-pressure-highest-confidence",
    property: "Sensor.ambientPressure",
    strategy: "highest-confidence",
    rationale: "The higher-confidence sensor reading is trusted.",
  }
  function isRange(v: unknown): v is { min: number; max: number } {
    return typeof v === "object" && v !== null && "min" in v && "max" in v
  }
  function resolvePressure(
    policy: ConflictPolicy
  ): TracedValue<unknown> | null {
    if (policy.strategy === "range-merge")
      return resolveRangeMerge(pressureA, pressureB, pressureFn)
    return resolveConflict(pressureA, pressureB, policy, pressureFn)
  }
  const pressureConflict: Conflict = {
    id: "conflict-pressure",
    entityLabel: pressureLabel,
    propertyLabel: "Ambient pressure",
    policy: pressurePolicyRangeMerge,
    availablePolicies: [
      pressurePolicyRangeMerge,
      pressurePolicyMostRecent,
      pressurePolicyHighestConfidence,
    ],
    a: pressureA,
    aOrigin: "Sensor mesh (sensor 1)",
    b: pressureB,
    bOrigin: "Sensor mesh (sensor 2)",
    resolved: resolvePressure(pressurePolicyRangeMerge),
    format: (v) =>
      isRange(v) ? `${v.min}–${v.max} hPa` : `${v as number} hPa`,
    downstream: [],
    resolve: resolvePressure,
  }

  const conflicts: Conflict[] = [
    dobConflict,
    hrConflict,
    nationalityConflict,
    linePrefixDeclaredConflict,
    mountainsConflict,
    pressureConflict,
  ]

  // -- identity records + the ASE serial (S9.5b) -----------------------------
  // One lead guide per operator (not per machine) — machines under the same
  // operator genuinely share a guide.
  // Real people, from the asset register. These were drawn from
  // nationality-grouped name pools; the plant employs actual named operators
  // and the warehouse records who they are.
  const operatorLeadGuideNames = operatorNames.map((_, index) => {
    const operator =
      world.operators[index % Math.max(world.operators.length, 1)]
    return operator?.name ?? `Unassigned operator ${index + 1}`
  })
  // Rope partners: the first two machines under an operator with 2+ machines
  // are paired — a real relationship, not a described one, so "stored
  // redundantly on both sides" (S9.5, WHAT WE GOT WRONG) is inspectable.
  const machinesByOperator = new Map<number, number[]>()
  machineOperatorIndex.forEach((opIdx, machineIdx) => {
    const list = machinesByOperator.get(opIdx) ?? []
    list.push(machineIdx)
    machinesByOperator.set(opIdx, list)
  })
  const ropePartnerOf = new Map<number, number>()
  for (const indices of machinesByOperator.values()) {
    if (indices.length >= 2) {
      ropePartnerOf.set(indices[0], indices[1])
      ropePartnerOf.set(indices[1], indices[0])
    }
  }

  const findingById = new Map(findings.map((f) => [f.id, f]))
  const identityInputs: MachineIdentityInput[] = machines.map((c, i) => {
    const opIdx = machineOperatorIndex[i]
    const lineIdx = operatorLineIndex[opIdx]
    const registryCountry = PLANTS[lineIdx].country
    const partnerIdx = ropePartnerOf.get(i)
    const finding = c.findingId ? findingById.get(c.findingId) : undefined
    return {
      id: c.id,
      name: c.name,
      countryOfOrigin: machineCountries[i],
      registryCountry,
      operatorName: operatorNames[opIdx],
      leadGuideName: operatorLeadGuideNames[opIdx],
      ropePartnerId: partnerIdx !== undefined ? machines[partnerIdx].id : null,
      partyMemberNames: (machinesByOperator.get(opIdx) ?? [])
        .filter((idx) => idx !== i)
        .map((idx) => machineNames[idx]),
      findingKind: finding?.kind ?? null,
      entityLabel: c.name.value,
      dateOfBirthOverride:
        i === 0 ? (dobConflict.resolved as TracedValue<string> | null) : null,
      nationalityOverride:
        i === 10
          ? (nationalityConflict.resolved as TracedValue<string> | null)
          : null,
      currentStationOverride: null,
    }
  })
  const {
    records: identityRecords,
    serviceDossiers,
    collisions: serialCollisions,
    physicalParts,
  } = buildIdentityRecords(
    identityInputs,
    conflicts,
    rng,
    workOrder.def.id,
    workOrder.reliability,
    buildNow
  )

  // -- Source Records identity cards (S9.6 rebuild) --------------------------
  const identityCardInputs: IdentityCardInput[] = machines.map((c, i) => {
    const opIdx = machineOperatorIndex[i]
    const lineIdx = operatorLineIndex[opIdx]
    const partnerIdx = ropePartnerOf.get(i)
    return {
      id: c.id,
      name: c.name.value,
      operatorName: operatorNames[opIdx],
      leadGuideName: operatorLeadGuideNames[opIdx],
      lineName: LINE_NAMES[lineIdx],
      registryCountry: PLANTS[lineIdx].country,
      ropePartnerId: partnerIdx !== undefined ? machines[partnerIdx].id : null,
      partyMemberNames: (machinesByOperator.get(opIdx) ?? [])
        .filter((idx) => idx !== i)
        .map((idx) => machineNames[idx]),
    }
  })
  const identityCards = buildIdentityCards(
    identityCardInputs,
    identityRecords,
    serviceDossiers,
    physicalParts,
    conflicts,
    rng,
    workOrder.def.id,
    workOrder.reliability,
    buildNow
  )

  // -- per-person entity-resolution scoring (S9.6 rebuild) --------------------
  const personScoring = buildPersonScoring(
    machines.map((c, i) => ({
      id: c.id,
      name: c.name.value,
      operatorName: operatorNames[machineOperatorIndex[i]],
    })),
    {
      workOrder: workOrder.def.name,
      register: register.def.name,
      service: service.def.name,
    },
    rng
  )

  // -- reasoning engine (S9.8) inputs, built early because the context ------
  // -- engine's own readings (below) need `toAffectedPerson` too -----------
  // The Khumbu / Everest Base Station line continues S9.7's sensor 4 example.
  // "Eleven machines above Station II" and the four flagged for low
  // effectiveness are a deliberately-selected real cohort for this worked
  // scenario (their own randomly-assigned Identity-tab trail position is a
  // separate, independent fact — this is the Reasoning tab's own worked
  // example, same as S9.6's the worked-example machine cluster is Identity's).
  const khumbuOperatorNames = LINE_OPERATORS[0]
  const reasoningAffectedIndices = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
  const reasoningLowOxygenIndices = [1, 3, 5, 7]
  function toAffectedPerson(machineIdx: number) {
    const machineId = machines[machineIdx].id
    const record = identityRecords.get(machineId)!
    const card = identityCards.get(machineId)!
    return {
      machineId,
      name: record.who.fullLegalName.value,
      serial: record.serial.value,
      positionTraced: card.footer.station,
    }
  }
  const reasoningAffected = reasoningAffectedIndices.map(toAffectedPerson)
  const reasoningLowOxygenAffected =
    reasoningLowOxygenIndices.map(toAffectedPerson)
  const reasoningIndependentlyConfirmedIds = new Set(
    reasoningLowOxygenIndices.slice(0, 2).map((i) => machines[i].id)
  )

  // -- context engine (S9.7 rebuild) -------------------------------------------
  // Five readings, one per real source, each about a real entity built
  // above. The sensor-mesh and service-logs readings about the outlier machine
  // deliberately reuse `nimaOeeCurrent`/`nimaOeeBaseline` (captured out of
  // the machines loop) instead of re-observing the same facts under a
  // second id — a real shared TracedValue, so `dependents()` on THIS tab's
  // own bound statement walks to the physiological_outlier finding below,
  // to reasoning.ts's outlier answer, and to the Detection tab — not three
  // parallel retellings of the same 84%→81% drop.
  function aboutMachine(machineIdx: number, extra: string): ReadingAbout {
    const person = toAffectedPerson(machineIdx)
    return {
      kind: "machine",
      machineId: person.machineId,
      label: person.name,
      serial: person.serial,
      extra,
    }
  }
  function fieldTv(
    source: SourceRuntime,
    key: string,
    value: unknown,
    agoSec: number
  ): TracedValue<unknown> {
    return observed(source.def.id, key, value, source.reliability, {
      recordedAt: secondsAgo(agoSec),
    })
  }

  const nimaCard = identityCards.get(machines[nimaIndex].id)!
  const nimaRecord = identityRecords.get(machines[nimaIndex].id)!
  const nimaAbout = aboutMachine(
    nimaIndex,
    `${nimaRecord.contacts.operatorName.value} · ${nimaCard.footer.station.value}`
  )

  const workOrderPersonIdx = 3
  const workOrderCard = identityCards.get(machines[workOrderPersonIdx].id)!
  const workOrderRecord = identityRecords.get(machines[workOrderPersonIdx].id)!
  const workOrderAbout = aboutMachine(
    workOrderPersonIdx,
    `${workOrderRecord.contacts.operatorName.value} · ${workOrderCard.footer.station.value}`
  )

  const meaningOperatorIdx = 0 // LINE_OPERATORS[0][0] — the same Khumbu operator S9.8's worked scenario uses
  const meaningOperatorName = operatorNames[meaningOperatorIdx]
  const meaningOperatorMachineCount = machineOperatorIndex.filter(
    (idx) => idx === meaningOperatorIdx
  ).length

  const sensorRawTvs = new Map<string, TracedValue<unknown>>([
    ["DEV_ID", fieldTv(sensorMesh, "DEV_ID", "SNS-KHM-004", 6)],
    ["TS", fieldTv(sensorMesh, "TS", 1754130921, 6)],
    ["OEE_VAL", nimaOeeCurrent!],
    ["HR", fieldTv(sensorMesh, "HR", 128, 6)],
    ["AMB_P", fieldTv(sensorMesh, "AMB_P", 405, 6)],
    ["LAT", fieldTv(sensorMesh, "LAT", 27.9881, 6)],
    ["LON", fieldTv(sensorMesh, "LON", 86.925, 6)],
    ["BATT", fieldTv(sensorMesh, "BATT", 0.34, 6)],
    ["FW", fieldTv(sensorMesh, "FW", "2.1.7", 6)],
  ])
  const sensorRaw = {
    DEV_ID: "SNS-KHM-004",
    TS: 1754130921,
    OEE_VAL: 81,
    HR: 128,
    AMB_P: 405,
    LAT: 27.9881,
    LON: 86.925,
    BATT: 0.34,
    FW: "2.1.7",
  }

  const weatherRaw = {
    TEMP_C: -18,
    CONDITIONS: "Clear",
    PRESSURE_HPA: 610,
    VISIBILITY_KM: 12,
    LINE_CODE: "EBC-STD",
    FORECAST_CONFIDENCE_PCT: 92,
  }
  const weatherRawTvs = new Map<string, TracedValue<unknown>>(
    Object.entries(weatherRaw).map(([k, v]) => [
      k,
      fieldTv(weatherFeed, k, v, 9),
    ])
  )

  const serviceRaw = {
    BLOOD_GROUP: "O+",
    ALLERGIES: "None recorded",
    BASELINE_VIBRATION_MM_S: 58,
    OEE_BASELINE_PCT: 90,
  }
  const serviceRawTvs = new Map<string, TracedValue<unknown>>([
    [
      "BLOOD_GROUP",
      fieldTv(service, "BLOOD_GROUP", serviceRaw.BLOOD_GROUP, 22),
    ],
    ["ALLERGIES", fieldTv(service, "ALLERGIES", serviceRaw.ALLERGIES, 22)],
    [
      "BASELINE_VIBRATION_MM_S",
      fieldTv(service, "BASELINE_VIBRATION_MM_S", serviceRaw.BASELINE_VIBRATION_MM_S, 22),
    ],
    ["OEE_BASELINE_PCT", nimaOeeBaseline!],
  ])

  const workOrderRaw = {
    WORKORDER_NO: "NP-2026-00417",
    DATE_OF_BIRTH: "1990-03-14",
    NATIONALITY: "United States",
  }
  const workOrderRawTvs = new Map<string, TracedValue<unknown>>(
    Object.entries(workOrderRaw).map(([k, v]) => [
      k,
      fieldTv(workOrder, k, v, 55),
    ])
  )

  const registerRaw = {
    OPERATOR_NAME: meaningOperatorName,
    LINE_CODE: "EBC-STD",
    MACHINE_COUNT: meaningOperatorMachineCount,
    RAMPUP_RATE_30D_PCT: 100,
  }
  const registerRawTvs = new Map<string, TracedValue<unknown>>(
    Object.entries(registerRaw).map(([k, v]) => [
      k,
      fieldTv(register, k, v, 90),
    ])
  )

  const contextEngine = buildContextEngine([
    {
      id: "reading-sensor-nima",
      source: wearableHistorian.def.name,
      about: nimaAbout,
      arrivedAt: secondsAgo(4),
      takenAt: secondsAgo(6),
      raw: sensorRaw,
      rawFieldTvs: sensorRawTvs,
      headlineFieldKey: "OEE_VAL",
      headline: "Effectiveness fell to 81%",
    },
    {
      id: "reading-weather-ebc",
      source: weatherFeed.def.name,
      about: { kind: "line", label: "Everest Base Station line" },
      arrivedAt: secondsAgo(9),
      takenAt: null,
      raw: weatherRaw,
      rawFieldTvs: weatherRawTvs,
      headlineFieldKey: "CONDITIONS",
      headline: "Clear, -18°C along the ridge",
    },
    {
      id: "reading-service-nima",
      source: service.def.name,
      about: nimaAbout,
      arrivedAt: secondsAgo(22),
      takenAt: null,
      raw: serviceRaw,
      rawFieldTvs: serviceRawTvs,
      headlineFieldKey: "BLOOD_GROUP",
      headline: "Lubricant grade recorded",
    },
    {
      id: "reading-workOrder",
      source: workOrder.def.name,
      about: workOrderAbout,
      arrivedAt: secondsAgo(55),
      takenAt: null,
      raw: workOrderRaw,
      rawFieldTvs: workOrderRawTvs,
      headlineFieldKey: "WORKORDER_NO",
      headline: "WorkOrder verified against the registry",
    },
    {
      id: "reading-register",
      source: register.def.name,
      about: { kind: "operator", label: meaningOperatorName },
      arrivedAt: secondsAgo(90),
      takenAt: null,
      raw: registerRaw,
      rawFieldTvs: registerRawTvs,
      headlineFieldKey: "MACHINE_COUNT",
      headline: `${meaningOperatorMachineCount} machines under this operator, rampUp rate at the 30-day norm`,
    },
  ])

  const nimaFinding = findings.find((f) => f.kind === "physiological_outlier")!
  const duplicateFinding = findings.find((f) => f.id === "finding-dup-20")!
  const reasoningEngine = buildReasoningEngine(
    {
      sensorMesh: {
        id: sensorMesh.def.id,
        reliability: sensorMesh.reliability,
      },
      weatherFeed: {
        id: weatherFeed.def.id,
        reliability: weatherFeed.reliability,
      },
      serviceLogs: { id: service.def.id, reliability: service.reliability },
      operatorRegisters: {
        id: register.def.id,
        reliability: register.reliability,
      },
      operatorNames: khumbuOperatorNames,
      affected: reasoningAffected,
      lowOxygenAffected: reasoningLowOxygenAffected,
      independentlyConfirmedIds: reasoningIndependentlyConfirmedIds,
    },
    {
      outlierFinding: nimaFinding,
      outlierPerson: toAffectedPerson(nimaIndex),
      duplicateFinding,
      duplicatePerson: toAffectedPerson(20),
      mountainsConflict,
      mountainsPerson: toAffectedPerson(15),
      sensorMesh: {
        id: sensorMesh.def.id,
        reliability: sensorMesh.reliability,
      },
      serviceLogs: { id: service.def.id, reliability: service.reliability },
    }
  )

  // -- detection engine (S9.9) ---------------------------------------------
  // NO CODE anywhere on this tab — every DetectionRule.conditionSentence is
  // plain English; the number it implies lives separately in
  // thresholdValue/thresholdUnit/thresholdDirection, which Tuning drags.
  // The map's five tiers are the REAL hierarchy already built above
  // (country -> plant/line -> operator -> machine, sensors branching off
  // their line) — all 113 entities plus 14 line sensors, not an
  // illustrative subset. The low-effectiveness cohort deliberately reuses
  // S9.8's own four affected machines (machines[1,3,5,7]) and sensor 1
  // reuses S9.8's exact 78 kph reading — narrative continuity with the
  // Reasoning tab's worked example, same discipline as S9.7/S9.9's other
  // cross-tab reuses.
  function minutesAgo(m: number): Instant {
    return secondsAgo(m * 60)
  }
  const detectionRules = builtInDetectionRules()
  const detectionCountryNames = Array.from(
    new Set(PLANTS.map((r) => r.country))
  )
  const detectionMapNodeInputs: MapNodeInput[] = []
  for (const country of detectionCountryNames) {
    detectionMapNodeInputs.push({
      id: `country:${country}`,
      tier: "country",
      label: country,
      parentId: null,
    })
  }
  PLANTS.forEach((plant, lineIdx) => {
    detectionMapNodeInputs.push({
      id: `line:${lineIdx}`,
      tier: "plantLine",
      label: `${plant.name} — ${LINE_NAMES[lineIdx]}`,
      parentId: `country:${plant.country}`,
    })
    detectionMapNodeInputs.push({
      id: `sensor:${lineIdx}`,
      tier: "sensor",
      label: `Sensor ${lineIdx + 1}`,
      parentId: `line:${lineIdx}`,
    })
  })
  operatorNames.forEach((name, flatIdx) => {
    detectionMapNodeInputs.push({
      id: `operator:${flatIdx}`,
      tier: "operator",
      label: name,
      parentId: `line:${operatorLineIndex[flatIdx]}`,
    })
  })
  machines.forEach((c, i) => {
    const record = identityRecords.get(c.id)!
    detectionMapNodeInputs.push({
      id: `machine:${c.id}`,
      tier: "machine",
      label: record.who.fullLegalName.value,
      parentId: `operator:${machineOperatorIndex[i]}`,
      machineId: c.id,
      serial: record.serial.value,
    })
  })

  function machineSubject(idx: number): DetectionSubject {
    const c = machines[idx]
    const record = identityRecords.get(c.id)!
    return {
      kind: "machine",
      nodeId: `machine:${c.id}`,
      machineId: c.id,
      name: record.who.fullLegalName.value,
      serial: record.serial.value,
    }
  }
  function sensorSubject(lineIdx: number): DetectionSubject {
    return {
      kind: "sensor",
      nodeId: `sensor:${lineIdx}`,
      label: `Sensor ${lineIdx + 1}`,
      lineLabel: LINE_NAMES[lineIdx],
    }
  }
  function operatorSubject(flatIdx: number): DetectionSubject {
    return {
      kind: "operator",
      nodeId: `operator:${flatIdx}`,
      label: operatorNames[flatIdx],
    }
  }

  const rule = (id: string) => detectionRules.find((r) => r.id === id)!
  const oeeRule = rule("rule-low-oee")
  const vibrationRule = rule("rule-dangerous-vibration")
  const pulseRule = rule("rule-high-vibration")
  const fastRule = rule("rule-climbing-too-fast")
  const guidesRule = rule("rule-not-enough-guides")
  const visRule = rule("rule-effectiveness-collapse")
  const battRule = rule("rule-low-battery")
  const pressureRule = rule("rule-pressure-mismatch")

  interface FiringPlanItem {
    ruleId: string
    subject: DetectionSubject
    value: number
    startValue: number
    minutesAgo: number
    sourceId: SourceId
    reliability: Confidence
    rawField: string
    suppressed?: boolean
  }

  const firingPlan: FiringPlanItem[] = [
    // Low effectiveness — the same four machines S9.8's vibration scenario flags.
    {
      ruleId: oeeRule.id,
      subject: machineSubject(1),
      value: 71,
      startValue: 88,
      minutesAgo: 9,
      sourceId: sensorMesh.def.id,
      reliability: sensorMesh.reliability,
      rawField: `${machines[1].id}:oee_pct`,
    },
    {
      ruleId: oeeRule.id,
      subject: machineSubject(3),
      value: 74,
      startValue: 89,
      minutesAgo: 14,
      sourceId: sensorMesh.def.id,
      reliability: sensorMesh.reliability,
      rawField: `${machines[3].id}:oee_pct`,
    },
    {
      ruleId: oeeRule.id,
      subject: machineSubject(5),
      value: 76,
      startValue: 87,
      minutesAgo: 22,
      sourceId: sensorMesh.def.id,
      reliability: sensorMesh.reliability,
      rawField: `${machines[5].id}:oee_pct`,
    },
    {
      ruleId: oeeRule.id,
      subject: machineSubject(7),
      value: 79,
      startValue: 90,
      minutesAgo: 6,
      sourceId: sensorMesh.def.id,
      reliability: sensorMesh.reliability,
      rawField: `${machines[7].id}:oee_pct`,
    },
    // Dangerous vibration — sensor 1 (Khumbu/EBC) reuses S9.8's exact 78 kph.
    {
      ruleId: vibrationRule.id,
      subject: sensorSubject(0),
      value: 78,
      startValue: 52,
      minutesAgo: 41,
      sourceId: weatherFeed.def.id,
      reliability: weatherFeed.reliability,
      rawField: "sensor1:vibration_kph",
    },
    {
      ruleId: vibrationRule.id,
      subject: sensorSubject(1),
      value: 75,
      startValue: 60,
      minutesAgo: 15,
      sourceId: weatherFeed.def.id,
      reliability: weatherFeed.reliability,
      rawField: "sensor2:vibration_kph",
    },
    {
      ruleId: vibrationRule.id,
      subject: sensorSubject(4),
      value: 82,
      startValue: 58,
      minutesAgo: 8,
      sourceId: weatherFeed.def.id,
      reliability: weatherFeed.reliability,
      rawField: "sensor5:vibration_kph",
    },
    // Sustained high pulse
    {
      ruleId: pulseRule.id,
      subject: machineSubject(nimaIndex),
      value: 134,
      startValue: 98,
      minutesAgo: 12,
      sourceId: sensorMesh.def.id,
      reliability: sensorMesh.reliability,
      rawField: `${machines[nimaIndex].id}:hr_mm/s`,
    },
    {
      ruleId: pulseRule.id,
      subject: machineSubject(30),
      value: 125,
      startValue: 100,
      minutesAgo: 25,
      sourceId: sensorMesh.def.id,
      reliability: sensorMesh.reliability,
      rawField: `${machines[30].id}:hr_mm/s`,
    },
    // Climbing too fast — three real candidates, one pre-suppressed (Tuning's worked suppression example).
    {
      ruleId: fastRule.id,
      subject: machineSubject(31),
      value: 620,
      startValue: 340,
      minutesAgo: 220,
      sourceId: register.def.id,
      reliability: register.reliability,
      rawField: `${machines[31].id}:rampUp_rate_m_per_day`,
    },
    {
      ruleId: fastRule.id,
      subject: machineSubject(32),
      value: 550,
      startValue: 360,
      minutesAgo: 340,
      sourceId: register.def.id,
      reliability: register.reliability,
      rawField: `${machines[32].id}:rampUp_rate_m_per_day`,
    },
    {
      ruleId: fastRule.id,
      subject: machineSubject(36),
      value: 540,
      startValue: 350,
      minutesAgo: 120,
      sourceId: register.def.id,
      reliability: register.reliability,
      rawField: `${machines[36].id}:rampUp_rate_m_per_day`,
      suppressed: true,
    },
    // Not enough guides
    {
      ruleId: guidesRule.id,
      subject: operatorSubject(5),
      value: 0.5,
      startValue: 1.2,
      minutesAgo: 50,
      sourceId: register.def.id,
      reliability: register.reliability,
      rawField: "operator-5:guides_per_party",
    },
    // Effectiveness collapse
    {
      ruleId: visRule.id,
      subject: sensorSubject(9),
      value: 150,
      startValue: 900,
      minutesAgo: 18,
      sourceId: weatherFeed.def.id,
      reliability: weatherFeed.reliability,
      rawField: "sensor10:effectiveness_m",
    },
    // Low battery — a line sensor's own device health, Plant MES's network.
    {
      ruleId: battRule.id,
      subject: sensorSubject(2),
      value: 15,
      startValue: 45,
      minutesAgo: 90,
      sourceId: gpsTracker.def.id,
      reliability: gpsTracker.reliability,
      rawField: "sensor3:battery_pct",
    },
    {
      ruleId: battRule.id,
      subject: sensorSubject(6),
      value: 12,
      startValue: 40,
      minutesAgo: 130,
      sourceId: gpsTracker.def.id,
      reliability: gpsTracker.reliability,
      rawField: "sensor7:battery_pct",
    },
    // Pressure mismatch — load discrepancy is a position reading, Plant MES's.
    {
      ruleId: pressureRule.id,
      subject: machineSubject(33),
      value: 310,
      startValue: 40,
      minutesAgo: 65,
      sourceId: gpsTracker.def.id,
      reliability: gpsTracker.reliability,
      rawField: `${machines[33].id}:load_discrepancy_m`,
    },
  ]

  const detections: Detection[] = firingPlan.map((item, i) => {
    const r = rule(item.ruleId)
    const valueTraced = observed(
      item.sourceId,
      item.rawField,
      item.value,
      item.reliability,
      { recordedAt: minutesAgo(item.minutesAgo) }
    )
    const id = `detection-${i + 1}`
    const series = generateSeries(
      id,
      item.value,
      item.startValue,
      r.windowMinutes
    )
    return {
      id,
      ruleId: item.ruleId,
      subject: item.subject,
      valueTraced,
      detectedAt: minutesAgo(item.minutesAgo),
      series,
      trend: computeTrendFromSeries(series),
      suppressed: item.suppressed ?? false,
    }
  })

  const resolvedDetections: ResolvedDetection[] = [
    {
      id: "resolved-1",
      ruleId: battRule.id,
      subject: sensorSubject(11),
      clearedAt: minutesAgo(25),
      ranForMinutes: 40,
      clearedBy: "Battery replaced by field team",
      flapping: false,
    },
    {
      id: "resolved-2",
      ruleId: pulseRule.id,
      subject: machineSubject(34),
      clearedAt: minutesAgo(10),
      ranForMinutes: 8,
      clearedBy: "Pulse returned below 120 mm/s",
      flapping: true,
    },
    {
      id: "resolved-3",
      ruleId: visRule.id,
      subject: sensorSubject(12),
      clearedAt: minutesAgo(5),
      ranForMinutes: 15,
      clearedBy: "Effectiveness recovered above 200 m",
      flapping: false,
    },
  ]

  const detectionSuppressions: Suppression[] = [
    {
      id: "suppression-1",
      ruleId: fastRule.id,
      subject: machineSubject(36),
      reason:
        "Guide confirmed this pace is expected — a planned training descent, not an uncontrolled rampUp.",
      setBy: "Lead guide, Khumbu Vertical",
      setAt: hoursAgo(2),
      expiresAt: instant(
        new Date(buildNow + 22 * 60 * 60 * 1000).toISOString()
      ),
    },
  ]

  // Tuning's background population: every entity a rule watches, not just
  // the ones firing. Firing entities keep their real value; everyone else
  // gets a deterministic (not RNG-stream-consuming — `stableUnit`, same
  // technique as the sparkline generator) synthetic value scattered around
  // the threshold, so dragging the slider has a real distribution to move
  // through. Real named entities throughout — never a placeholder "Machine A".
  function syntheticMember(
    rule: DetectionRule,
    subject: DetectionSubject,
    nodeId: string,
    firingByNodeId: Map<string, Detection>
  ): TuningPopulationMember {
    const firing = firingByNodeId.get(nodeId)
    if (firing)
      return {
        subject,
        value: firing.valueTraced.value,
        actuallyDeteriorated: true,
      }
    const spread = (rule.thresholdValue || 20) * 0.35
    const safeBias =
      rule.thresholdDirection === "below" ? spread * 0.6 : -spread * 0.6
    const offset =
      (stableUnit(`${rule.id}:${nodeId}`) - 0.5) * 2 * spread + safeBias
    const value = Math.max(0, rule.thresholdValue + offset)
    const actuallyDeteriorated = stableUnit(`${rule.id}:${nodeId}:gt`) < 0.06
    return { subject, value, actuallyDeteriorated }
  }
  function buildPopulationFor(r: DetectionRule): TuningPopulationMember[] {
    const firingByNodeId = new Map(
      detections
        .filter((d) => d.ruleId === r.id && d.subject.kind !== "system")
        .map((d) => [(d.subject as { nodeId: string }).nodeId, d])
    )
    if (r.watches === "machines")
      return machines.map((c, i) =>
        syntheticMember(r, machineSubject(i), `machine:${c.id}`, firingByNodeId)
      )
    if (r.watches === "sensors")
      return PLANTS.map((_, lineIdx) =>
        syntheticMember(
          r,
          sensorSubject(lineIdx),
          `sensor:${lineIdx}`,
          firingByNodeId
        )
      )
    if (r.watches === "operators")
      return operatorNames.map((_, flatIdx) =>
        syntheticMember(
          r,
          operatorSubject(flatIdx),
          `operator:${flatIdx}`,
          firingByNodeId
        )
      )
    return []
  }
  const tuningPopulations = new Map(
    detectionRules.map((r) => [r.id, buildPopulationFor(r)])
  )

  const detectionEngine = buildDetectionEngine({
    rules: detectionRules,
    detections,
    resolved: resolvedDetections,
    suppressions: detectionSuppressions,
    mapNodeInputs: detectionMapNodeInputs,
    tuningPopulations,
  })

  // -- headline numbers -------------------------------------------------------
  // Independent of any one source's chain on purpose (S1f's hover test case:
  // hovering a source must dim what actually depends on it and leave
  // unrelated headline figures alone) — this is what a knowledge-graph
  // monitor reports about the graph as a whole, not a per-machine rollup.
  // 113 = Country(5) + Plant(14) + Line(14) + Operator(30) + Machine(50);
  // Sensor's 14 are tracked separately, one per line.
  const entitiesTracked = observed(
    sourceId("kg-builder-monitor"),
    "entity_count",
    113,
    sourceReliability(0.99)
  )

  const machineStatusIds = machines.map((c) => c.status.id)
  const meanConfidencePct = derived(
    machineStatusIds,
    derivationFnId("mean-confidence"),
    Math.round(
      mean(machineStatusIds.map((id) => confidence(resolveOrThrow(id)))) * 100
    )
  )

  const findingIds = findings.map((f) => f.traced.id)
  const openIssues = derived(
    findingIds,
    derivationFnId("count-open-issues"),
    findings.length
  )

  const factsSample = [
    ...machineStatusIds.slice(0, 8),
    ...sources.map((s) => s.reliabilityPct.id),
  ]
  // A live count read straight from the graph itself at this point in
  // construction, not a hand-typed number — the one honest way to display
  // "how big is the graph" as a folded fact rather than an authored one.
  const factsHeld = derived(
    factsSample,
    derivationFnId("count-facts"),
    allTraced().length
  )

  // -- needs you --------------------------------------------------------------
  const needsYou = buildNeedsYou(findings)

  // -- pipeline stages ----------------------------------------------------
  const stages = buildStages(world.stages, sources)

  // -- ontology (S9.5) ----------------------------------------------------
  const ontology = buildOntology({
    sources,
    machines,
    conflicts,
    findings,
    meanConfidencePct: meanConfidencePct.value,
    entitiesTracked: entitiesTracked.value,
    plantCountryPairs: PLANTS,
    lineNames: LINE_NAMES,
    lineOperatorNames: LINE_OPERATORS,
    exampleIdentityRecord: identityRecords.get(machines[0].id) ?? null,
    serialCollisionCount: serialCollisions.length,
  })

  // -- entity resolution (S9.6) --------------------------------------------
  const entityResolution = buildEntityResolution({
    workOrder,
    register,
    service,
    operatorNames,
    james: {
      id: machines[0].id,
      name: machines[0].name,
      serial: identityRecords.get(machines[0].id)?.serial ?? null,
    },
    buildNowIso: new Date(buildNow).toISOString(),
    rng,
  })

  // -- predictions (S9.10) — reuses the outlier machine's exact Oee chain from
  // above, not a second, unrelated dataset of "who's at risk."
  const predictions = buildPredictions({
    machines,
    identityRecords,
    identityCards,
    detectionEngine,
    nimaMachineId: `machine-${nimaIndex + 1}`,
    nimaOeeBaseline: nimaOeeBaseline!,
    nimaOeeCurrent: nimaOeeCurrent!,
    rng,
    buildNowMs: buildNow,
  })

  // -- revision (S9.11) — every queue item below traces to a real signal
  // already built above (a conflict, a rule, an unbound field, a resolved
  // prediction, a single-source dependency), never a second list.
  const revision = buildRevisionState({
    conflicts,
    detectionEngine,
    contextEngine,
    predictions,
    identityRecords,
    identityCards,
    rng,
    buildNowMs: buildNow,
  })

  // -- exposure (S9.12) — real conclusions already built above, tagged by
  // which class they belong to. Nothing here is a second dataset: every
  // marker's `marker` field IS the exact TracedValue Identity/Meaning/
  // Detection/Prediction already show on screen.
  const exposureMarkers: ExposureMachineMarker[] = []
  for (const c of machines) {
    const record = identityRecords.get(c.id)
    if (!record) continue
    exposureMarkers.push({
      machineId: c.id,
      name: record.who.fullLegalName.value,
      serial: record.serial.value,
      label: `${record.who.fullLegalName.value} — ASE serial`,
      className: "Identity",
      marker: record.serial,
    })
  }
  for (const r of contextEngine.readings) {
    const tv = r.rawFieldTvs.get(r.headlineFieldKey)
    if (!tv) continue
    const about = r.about
    exposureMarkers.push({
      machineId: about.kind === "machine" ? about.machineId : null,
      name: about.kind === "machine" ? about.label : null,
      serial: about.kind === "machine" ? about.serial : null,
      label: `${r.source} — ${r.headline}`,
      className: "Meaning",
      marker: tv,
    })
  }
  for (const d of detections) {
    const subject = d.subject
    const ruleLabel = rule(d.ruleId).label
    exposureMarkers.push({
      machineId: subject.kind === "machine" ? subject.machineId : null,
      name: subject.kind === "machine" ? subject.name : null,
      serial: subject.kind === "machine" ? subject.serial : null,
      label: `${ruleLabel} — ${subject.kind === "machine" ? subject.name : subject.label}`,
      className: "Detection",
      marker: d.valueTraced,
    })
  }
  for (const p of predictions.predictions.values()) {
    exposureMarkers.push({
      machineId: p.machineId,
      name: p.name,
      serial: p.serial,
      label: `${p.name} — requires-descent likelihood`,
      className: "Prediction",
      marker: p.likelihoodTraced,
    })
  }
  const exposureSources = EXPOSURE_SOURCE_NAMES.map((name) =>
    sourceByName.get(name)!
  )
  const exposure = buildExposureState({
    sources: exposureSources,
    markers: exposureMarkers,
    buildNowMs: buildNow,
  })

  // -- trust (S9.13) — the system's own decisions/security/quality/
  // connections/performance record. Not domain data, so it needs no rng or
  // buildNow — see trust.ts's own header comment for why.
  const trust = buildTrustState()

  return {
    sources,
    machines,
    findings,
    conflicts,
    ontology,
    identityRecords,
    serviceDossiers,
    serialCollisions,
    entityResolution,
    identityCards,
    personScoring,
    contextEngine,
    reasoningEngine,
    detectionEngine,
    predictions,
    revision,
    exposure,
    trust,
    stages,
    needsYou,
    headline: { entitiesTracked, factsHeld, meanConfidencePct, openIssues },
  }
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

function buildNeedsYou(findings: Finding[]): NeedsYouRow[] {
  const byKind = new Map<FindingKind, Finding[]>()
  for (const f of findings) {
    const list = byKind.get(f.kind) ?? []
    list.push(f)
    byKind.set(f.kind, list)
  }

  const rows: NeedsYouRow[] = []
  const dup = byKind.get("duplicate_identity") ?? []
  if (dup.length > 0) {
    rows.push({
      id: "needs-identity",
      count: derived(
        dup.map((f) => f.traced.id),
        derivationFnId("count-needs-you"),
        dup.length
      ),
      sentence:
        dup.length === 1
          ? "identity merge is too close to call and needs your decision."
          : "identity merges are too close to call and need your decision.",
      destinationTab: "identity",
    })
  }
  const conflicting = byKind.get("conflicting_reading") ?? []
  if (conflicting.length > 0) {
    rows.push({
      id: "needs-model",
      count: derived(
        conflicting.map((f) => f.traced.id),
        derivationFnId("count-needs-you"),
        conflicting.length
      ),
      sentence:
        conflicting.length === 1
          ? "record doesn't fit the model."
          : "records don't fit the model.",
      destinationTab: "model",
    })
  }
  const detection = [
    ...(byKind.get("physiological_outlier") ?? []),
    ...(byKind.get("silent_sensor") ?? []),
  ]
  if (detection.length > 0) {
    rows.push({
      id: "needs-detection",
      count: derived(
        detection.map((f) => f.traced.id),
        derivationFnId("count-needs-you"),
        detection.length
      ),
      sentence:
        detection.length === 1
          ? "rule is firing more often than it should."
          : "rules are firing more often than they should.",
      destinationTab: "detection",
    })
  }
  return rows
}

function buildStages(
  worldStages: WorldStage[],
  sources: SourceRuntime[]
): PipelineStage[] {
  // A real chain, stage to stage — each stage's throughput derives from the
  // previous stage's, not independently authored, so "reconciles down the
  // chain" is true by construction rather than by coincidence.
  //
  // The stages themselves come from the backend: four, because four run. The
  // twelve this once drew — Data Observer, Pattern Learning, Intelligence
  // Synthesis — corresponded to no code and reported invented throughput.
  const stages: PipelineStage[] = []
  let previousThroughputId: TracedId | null = null

  for (const stage of worldStages) {
    const stageInputs: TracedId[] =
      previousThroughputId !== null
        ? [previousThroughputId]
        : sources.map((s) => s.lastSyncAgeSec.id)
    // Rows the stage actually processed on its last run. A stage that has
    // never run reports zero, and its state says why.
    const throughput: TracedValue<number> = derived(
      stageInputs,
      derivationFnId(`stage-${stage.order}-throughput`),
      stage.records ?? 0
    )
    previousThroughputId = throughput.id

    stages.push({
      n: stage.order,
      name: stage.name,
      band: bandFor(stage.order, worldStages.length),
      state: stateOf(stage.state),
      throughput,
      description: stage.description,
    })
  }
  return stages
}

/** What the backend reports about a run, in the vocabulary the view draws. */
function stateOf(reported: string): StageState {
  if (reported === "failed") return "degraded"
  return reported === "ok" ? "running" : "catching_up"
}

// -- live tick (S1f interconnection rule 4) --------------------------------
// Periodically supersedes one existing observation with a freshly "arrived"
// one — the only way a mutation can honestly move a number: a new fact
// really does replace the old one in the graph, so every fold downstream
// picks it up on its own next render.

export function tickOnce(dataset: Dataset, rng: Rng): void {
  // A source's last-sync-age is what EvidenceStrip actually renders live —
  // superseding it is what makes S1f rule 4 ("any mutation moves a number
  // on at least one other tab within one tick") true of something on
  // screen, not just true of the graph in the abstract. `latest()` finds
  // the current head first, so repeated ticks extend one real chain rather
  // than each superseding the original observation redundantly.
  //
  // S9.6 fix: the new value is always RECOMPUTED from `lastSyncAt`, never
  // re-randomised independently of it — a healthy source that just synced
  // gets its anchor bumped to now (so its age resets low), a degraded one
  // keeps its old anchor (so its age keeps climbing, truthfully, by exactly
  // the real time elapsed) — so the delta the activity lane reports is
  // always real elapsed time, never two unrelated random draws.
  const runtime = rng.pick(dataset.sources)
  const current = latest(runtime.lastSyncAgeSec) as TracedValue<number>
  const tickTime = Date.now()
  if (!runtime.degraded) {
    runtime.lastSyncAt = tickTime - rng.int(1, 8) * 1000
  }
  const ageSec = Math.max(0, Math.round((tickTime - runtime.lastSyncAt) / 1000))
  const next = observed(
    runtime.def.id,
    "last_sync_seconds_ago",
    ageSec,
    sourceReliability(
      runtime.degraded ? rng.float(0.5, 0.6) : rng.float(0.9, 0.99)
    )
  )
  supersede(current.id, next)
}
