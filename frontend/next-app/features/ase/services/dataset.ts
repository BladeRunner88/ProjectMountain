// The real ASE dataset (S1f/S1g) — everything through S1e was pure
// infrastructure with zero entities. Isildur's demo domain is high-altitude
// expedition safety: permits, operator rosters, medical logs and a mesh of
// route sensors, reconciled into one picture of who is where and whether
// they're safe.
//
// S1g is the repeatability claim under test: this file is the ONLY place
// that knows about mountains, climbers or sensors. Everything above it —
// TracedValues, folds, confidence, the perturbation test, every tab
// component — is domain-agnostic and reads this dataset only through
// `useDataset()` and the type-only exports below. If swapping the domain
// had required touching any of that, the architecture would not be what it
// claims to be.
//
// Every number that will ever reach a screen is built here as a real
// derivation chain — nothing in Overview or Processing is allowed to author
// a value, so if it isn't buildable as a TracedValue, it doesn't appear.

import { Rng } from './rng'
import { allTraced, clearRegistry, latest, resolveOrThrow, supersede } from './graph'
import { confidence, sourceReliability, matchScore } from './folds'
import { conflictFnSlug, resolveConflict, resolveRangeMerge, type Conflict, type ConflictPolicy } from './conflict'
import { buildOntology, type Ontology } from './ontology'
import { buildIdentityRecords, type AnteMortemRecord, type ClimberIdentityInput, type IdentityRecord } from './identityRecord'
import { buildEntityResolution, buildPersonScoring, type EntityResolutionData, type PersonScoring } from './entityResolution'
import { buildIdentityCards, type IdentityCard, type IdentityCardInput } from './identityCard'
import { buildContextEngine, type ContextEngineState, type ReadingAbout } from './contextEngine'
import { buildReasoningEngine, type ReasoningEngineState } from './reasoning'
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
} from './detection'
import { buildPredictions, type PredictionState } from './prediction'
import { buildRevisionState, type RevisionState } from './revision'
import { buildExposureState, type ExposureClimberMarker, type ExposureState } from './exposure'
import { buildTrustState, type TrustState } from './trust'
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
} from './traced'
import type { TabId } from '../types/tabs'

const SEED = 20260804

// -- sources ------------------------------------------------------------

export interface SourceDef {
  id: SourceId
  name: string
  category: string
}

// S9.12: sensor mesh split into the wearable oximeter and the GPS tracker,
// and a new manual-observation feed added — six operational sources for
// Exposure's own panels to reason about individually rather than one coarse
// "sensor mesh" blob. Operator rosters and medical logs are KEPT alongside
// the new six, deliberately: both are load-bearing in S9.6's own
// three-source entity-resolution demo (permit vs roster vs medical), and
// retiring either would break that already-built, already-tested feature
// for a rename Exposure itself doesn't need — Exposure's own UI only ever
// lists the six named in its spec, not these two legacy sources.
export const SOURCE_DEFS: SourceDef[] = [
  { id: sourceId('wearable-oximeter'), name: 'Wearable oximeter', category: 'Wearable sensor' },
  { id: sourceId('gps-tracker'), name: 'GPS tracker', category: 'Position sensor' },
  { id: sourceId('weather-feed'), name: 'Weather feed', category: 'Weather feed' },
  { id: sourceId('radio-check-in-log'), name: 'Radio check-in log', category: 'Communications log' },
  { id: sourceId('permit-registry'), name: 'Permit registry', category: 'Permit registry' },
  { id: sourceId('manual-observation'), name: 'Manual observation', category: 'Manual log' },
  { id: sourceId('operator-rosters'), name: 'Operator rosters', category: 'Operator roster' },
  { id: sourceId('medical-logs'), name: 'Medical logs', category: 'Medical log' },
]

/** The six sources Exposure's own panels enumerate — operator rosters and medical logs are real sources but not part of this list (see the comment on SOURCE_DEFS). */
export const EXPOSURE_SOURCE_NAMES = ['Wearable oximeter', 'GPS tracker', 'Weather feed', 'Radio check-in log', 'Permit registry', 'Manual observation'] as const

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

export interface ClimberFact {
  id: string
  name: TracedValue<string>
  status: TracedValue<'clean' | 'flagged'>
  findingId: string | null
}

export type FindingKind = 'duplicate_identity' | 'conflicting_vital' | 'physiological_outlier' | 'silent_sensor'

export interface Finding {
  id: string
  kind: FindingKind
  entityLabel: string
  /** ONE plain sentence — the same discipline EvidenceTable's WHY column requires. */
  reason: string
  traced: TracedValue<boolean> // the flagged-ness itself, folded and provenance-walkable
  ownerTab: TabId
}

export type StageState = 'running' | 'catching_up' | 'degraded'

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
  climbers: ClimberFact[]
  findings: Finding[]
  conflicts: Conflict[]
  ontology: Ontology
  identityRecords: Map<string, IdentityRecord>
  anteMortems: Map<string, AnteMortemRecord>
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

const STAGE_DEFS: { name: string; band: 1 | 2 | 3; description: string }[] = [
  { name: 'Data Observer', band: 1, description: 'Watches every connected source for new or changed records.' },
  { name: 'Data Normalisation', band: 1, description: 'Reshapes each source’s own fields, units and formats into one shared schema.' },
  { name: 'Entity Resolution', band: 1, description: 'Merges records from different sources that describe the same real-world thing.' },
  { name: 'Knowledge Graph Builder', band: 1, description: 'Assembles resolved entities and their relationships into the graph.' },
  { name: 'Context Engine', band: 1, description: 'Applies business rules that give a resolved fact its meaning.' },
  { name: 'Reasoning Engine', band: 2, description: 'Combines related facts into a conclusion, keeping the chain that produced it.' },
  { name: 'Anomaly Detection', band: 2, description: 'Flags discrepancies and outliers as they appear.' },
  { name: 'Pattern Learning', band: 2, description: 'Learns recurring shapes in past data to recognise them again.' },
  { name: 'Intelligence Memory', band: 2, description: 'Retains what has been resolved and learned so it can be reused.' },
  { name: 'Intelligence Synthesis', band: 3, description: 'Combines memory and reasoning into answers ready to serve.' },
  { name: 'Graph API', band: 3, description: 'Exposes the resolved graph to the rest of the business.' },
  { name: 'Human Feedback Loop', band: 3, description: 'Carries a person’s correction back into memory, closing the loop.' },
]

// -- reference data: Country / Region / Route / Operator -----------------
// Only Climber becomes real TracedValues below (name + status) — nothing
// else here ever reaches a screen yet, so it stays plain data. Their
// combined count (5 + 14 + 14 + 30 + 50 = 113) is what the entitiesTracked
// headline below asserts; Sensor's 14 are tracked separately, one per
// route, and are not part of that headline (see the build report for why).

export interface RegionDef {
  name: string
  country: string
}

export const REGIONS: RegionDef[] = [
  { name: 'Khumbu', country: 'Nepal' },
  { name: 'Annapurna', country: 'Nepal' },
  { name: 'Manaslu', country: 'Nepal' },
  { name: 'Langtang', country: 'Nepal' },
  { name: 'Baltoro', country: 'Pakistan' },
  { name: 'Nanga Parbat', country: 'Pakistan' },
  { name: 'Gasherbrum', country: 'Pakistan' },
  { name: 'North Col', country: 'China (Tibet)' },
  { name: 'Cho Oyu', country: 'China (Tibet)' },
  { name: 'Denali', country: 'United States' },
  { name: 'Rainier', country: 'United States' },
  { name: 'Matterhorn', country: 'Switzerland' },
  { name: 'Eiger', country: 'Switzerland' },
  { name: 'Monte Rosa', country: 'Switzerland' },
]

// One route per region, real standard-route names.
export const ROUTE_NAMES: string[] = [
  'South Col Route',
  'Northwest Face Route',
  'Normal Route (Northeast Face)',
  'Southeast Ridge',
  'Abruzzi Spur',
  'Kinshofer Route',
  'Southwest Ridge',
  'North Ridge Route',
  'Northwest Ridge Route',
  'West Buttress',
  'Disappointment Cleaver',
  'Hörnli Ridge',
  'Mittellegi Ridge',
  'Margherita Hut Route',
]

// 2-3 operators per route, 30 total. Region-flavoured, plausible names.
export const ROUTE_OPERATORS: string[][] = [
  ['Khumbu Vertical', 'Sagarmatha Collective', 'Eight-Thousander Union'],
  ['Annapurna Circuit Guides', 'Thin Air Research'],
  ['Manaslu Alpine Co', 'Gorkha Summit Partners'],
  ['Langtang Ridge Outfitters', 'Helambu Ascents'],
  ['Baltoro Glacier Guides', 'Karakoram Traverse', 'Alpine Meridian'],
  ['Diamir Face Expeditions', 'Nanga Parbat Alpine Co'],
  ['Gasherbrum Collective', 'Concordia Ascents'],
  ['North Col Traverse', 'Rongbuk Expeditions'],
  ['Cho Oyu Guiding Co', 'Nangpa La Partners'],
  ['Denali Mountaineering Co', 'West Buttress Guides'],
  ['Rainier Alpine Guides', 'Cascade Summit Partners'],
  ['Hörnli Alpine Guides', 'Zermatt Ascents'],
  ['Eiger Traverse Co', 'Grindelwald Alpine Partners'],
  ['Monte Rosa Guiding Collective', 'Gorner Ridge Partners'],
]

const CLIMBER_COUNT = 50

// Nationality-grouped first/last name pools — a climber's origin is
// independent of which region they're climbing in, so these are drawn
// uniformly rather than tied to REGIONS/ROUTE_OPERATORS. `country` is the
// climber's own country of origin (S9.5b) — distinct from `registryCountry`
// (which permit registry issued their serial), which is derived separately
// from the route/operator they're actually climbing under.
const NAME_POOLS: { first: string[]; last: string[]; country: string }[] = [
  { first: ['Pemba', 'Lhakpa', 'Dawa', 'Mingma', 'Pasang', 'Tenzing', 'Ang', 'Karma', 'Sonam'], last: ['Sherpa', 'Tamang', 'Gurung', 'Rai', 'Lama'], country: 'Nepal' },
  { first: ['Ali', 'Hassan', 'Imran', 'Fahad', 'Bilal', 'Zainab', 'Sara', 'Rashid'], last: ['Khan', 'Baig', 'Hussain', 'Malik', 'Ahmed'], country: 'Pakistan' },
  { first: ['Michael', 'Sarah', 'David', 'Jessica', 'Ryan', 'Amanda', 'Robert', 'Laura'], last: ['Anderson', 'Carter', 'Bennett', 'Foster', 'Reynolds', 'Mitchell'], country: 'United States' },
  { first: ['Oliver', 'Emma', 'George', 'Charlotte', 'Harry', 'Alice', 'Thomas', 'Olivia'], last: ['Whitfield', 'Ashcroft', 'Pemberton', 'Hargreaves', 'Sinclair'], country: 'United Kingdom' },
  { first: ['Antoine', 'Camille', 'Julien', 'Margaux', 'Étienne', 'Céline'], last: ['Moreau', 'Girard', 'Lefevre', 'Rousseau', 'Bernard'], country: 'France' },
  { first: ['Lukas', 'Anja', 'Matthias', 'Sabine', 'Felix', 'Nina'], last: ['Baumann', 'Zimmermann', 'Herzog', 'Steiner', 'Frei'], country: 'Switzerland' },
  { first: ['Kenji', 'Yuki', 'Hiroshi', 'Aiko', 'Takeshi', 'Naomi'], last: ['Tanaka', 'Sato', 'Watanabe', 'Yamamoto', 'Kobayashi'], country: 'Japan' },
  { first: ['Min-jun', 'Ji-woo', 'Seo-yeon', 'Joon-ho', 'Hana'], last: ['Kim', 'Park', 'Lee', 'Choi', 'Jung'], country: 'South Korea' },
  { first: ['Alberto', 'Iñaki', 'Carlos', 'Elena', 'Marta'], last: ['Fernández', 'Zabaleta', 'Iturri', 'García', 'Torres'], country: 'Spain' },
  { first: ['Piotr', 'Wanda', 'Krzysztof', 'Anna', 'Tomasz'], last: ['Kowalski', 'Nowak', 'Wiśniewski', 'Zieliński'], country: 'Poland' },
  { first: ['Arjun', 'Priya', 'Rohan', 'Divya', 'Karan'], last: ['Sharma', 'Mehta', 'Rao', 'Kapoor', 'Iyer'], country: 'India' },
  { first: ['Aidos', 'Zarina', 'Yerlan', 'Saltanat'], last: ['Nurlanov', 'Tashkenov', 'Bekova'], country: 'Kazakhstan' },
]

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

export interface BuildDatasetOptions {
  /** Keyed by source name (e.g. "Weather feed") — what the S2 perturbation test overrides to prove one source's reliability moves every confidence downstream of it, with nothing else in the dataset changing. */
  sourceReliability?: Partial<Record<string, number>>
}

export function buildDataset(seed: number = SEED, options: BuildDatasetOptions = {}): Dataset {
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
    const degraded = def.name === 'Weather feed'
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
      'reliability_pct',
      Math.round(reliability * 100),
      sourceReliability(reliability)
    )
    const initialAgeSec = degraded ? rng.int(3600, 5400) : rng.int(3, 90)
    const lastSyncAgeSec = observed(def.id, 'last_sync_seconds_ago', initialAgeSec, sourceReliability(reliability))
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
  const wearableOximeter = sourceByName.get('Wearable oximeter')!
  const gpsTracker = sourceByName.get('GPS tracker')!
  const permit = sourceByName.get('Permit registry')!
  const roster = sourceByName.get('Operator rosters')!
  const medical = sourceByName.get('Medical logs')!
  const manualObservation = sourceByName.get('Manual observation')!
  const weatherFeed = sourceByName.get('Weather feed')!
  // Kept as an alias during the split so nothing downstream silently reads
  // stale data — every genuine physiological reading below now goes to the
  // wearable oximeter; nothing should still reference `sensorMesh` by name.
  const sensorMesh = wearableOximeter

  // -- operators + climber name assignment ----------------------------------
  const operatorNames = ROUTE_OPERATORS.flat() // 30, route-ordered
  // Which route (0..13) each operator belongs to, in the same flattened
  // order as operatorNames — needed (S9.5b) to derive which country's
  // permit registry issues a climber's serial.
  const operatorRouteIndex: number[] = []
  ROUTE_OPERATORS.forEach((ops, routeIdx) => {
    for (let k = 0; k < ops.length; k++) operatorRouteIndex.push(routeIdx)
  })

  const operatorClimberCounts = new Array(operatorNames.length).fill(1)
  let remainingClimbers = CLIMBER_COUNT - operatorNames.length
  while (remainingClimbers > 0) {
    const idx = rng.int(0, operatorNames.length - 1)
    if (operatorClimberCounts[idx] < 4) {
      operatorClimberCounts[idx]++
      remainingClimbers--
    }
  }
  // Climber index 0 is always operator 0's first climber; the physiological
  // outlier finding always belongs to operator 1's first climber — both
  // counts start at 1, so both slots always exist regardless of seed.
  const nimaIndex = operatorClimberCounts[0]

  // Which operator (0..29) each climber belongs to, flattened in the same
  // order climbers are built below.
  const climberOperatorIndex: number[] = []
  operatorClimberCounts.forEach((count, opIdx) => {
    for (let k = 0; k < count; k++) climberOperatorIndex.push(opIdx)
  })

  const usedNames = new Set<string>(['James Marshall III', 'Nima Tamang'])
  function randomClimberName(): { name: string; country: string } {
    for (let attempt = 0; attempt < 30; attempt++) {
      const pool = rng.pick(NAME_POOLS)
      const full = `${rng.pick(pool.first)} ${rng.pick(pool.last)}`
      if (!usedNames.has(full)) {
        usedNames.add(full)
        return { name: full, country: pool.country }
      }
    }
    const fallback = `Climber ${usedNames.size + 1}`
    usedNames.add(fallback)
    return { name: fallback, country: 'United States' }
  }

  const climberNames: string[] = []
  const climberCountries: string[] = []
  for (let i = 0; i < CLIMBER_COUNT; i++) {
    if (i === 0) {
      climberNames.push('James Marshall III')
      climberCountries.push('United States')
    } else if (i === nimaIndex) {
      climberNames.push('Nima Tamang')
      climberCountries.push('Nepal')
    } else {
      const generated = randomClimberName()
      climberNames.push(generated.name)
      climberCountries.push(generated.country)
    }
  }

  // -- climbers + findings ---------------------------------------------------
  const climbers: ClimberFact[] = []
  const findings: Finding[] = []
  // Captured out of the loop below so the Meaning tab's own sensor-mesh
  // reading for Nima Tamang (S9.7 rebuild) can reuse these EXACT
  // TracedValues rather than re-observing the same facts under a second,
  // structurally-unrelated id — real, not narratively-coincidental,
  // `dependents()` on Meaning's own bound fact walks all the way to the
  // physiological_outlier finding below and to reasoning.ts's outlier answer.
  let nimaSpo2Current: TracedValue<number> | null = null
  let nimaSpo2Baseline: TracedValue<number> | null = null

  const duplicateIndices = new Set([20, 35])
  const conflictingVitalIndex = 25

  for (let i = 0; i < CLIMBER_COUNT; i++) {
    const label = climberNames[i]
    const isDuplicate = duplicateIndices.has(i)
    const isConflictingVital = i === conflictingVitalIndex
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
      // asOf()'s ordinary visibility rule.
      const rawPermit = observed(permit.def.id, 'climber_name', label, permit.reliability, { recordedAt: hoursAgo(20) })
      const rawRoster = observed(roster.def.id, 'climber_name', label, roster.reliability, { recordedAt: hoursAgo(18) })
      const rawMedical = observed(medical.def.id, 'climber_name', label, medical.reliability, { recordedAt: hoursAgo(16) })
      const mergedAt = hoursAgo(3)
      const nameTv = merged(
        [rawPermit.id, rawRoster.id, rawMedical.id],
        matchRuleId('exact-name-match'),
        matchScore(0.88),
        label,
        { recordedAt: mergedAt }
      )
      const fid = `finding-dup-${i}`
      findings.push({
        id: fid,
        kind: 'duplicate_identity',
        entityLabel: label,
        reason: `${label} was recorded three separate ways — in the permit registry, the operator roster and the medical log — that all refer to the same climber. The merge has not been confirmed.`,
        traced: derived([nameTv.id], derivationFnId('flag-duplicate'), true, { recordedAt: mergedAt }),
        ownerTab: 'identity',
      })

      // The climber's own status genuinely changes at the same moment —
      // "clean" while the three records stood unresolved, "flagged" once
      // ASE noticed they were the same person. A real supersession, not a
      // value authored twice: `climbers[i].status` still holds the
      // ORIGINAL ("clean") TracedValue, exactly what every as-of/live
      // reader expects to walk forward from.
      const initialStatus = observed<'clean' | 'flagged'>(permit.def.id, 'climber_status', 'clean', permit.reliability, {
        recordedAt: hoursAgo(20),
      })
      const flaggedStatus = observed<'clean' | 'flagged'>(permit.def.id, 'climber_status', 'flagged', permit.reliability, {
        recordedAt: mergedAt,
      })
      supersede(initialStatus.id, flaggedStatus)
      climbers.push({ id: `climber-${i + 1}`, name: nameTv, status: initialStatus, findingId: fid })
      continue
    }

    const rawPermit = observed(permit.def.id, 'climber_name', label, permit.reliability)
    let nameTv: TracedValue<string>
    let findingId: string | null = null

    if (isConflictingVital) {
      const norm = normalised(rawPermit.id, transformId('trim-whitespace'), label)
      nameTv = norm
      const medicalHr = observed(manualObservation.def.id, 'resting_hr_bpm', rng.int(58, 68), manualObservation.reliability, { recordedAt: hoursAgo(2) })
      const sensorHr = observed(wearableOximeter.def.id, 'baseline_hr_bpm', rng.int(78, 92), wearableOximeter.reliability, { recordedAt: hoursAgo(1) })
      const fid = `finding-vital-${i}`
      findingId = fid
      findings.push({
        id: fid,
        kind: 'conflicting_vital',
        entityLabel: label,
        reason: `${label}'s resting heart rate disagrees between the medical log and the sensor baseline, and the difference has not been explained.`,
        traced: derived([medicalHr.id, sensorHr.id], derivationFnId('flag-vital-conflict'), true),
        ownerTab: 'model',
      })
    } else if (isPhysiologicalOutlier) {
      const norm = normalised(rawPermit.id, transformId('trim-whitespace'), label)
      nameTv = norm
      const slug = slugify(label)
      const baselineSpo2 = observed(manualObservation.def.id, `${slug}:spo2_baseline_pct`, 90, manualObservation.reliability, { recordedAt: hoursAgo(72) })
      const priorReading = observed(wearableOximeter.def.id, `${slug}:blood_oxygen_pct`, 84, wearableOximeter.reliability, { recordedAt: hoursAgo(3) })
      const currentReading = observed(wearableOximeter.def.id, `${slug}:blood_oxygen_pct`, 81, wearableOximeter.reliability, { recordedAt: hoursAgo(0.1) })
      supersede(priorReading.id, currentReading)
      nimaSpo2Current = currentReading
      nimaSpo2Baseline = baselineSpo2
      const fid = `finding-outlier-${i}`
      findingId = fid
      findings.push({
        id: fid,
        kind: 'physiological_outlier',
        entityLabel: label,
        reason: `${label}'s blood oxygen is far below their own acclimatisation baseline for their current camp, flagged for review before it is treated as routine.`,
        traced: inferred([currentReading.id, baselineSpo2.id], patternId('physiological-outlier'), 9, 0, true),
        ownerTab: 'detection',
      })
    } else {
      nameTv = normalised(rawPermit.id, transformId('trim-whitespace'), label)
    }

    const status = observed<'clean' | 'flagged'>(permit.def.id, 'climber_status', findingId ? 'flagged' : 'clean', permit.reliability)
    climbers.push({ id: `climber-${i + 1}`, name: nameTv, status, findingId })
  }

  // -- silent-sensor finding (one route sensor, not a whole source) ----------
  const silentSensorRouteIndex = 6 // Gasherbrum
  const silentSensorRegion = REGIONS[silentSensorRouteIndex].name
  const silentSensorRoute = ROUTE_NAMES[silentSensorRouteIndex]
  const silentSensorTv = observed(
    gpsTracker.def.id,
    `${slugify(silentSensorRegion)}-sensor:last_sync_minutes_ago`,
    15,
    gpsTracker.reliability
  )
  const silentFid = 'finding-silent-sensor'
  findings.push({
    id: silentFid,
    kind: 'silent_sensor',
    entityLabel: `${silentSensorRegion} sensor`,
    reason: `The ${silentSensorRoute} sensor on ${silentSensorRegion} has not reported in 15 minutes, while every other route sensor stays current.`,
    traced: inferred([silentSensorTv.id], patternId('sensor-silence'), 8, 0, true),
    ownerTab: 'detection',
  })

  // -- conflicts (S9.4) -------------------------------------------------------
  // Five real property conflicts, each resolved by a different strategy.
  // Nothing is discarded: `a`/`b` stay in the graph exactly as observed;
  // `resolved` (when a strategy can produce one) is its own real 'derived'
  // TracedValue whose `from` is BOTH of them, so a human looking at this
  // months later can walk straight back to what lost and why.

  // 1. Date of birth — permit registry vs operator roster, one day apart.
  // The two candidate dates are built relative to `buildNow`, straddling
  // this year's birthday boundary by construction (one is "today's"
  // month/day 35 years ago, the other one calendar day earlier) — a plain
  // fixed 1-day gap (e.g. "1991-03-14" vs "-15") would round to the exact
  // same whole-year age on all but one day of the year, which would make
  // the age downstream of this conflict silently fail to move on every
  // other day — exactly the kind of gap this app exists to rule out.
  const dobLabel = climberNames[0] // James Marshall III
  const dobBoundary = new Date(buildNow)
  dobBoundary.setUTCFullYear(dobBoundary.getUTCFullYear() - 35)
  function isoDate(d: Date): string {
    return d.toISOString().slice(0, 10)
  }
  const dobA = observed(permit.def.id, 'date_of_birth', isoDate(dobBoundary), permit.reliability, { recordedAt: hoursAgo(200) })
  const dobB = observed(
    roster.def.id,
    'date_of_birth',
    isoDate(new Date(dobBoundary.getTime() - 24 * 60 * 60 * 1000)),
    roster.reliability,
    { recordedAt: hoursAgo(190) }
  )
  const dobFn = conflictFnSlug(dobLabel, 'Date of birth')
  const dobPolicySourcePriority: ConflictPolicy = {
    id: 'conflict-dob-source-priority',
    property: 'Climber.dateOfBirth',
    strategy: 'source-priority',
    sourcePriority: [permit.def.id, roster.def.id],
    rationale: 'The permit registry is the legal record.',
  }
  const dobPolicyMostRecent: ConflictPolicy = {
    id: 'conflict-dob-most-recent',
    property: 'Climber.dateOfBirth',
    strategy: 'most-recent',
    rationale: 'The most recently recorded value is presumed the correction.',
  }
  const dobPolicyHighestConfidence: ConflictPolicy = {
    id: 'conflict-dob-highest-confidence',
    property: 'Climber.dateOfBirth',
    strategy: 'highest-confidence',
    rationale: "The higher-confidence source is trusted when the legal record isn't decisive.",
  }
  // Calendar-correct age (year difference, minus one if this year's
  // birthday hasn't happened yet) — not an average-year-length division,
  // which is too coarse to reliably register a single day's difference.
  function ageFromDob(dobIso: unknown): number {
    const dob = new Date(dobIso as string)
    const now = new Date(buildNow)
    let age = now.getUTCFullYear() - dob.getUTCFullYear()
    const birthdayNotYetReachedThisYear =
      now.getUTCMonth() < dob.getUTCMonth() || (now.getUTCMonth() === dob.getUTCMonth() && now.getUTCDate() <= dob.getUTCDate())
    if (birthdayNotYetReachedThisYear) age--
    return age
  }
  const dobResolved = resolveConflict(dobA, dobB, dobPolicySourcePriority, dobFn)!
  const ageTv = derived([dobResolved.id], conflictFnSlug(dobLabel, 'Age'), ageFromDob(dobResolved.value))
  const dobConflict: Conflict = {
    id: 'conflict-dob',
    entityLabel: dobLabel,
    propertyLabel: 'Date of birth',
    policy: dobPolicySourcePriority,
    availablePolicies: [dobPolicySourcePriority, dobPolicyMostRecent, dobPolicyHighestConfidence],
    a: dobA,
    aOrigin: 'Permit registry',
    b: dobB,
    bOrigin: 'Operator rosters',
    resolved: dobResolved,
    format: (v) => new Date(v as string).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    downstream: [
      {
        label: 'Age',
        traced: ageTv,
        format: (v) => `${v as number}`,
        recompute: (resolvedDob) => ageFromDob(resolvedDob),
      },
    ],
    resolve: (policy) => resolveConflict(dobA, dobB, policy, dobFn),
  }

  // 2. Resting heart rate — medical log vs sensor baseline, 6 bpm apart.
  const hrLabel = climberNames[5]
  const hrA = observed(manualObservation.def.id, 'resting_hr_bpm', 58, manualObservation.reliability, { recordedAt: hoursAgo(10) })
  const hrB = observed(wearableOximeter.def.id, 'baseline_hr_bpm', 64, wearableOximeter.reliability, { recordedAt: hoursAgo(2) })
  const hrFn = conflictFnSlug(hrLabel, 'Resting heart rate')
  const hrPolicyMostRecent: ConflictPolicy = {
    id: 'conflict-hr-most-recent',
    property: 'Climber.restingHeartRate',
    strategy: 'most-recent',
    rationale: 'The most recently recorded reading is presumed current.',
  }
  const hrPolicySourcePriority: ConflictPolicy = {
    id: 'conflict-hr-source-priority',
    property: 'Climber.restingHeartRate',
    strategy: 'source-priority',
    sourcePriority: [manualObservation.def.id, wearableOximeter.def.id],
    rationale: 'The medical log is kept by clinical staff and takes precedence.',
  }
  const hrPolicyHighestConfidence: ConflictPolicy = {
    id: 'conflict-hr-highest-confidence',
    property: 'Climber.restingHeartRate',
    strategy: 'highest-confidence',
    rationale: 'The higher-confidence reading is trusted.',
  }
  const hrConflict: Conflict = {
    id: 'conflict-hr',
    entityLabel: hrLabel,
    propertyLabel: 'Resting heart rate',
    policy: hrPolicyMostRecent,
    availablePolicies: [hrPolicyMostRecent, hrPolicySourcePriority, hrPolicyHighestConfidence],
    a: hrA,
    aOrigin: 'Medical logs',
    b: hrB,
    bOrigin: 'Sensor mesh',
    resolved: resolveConflict(hrA, hrB, hrPolicyMostRecent, hrFn),
    format: (v) => `${v as number} bpm`,
    downstream: [],
    resolve: (policy) => resolveConflict(hrA, hrB, policy, hrFn),
  }

  // 3. Nationality on permit — permit registry vs roster free-text. Deliberately
  // NOT an ethnicity/race category (S9.5b forbids storing one anywhere) — both
  // values here are countries of citizenship, the kind of mismatch that
  // genuinely happens when a dual national's roster entry doesn't match their
  // permit paperwork.
  const nationalityLabel = climberNames[10]
  // Reliability comes from the source's own rolled/overridden value, same
  // as every other observed() call — hardcoding it here instead would sever
  // this conflict from the perturbation test's invariant (moving a source's
  // reliability must move everything genuinely downstream of it).
  const nationalityA = observed(permit.def.id, 'nationality', 'Nepal', permit.reliability)
  const nationalityB = observed(roster.def.id, 'nationality', 'India', roster.reliability)
  const nationalityFn = conflictFnSlug(nationalityLabel, 'Nationality on permit')
  const nationalityPolicyHighestConfidence: ConflictPolicy = {
    id: 'conflict-nationality-highest-confidence',
    property: 'Climber.nationalityOnPermit',
    strategy: 'highest-confidence',
    rationale: 'The higher-confidence field wins when both describe the same fact.',
  }
  const nationalityPolicySourcePriority: ConflictPolicy = {
    id: 'conflict-nationality-source-priority',
    property: 'Climber.nationalityOnPermit',
    strategy: 'source-priority',
    sourcePriority: [permit.def.id, roster.def.id],
    rationale: 'The permit registry is the legal record.',
  }
  const nationalityPolicyMostRecent: ConflictPolicy = {
    id: 'conflict-nationality-most-recent',
    property: 'Climber.nationalityOnPermit',
    strategy: 'most-recent',
    rationale: 'The most recently recorded value is presumed current.',
  }
  const nationalityConflict: Conflict = {
    id: 'conflict-nationality',
    entityLabel: nationalityLabel,
    propertyLabel: 'Nationality on permit',
    policy: nationalityPolicyHighestConfidence,
    availablePolicies: [nationalityPolicyHighestConfidence, nationalityPolicySourcePriority, nationalityPolicyMostRecent],
    a: nationalityA,
    aOrigin: 'Permit registry',
    b: nationalityB,
    bOrigin: 'Operator rosters (free text)',
    resolved: resolveConflict(nationalityA, nationalityB, nationalityPolicyHighestConfidence, nationalityFn),
    format: (v) => String(v),
    downstream: [],
    resolve: (policy) => resolveConflict(nationalityA, nationalityB, policy, nationalityFn),
  }

  // 3b. Ethnicity (as recorded on the source document) — 9.6's Source
  // Records card feeds this AS RECORDED, a declared value quoted from a
  // specific document rather than an ASE observation, distinct from the
  // canonical identity record which never carries a race/ethnicity
  // category. Kept out of identityRecord.ts entirely — this conflict, and
  // the ethnicity/race fields it feeds, live only in identityCard.ts's 9.6
  // domain wiring below.
  const ethnicityDeclaredLabel = climberNames[30]
  const ethnicityDeclaredA = observed(permit.def.id, 'ethnicity_declared', 'Sherpa', permit.reliability)
  const ethnicityDeclaredB = observed(roster.def.id, 'ethnicity_declared', 'Tamang', roster.reliability)
  const ethnicityDeclaredFn = conflictFnSlug(ethnicityDeclaredLabel, 'Ethnicity (as recorded)')
  const ethnicityDeclaredPolicyHighestConfidence: ConflictPolicy = {
    id: 'conflict-ethnicity-declared-highest-confidence',
    property: 'Climber.ethnicityDeclared',
    strategy: 'highest-confidence',
    rationale: 'The higher-confidence document wins when both describe the same declared fact.',
  }
  const ethnicityDeclaredPolicySourcePriority: ConflictPolicy = {
    id: 'conflict-ethnicity-declared-source-priority',
    property: 'Climber.ethnicityDeclared',
    strategy: 'source-priority',
    sourcePriority: [permit.def.id, roster.def.id],
    rationale: 'The permit registry is the legal record.',
  }
  const ethnicityDeclaredPolicyMostRecent: ConflictPolicy = {
    id: 'conflict-ethnicity-declared-most-recent',
    property: 'Climber.ethnicityDeclared',
    strategy: 'most-recent',
    rationale: 'The most recently recorded document is presumed current.',
  }
  const ethnicityDeclaredConflict: Conflict = {
    id: 'conflict-ethnicity-declared',
    entityLabel: ethnicityDeclaredLabel,
    propertyLabel: 'Ethnicity (as recorded)',
    policy: ethnicityDeclaredPolicyHighestConfidence,
    availablePolicies: [ethnicityDeclaredPolicyHighestConfidence, ethnicityDeclaredPolicySourcePriority, ethnicityDeclaredPolicyMostRecent],
    a: ethnicityDeclaredA,
    aOrigin: 'Permit registry',
    b: ethnicityDeclaredB,
    bOrigin: 'Operator rosters (free text)',
    resolved: resolveConflict(ethnicityDeclaredA, ethnicityDeclaredB, ethnicityDeclaredPolicyHighestConfidence, ethnicityDeclaredFn),
    format: (v) => String(v),
    downstream: [],
    resolve: (policy) => resolveConflict(ethnicityDeclaredA, ethnicityDeclaredB, policy, ethnicityDeclaredFn),
  }

  // 4. Mountains climbed — roster vs the climber's own declaration, 3 apart.
  const mountainsLabel = climberNames[15]
  const mountainsA = observed(roster.def.id, 'mountains_climbed_count', 8, roster.reliability, { recordedAt: hoursAgo(50) })
  const mountainsB = asserted(actorId(`climber:${slugify(mountainsLabel)}`), 'Self-reported by the climber.', 11, {
    recordedAt: hoursAgo(5),
  })
  const mountainsFn = conflictFnSlug(mountainsLabel, 'Mountains climbed')
  const mountainsPolicyHumanRequired: ConflictPolicy = {
    id: 'conflict-mountains-human-required',
    property: 'Climber.mountainsClimbed',
    strategy: 'human-required',
    rationale: "Self-reported counts can't be reconciled automatically — a human has to judge which record is right.",
  }
  const mountainsPolicyMostRecent: ConflictPolicy = {
    id: 'conflict-mountains-most-recent',
    property: 'Climber.mountainsClimbed',
    strategy: 'most-recent',
    rationale: 'The most recently recorded count is presumed current.',
  }
  const mountainsPolicyHighestConfidence: ConflictPolicy = {
    id: 'conflict-mountains-highest-confidence',
    property: 'Climber.mountainsClimbed',
    strategy: 'highest-confidence',
    rationale: 'The higher-confidence record is trusted.',
  }
  const mountainsConflict: Conflict = {
    id: 'conflict-mountains',
    entityLabel: mountainsLabel,
    propertyLabel: 'Mountains climbed',
    policy: mountainsPolicyHumanRequired,
    availablePolicies: [mountainsPolicyHumanRequired, mountainsPolicyMostRecent, mountainsPolicyHighestConfidence],
    a: mountainsA,
    aOrigin: 'Operator rosters',
    b: mountainsB,
    bOrigin: "Climber's own declaration",
    resolved: null, // human-required: sits unresolved until a person decides
    format: (v) => `${v as number}`,
    downstream: [],
    resolve: (policy) => resolveConflict(mountainsA, mountainsB, policy, mountainsFn),
  }

  // 5. Ambient pressure — two sensors on one route, 9 hPa apart.
  const pressureRouteIndex = 9 // Denali
  const pressureRegion = REGIONS[pressureRouteIndex].name
  const pressureRoute = ROUTE_NAMES[pressureRouteIndex]
  const pressureLabel = `${pressureRoute} (${pressureRegion})`
  const pressureA = observed(weatherFeed.def.id, `${slugify(pressureRegion)}:ambient_pressure_hpa`, 862, weatherFeed.reliability, {
    recordedAt: hoursAgo(0.5),
  })
  const pressureB = observed(weatherFeed.def.id, `${slugify(pressureRegion)}:ambient_pressure_hpa`, 871, weatherFeed.reliability, {
    recordedAt: hoursAgo(0.3),
  })
  const pressureFn = conflictFnSlug(pressureLabel, 'Ambient pressure')
  const pressurePolicyRangeMerge: ConflictPolicy = {
    id: 'conflict-pressure-range-merge',
    property: 'Sensor.ambientPressure',
    strategy: 'range-merge',
    rationale: 'Two working sensors reporting close but different values means the true pressure lies somewhere in the interval, not at either single reading.',
  }
  const pressurePolicyMostRecent: ConflictPolicy = {
    id: 'conflict-pressure-most-recent',
    property: 'Sensor.ambientPressure',
    strategy: 'most-recent',
    rationale: 'The most recently recorded reading is presumed current.',
  }
  const pressurePolicyHighestConfidence: ConflictPolicy = {
    id: 'conflict-pressure-highest-confidence',
    property: 'Sensor.ambientPressure',
    strategy: 'highest-confidence',
    rationale: 'The higher-confidence sensor reading is trusted.',
  }
  function isRange(v: unknown): v is { min: number; max: number } {
    return typeof v === 'object' && v !== null && 'min' in v && 'max' in v
  }
  function resolvePressure(policy: ConflictPolicy): TracedValue<unknown> | null {
    if (policy.strategy === 'range-merge') return resolveRangeMerge(pressureA, pressureB, pressureFn)
    return resolveConflict(pressureA, pressureB, policy, pressureFn)
  }
  const pressureConflict: Conflict = {
    id: 'conflict-pressure',
    entityLabel: pressureLabel,
    propertyLabel: 'Ambient pressure',
    policy: pressurePolicyRangeMerge,
    availablePolicies: [pressurePolicyRangeMerge, pressurePolicyMostRecent, pressurePolicyHighestConfidence],
    a: pressureA,
    aOrigin: 'Sensor mesh (sensor 1)',
    b: pressureB,
    bOrigin: 'Sensor mesh (sensor 2)',
    resolved: resolvePressure(pressurePolicyRangeMerge),
    format: (v) => (isRange(v) ? `${v.min}–${v.max} hPa` : `${v as number} hPa`),
    downstream: [],
    resolve: resolvePressure,
  }

  const conflicts: Conflict[] = [dobConflict, hrConflict, nationalityConflict, ethnicityDeclaredConflict, mountainsConflict, pressureConflict]

  // -- identity records + the ASE serial (S9.5b) -----------------------------
  // One lead guide per operator (not per climber) — climbers under the same
  // operator genuinely share a guide.
  const operatorLeadGuideNames = operatorNames.map(() => {
    const pool = rng.pick(NAME_POOLS)
    return `${rng.pick(pool.first)} ${rng.pick(pool.last)}`
  })
  // Rope partners: the first two climbers under an operator with 2+ climbers
  // are paired — a real relationship, not a described one, so "stored
  // redundantly on both sides" (S9.5, WHAT WE GOT WRONG) is inspectable.
  const climbersByOperator = new Map<number, number[]>()
  climberOperatorIndex.forEach((opIdx, climberIdx) => {
    const list = climbersByOperator.get(opIdx) ?? []
    list.push(climberIdx)
    climbersByOperator.set(opIdx, list)
  })
  const ropePartnerOf = new Map<number, number>()
  for (const indices of climbersByOperator.values()) {
    if (indices.length >= 2) {
      ropePartnerOf.set(indices[0], indices[1])
      ropePartnerOf.set(indices[1], indices[0])
    }
  }

  const findingById = new Map(findings.map((f) => [f.id, f]))
  const identityInputs: ClimberIdentityInput[] = climbers.map((c, i) => {
    const opIdx = climberOperatorIndex[i]
    const routeIdx = operatorRouteIndex[opIdx]
    const registryCountry = REGIONS[routeIdx].country
    const partnerIdx = ropePartnerOf.get(i)
    const finding = c.findingId ? findingById.get(c.findingId) : undefined
    return {
      id: c.id,
      name: c.name,
      countryOfOrigin: climberCountries[i],
      registryCountry,
      operatorName: operatorNames[opIdx],
      leadGuideName: operatorLeadGuideNames[opIdx],
      ropePartnerId: partnerIdx !== undefined ? climbers[partnerIdx].id : null,
      partyMemberNames: (climbersByOperator.get(opIdx) ?? []).filter((idx) => idx !== i).map((idx) => climberNames[idx]),
      findingKind: finding?.kind ?? null,
      entityLabel: c.name.value,
      dateOfBirthOverride: i === 0 ? (dobConflict.resolved as TracedValue<string> | null) : null,
      nationalityOverride: i === 10 ? (nationalityConflict.resolved as TracedValue<string> | null) : null,
      currentCampOverride: null,
    }
  })
  const {
    records: identityRecords,
    anteMortems,
    collisions: serialCollisions,
    physicalParts,
  } = buildIdentityRecords(identityInputs, conflicts, rng, permit.def.id, permit.reliability, buildNow)

  // -- Source Records identity cards (S9.6 rebuild) --------------------------
  const identityCardInputs: IdentityCardInput[] = climbers.map((c, i) => {
    const opIdx = climberOperatorIndex[i]
    const routeIdx = operatorRouteIndex[opIdx]
    const partnerIdx = ropePartnerOf.get(i)
    return {
      id: c.id,
      name: c.name.value,
      operatorName: operatorNames[opIdx],
      leadGuideName: operatorLeadGuideNames[opIdx],
      routeName: ROUTE_NAMES[routeIdx],
      registryCountry: REGIONS[routeIdx].country,
      ropePartnerId: partnerIdx !== undefined ? climbers[partnerIdx].id : null,
      partyMemberNames: (climbersByOperator.get(opIdx) ?? []).filter((idx) => idx !== i).map((idx) => climberNames[idx]),
    }
  })
  const identityCards = buildIdentityCards(
    identityCardInputs,
    identityRecords,
    anteMortems,
    physicalParts,
    conflicts,
    rng,
    permit.def.id,
    permit.reliability,
    buildNow
  )

  // -- per-person entity-resolution scoring (S9.6 rebuild) --------------------
  const personScoring = buildPersonScoring(
    climbers.map((c, i) => ({ id: c.id, name: c.name.value, operatorName: operatorNames[climberOperatorIndex[i]] })),
    { permit: permit.def.name, roster: roster.def.name, medical: medical.def.name },
    rng
  )

  // -- reasoning engine (S9.8) inputs, built early because the context ------
  // -- engine's own readings (below) need `toAffectedPerson` too -----------
  // The Khumbu / Everest Base Camp route continues S9.7's sensor 4 example.
  // "Eleven climbers above Camp II" and the four flagged for low blood
  // oxygen are a deliberately-selected real cohort for this worked
  // scenario (their own randomly-assigned Identity-tab trail position is a
  // separate, independent fact — this is the Reasoning tab's own worked
  // example, same as S9.6's James Marshall III cluster is Identity's).
  const khumbuOperatorNames = ROUTE_OPERATORS[0]
  const reasoningAffectedIndices = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
  const reasoningLowOxygenIndices = [1, 3, 5, 7]
  function toAffectedPerson(climberIdx: number) {
    const climberId = climbers[climberIdx].id
    const record = identityRecords.get(climberId)!
    const card = identityCards.get(climberId)!
    return { climberId, name: record.who.fullLegalName.value, serial: record.serial.value, positionTraced: card.footer.camp }
  }
  const reasoningAffected = reasoningAffectedIndices.map(toAffectedPerson)
  const reasoningLowOxygenAffected = reasoningLowOxygenIndices.map(toAffectedPerson)
  const reasoningIndependentlyConfirmedIds = new Set(reasoningLowOxygenIndices.slice(0, 2).map((i) => climbers[i].id))

  // -- context engine (S9.7 rebuild) -------------------------------------------
  // Five readings, one per real source, each about a real entity built
  // above. The sensor-mesh and medical-logs readings about Nima Tamang
  // deliberately reuse `nimaSpo2Current`/`nimaSpo2Baseline` (captured out of
  // the climbers loop) instead of re-observing the same facts under a
  // second id — a real shared TracedValue, so `dependents()` on THIS tab's
  // own bound statement walks to the physiological_outlier finding below,
  // to reasoning.ts's outlier answer, and to the Detection tab — not three
  // parallel retellings of the same 84%→81% drop.
  function aboutClimber(climberIdx: number, extra: string): ReadingAbout {
    const person = toAffectedPerson(climberIdx)
    return { kind: 'climber', climberId: person.climberId, label: person.name, serial: person.serial, extra }
  }
  function fieldTv(source: SourceRuntime, key: string, value: unknown, agoSec: number): TracedValue<unknown> {
    return observed(source.def.id, key, value, source.reliability, { recordedAt: secondsAgo(agoSec) })
  }

  const nimaCard = identityCards.get(climbers[nimaIndex].id)!
  const nimaRecord = identityRecords.get(climbers[nimaIndex].id)!
  const nimaAbout = aboutClimber(nimaIndex, `${nimaRecord.contacts.operatorName.value} · ${nimaCard.footer.camp.value}`)

  const permitPersonIdx = 3
  const permitCard = identityCards.get(climbers[permitPersonIdx].id)!
  const permitRecord = identityRecords.get(climbers[permitPersonIdx].id)!
  const permitAbout = aboutClimber(permitPersonIdx, `${permitRecord.contacts.operatorName.value} · ${permitCard.footer.camp.value}`)

  const meaningOperatorIdx = 0 // ROUTE_OPERATORS[0][0] — the same Khumbu operator S9.8's worked scenario uses
  const meaningOperatorName = operatorNames[meaningOperatorIdx]
  const meaningOperatorClimberCount = climberOperatorIndex.filter((idx) => idx === meaningOperatorIdx).length

  const sensorRawTvs = new Map<string, TracedValue<unknown>>([
    ['DEV_ID', fieldTv(sensorMesh, 'DEV_ID', 'SNS-KHM-004', 6)],
    ['TS', fieldTv(sensorMesh, 'TS', 1754130921, 6)],
    ['SPO2_VAL', nimaSpo2Current!],
    ['HR', fieldTv(sensorMesh, 'HR', 128, 6)],
    ['AMB_P', fieldTv(sensorMesh, 'AMB_P', 405, 6)],
    ['LAT', fieldTv(sensorMesh, 'LAT', 27.9881, 6)],
    ['LON', fieldTv(sensorMesh, 'LON', 86.925, 6)],
    ['BATT', fieldTv(sensorMesh, 'BATT', 0.34, 6)],
    ['FW', fieldTv(sensorMesh, 'FW', '2.1.7', 6)],
  ])
  const sensorRaw = { DEV_ID: 'SNS-KHM-004', TS: 1754130921, SPO2_VAL: 81, HR: 128, AMB_P: 405, LAT: 27.9881, LON: 86.925, BATT: 0.34, FW: '2.1.7' }

  const weatherRaw = { TEMP_C: -18, CONDITIONS: 'Clear', PRESSURE_HPA: 610, VISIBILITY_KM: 12, ROUTE_CODE: 'EBC-STD', FORECAST_CONFIDENCE_PCT: 92 }
  const weatherRawTvs = new Map<string, TracedValue<unknown>>(Object.entries(weatherRaw).map(([k, v]) => [k, fieldTv(weatherFeed, k, v, 9)]))

  const medicalRaw = { BLOOD_GROUP: 'O+', ALLERGIES: 'None recorded', RESTING_HR_BPM: 58, SPO2_BASELINE_PCT: 90 }
  const medicalRawTvs = new Map<string, TracedValue<unknown>>([
    ['BLOOD_GROUP', fieldTv(medical, 'BLOOD_GROUP', medicalRaw.BLOOD_GROUP, 22)],
    ['ALLERGIES', fieldTv(medical, 'ALLERGIES', medicalRaw.ALLERGIES, 22)],
    ['RESTING_HR_BPM', fieldTv(medical, 'RESTING_HR_BPM', medicalRaw.RESTING_HR_BPM, 22)],
    ['SPO2_BASELINE_PCT', nimaSpo2Baseline!],
  ])

  const permitRaw = { PERMIT_NO: 'NP-2026-00417', DATE_OF_BIRTH: '1990-03-14', NATIONALITY: 'United States' }
  const permitRawTvs = new Map<string, TracedValue<unknown>>(Object.entries(permitRaw).map(([k, v]) => [k, fieldTv(permit, k, v, 55)]))

  const rosterRaw = { OPERATOR_NAME: meaningOperatorName, ROUTE_CODE: 'EBC-STD', CLIMBER_COUNT: meaningOperatorClimberCount, ASCENT_RATE_30D_PCT: 100 }
  const rosterRawTvs = new Map<string, TracedValue<unknown>>(Object.entries(rosterRaw).map(([k, v]) => [k, fieldTv(roster, k, v, 90)]))

  const contextEngine = buildContextEngine([
    {
      id: 'reading-sensor-nima',
      source: wearableOximeter.def.name,
      about: nimaAbout,
      arrivedAt: secondsAgo(4),
      takenAt: secondsAgo(6),
      raw: sensorRaw,
      rawFieldTvs: sensorRawTvs,
      headlineFieldKey: 'SPO2_VAL',
      headline: 'Blood oxygen fell to 81%',
    },
    {
      id: 'reading-weather-ebc',
      source: weatherFeed.def.name,
      about: { kind: 'route', label: 'Everest Base Camp route' },
      arrivedAt: secondsAgo(9),
      takenAt: null,
      raw: weatherRaw,
      rawFieldTvs: weatherRawTvs,
      headlineFieldKey: 'CONDITIONS',
      headline: 'Clear, -18°C along the ridge',
    },
    {
      id: 'reading-medical-nima',
      source: medical.def.name,
      about: nimaAbout,
      arrivedAt: secondsAgo(22),
      takenAt: null,
      raw: medicalRaw,
      rawFieldTvs: medicalRawTvs,
      headlineFieldKey: 'BLOOD_GROUP',
      headline: 'Blood group recorded',
    },
    {
      id: 'reading-permit',
      source: permit.def.name,
      about: permitAbout,
      arrivedAt: secondsAgo(55),
      takenAt: null,
      raw: permitRaw,
      rawFieldTvs: permitRawTvs,
      headlineFieldKey: 'PERMIT_NO',
      headline: 'Permit verified against the registry',
    },
    {
      id: 'reading-roster',
      source: roster.def.name,
      about: { kind: 'operator', label: meaningOperatorName },
      arrivedAt: secondsAgo(90),
      takenAt: null,
      raw: rosterRaw,
      rawFieldTvs: rosterRawTvs,
      headlineFieldKey: 'CLIMBER_COUNT',
      headline: `${meaningOperatorClimberCount} climbers under this operator, ascent rate at the 30-day norm`,
    },
  ])

  const nimaFinding = findings.find((f) => f.kind === 'physiological_outlier')!
  const duplicateFinding = findings.find((f) => f.id === 'finding-dup-20')!
  const reasoningEngine = buildReasoningEngine(
    {
      sensorMesh: { id: sensorMesh.def.id, reliability: sensorMesh.reliability },
      weatherFeed: { id: weatherFeed.def.id, reliability: weatherFeed.reliability },
      medicalLogs: { id: medical.def.id, reliability: medical.reliability },
      operatorRosters: { id: roster.def.id, reliability: roster.reliability },
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
      sensorMesh: { id: sensorMesh.def.id, reliability: sensorMesh.reliability },
      medicalLogs: { id: medical.def.id, reliability: medical.reliability },
    }
  )

  // -- detection engine (S9.9) ---------------------------------------------
  // NO CODE anywhere on this tab — every DetectionRule.conditionSentence is
  // plain English; the number it implies lives separately in
  // thresholdValue/thresholdUnit/thresholdDirection, which Tuning drags.
  // The map's five tiers are the REAL hierarchy already built above
  // (country -> region/route -> operator -> climber, sensors branching off
  // their route) — all 113 entities plus 14 route sensors, not an
  // illustrative subset. The low-blood-oxygen cohort deliberately reuses
  // S9.8's own four affected climbers (climbers[1,3,5,7]) and sensor 1
  // reuses S9.8's exact 78 kph reading — narrative continuity with the
  // Reasoning tab's worked example, same discipline as S9.7/S9.9's other
  // cross-tab reuses.
  function minutesAgo(m: number): Instant {
    return secondsAgo(m * 60)
  }
  const detectionRules = builtInDetectionRules()
  const detectionCountryNames = Array.from(new Set(REGIONS.map((r) => r.country)))
  const detectionMapNodeInputs: MapNodeInput[] = []
  for (const country of detectionCountryNames) {
    detectionMapNodeInputs.push({ id: `country:${country}`, tier: 'country', label: country, parentId: null })
  }
  REGIONS.forEach((region, routeIdx) => {
    detectionMapNodeInputs.push({
      id: `route:${routeIdx}`,
      tier: 'regionRoute',
      label: `${region.name} — ${ROUTE_NAMES[routeIdx]}`,
      parentId: `country:${region.country}`,
    })
    detectionMapNodeInputs.push({ id: `sensor:${routeIdx}`, tier: 'sensor', label: `Sensor ${routeIdx + 1}`, parentId: `route:${routeIdx}` })
  })
  operatorNames.forEach((name, flatIdx) => {
    detectionMapNodeInputs.push({ id: `operator:${flatIdx}`, tier: 'operator', label: name, parentId: `route:${operatorRouteIndex[flatIdx]}` })
  })
  climbers.forEach((c, i) => {
    const record = identityRecords.get(c.id)!
    detectionMapNodeInputs.push({
      id: `climber:${c.id}`,
      tier: 'climber',
      label: record.who.fullLegalName.value,
      parentId: `operator:${climberOperatorIndex[i]}`,
      climberId: c.id,
      serial: record.serial.value,
    })
  })

  function climberSubject(idx: number): DetectionSubject {
    const c = climbers[idx]
    const record = identityRecords.get(c.id)!
    return { kind: 'climber', nodeId: `climber:${c.id}`, climberId: c.id, name: record.who.fullLegalName.value, serial: record.serial.value }
  }
  function sensorSubject(routeIdx: number): DetectionSubject {
    return { kind: 'sensor', nodeId: `sensor:${routeIdx}`, label: `Sensor ${routeIdx + 1}`, routeLabel: ROUTE_NAMES[routeIdx] }
  }
  function operatorSubject(flatIdx: number): DetectionSubject {
    return { kind: 'operator', nodeId: `operator:${flatIdx}`, label: operatorNames[flatIdx] }
  }

  const rule = (id: string) => detectionRules.find((r) => r.id === id)!
  const spo2Rule = rule('rule-low-spo2')
  const windRule = rule('rule-dangerous-wind')
  const pulseRule = rule('rule-high-pulse')
  const fastRule = rule('rule-climbing-too-fast')
  const guidesRule = rule('rule-not-enough-guides')
  const visRule = rule('rule-visibility-collapse')
  const battRule = rule('rule-low-battery')
  const pressureRule = rule('rule-pressure-mismatch')

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
    // Low blood oxygen — the same four climbers S9.8's wind scenario flags.
    { ruleId: spo2Rule.id, subject: climberSubject(1), value: 71, startValue: 88, minutesAgo: 9, sourceId: sensorMesh.def.id, reliability: sensorMesh.reliability, rawField: `${climbers[1].id}:spo2_pct` },
    { ruleId: spo2Rule.id, subject: climberSubject(3), value: 74, startValue: 89, minutesAgo: 14, sourceId: sensorMesh.def.id, reliability: sensorMesh.reliability, rawField: `${climbers[3].id}:spo2_pct` },
    { ruleId: spo2Rule.id, subject: climberSubject(5), value: 76, startValue: 87, minutesAgo: 22, sourceId: sensorMesh.def.id, reliability: sensorMesh.reliability, rawField: `${climbers[5].id}:spo2_pct` },
    { ruleId: spo2Rule.id, subject: climberSubject(7), value: 79, startValue: 90, minutesAgo: 6, sourceId: sensorMesh.def.id, reliability: sensorMesh.reliability, rawField: `${climbers[7].id}:spo2_pct` },
    // Dangerous wind — sensor 1 (Khumbu/EBC) reuses S9.8's exact 78 kph.
    { ruleId: windRule.id, subject: sensorSubject(0), value: 78, startValue: 52, minutesAgo: 41, sourceId: weatherFeed.def.id, reliability: weatherFeed.reliability, rawField: 'sensor1:wind_kph' },
    { ruleId: windRule.id, subject: sensorSubject(1), value: 75, startValue: 60, minutesAgo: 15, sourceId: weatherFeed.def.id, reliability: weatherFeed.reliability, rawField: 'sensor2:wind_kph' },
    { ruleId: windRule.id, subject: sensorSubject(4), value: 82, startValue: 58, minutesAgo: 8, sourceId: weatherFeed.def.id, reliability: weatherFeed.reliability, rawField: 'sensor5:wind_kph' },
    // Sustained high pulse
    { ruleId: pulseRule.id, subject: climberSubject(nimaIndex), value: 134, startValue: 98, minutesAgo: 12, sourceId: sensorMesh.def.id, reliability: sensorMesh.reliability, rawField: `${climbers[nimaIndex].id}:hr_bpm` },
    { ruleId: pulseRule.id, subject: climberSubject(30), value: 125, startValue: 100, minutesAgo: 25, sourceId: sensorMesh.def.id, reliability: sensorMesh.reliability, rawField: `${climbers[30].id}:hr_bpm` },
    // Climbing too fast — three real candidates, one pre-suppressed (Tuning's worked suppression example).
    { ruleId: fastRule.id, subject: climberSubject(31), value: 620, startValue: 340, minutesAgo: 220, sourceId: roster.def.id, reliability: roster.reliability, rawField: `${climbers[31].id}:ascent_rate_m_per_day` },
    { ruleId: fastRule.id, subject: climberSubject(32), value: 550, startValue: 360, minutesAgo: 340, sourceId: roster.def.id, reliability: roster.reliability, rawField: `${climbers[32].id}:ascent_rate_m_per_day` },
    {
      ruleId: fastRule.id,
      subject: climberSubject(36),
      value: 540,
      startValue: 350,
      minutesAgo: 120,
      sourceId: roster.def.id,
      reliability: roster.reliability,
      rawField: `${climbers[36].id}:ascent_rate_m_per_day`,
      suppressed: true,
    },
    // Not enough guides
    { ruleId: guidesRule.id, subject: operatorSubject(5), value: 0.5, startValue: 1.2, minutesAgo: 50, sourceId: roster.def.id, reliability: roster.reliability, rawField: 'operator-5:guides_per_party' },
    // Visibility collapse
    { ruleId: visRule.id, subject: sensorSubject(9), value: 150, startValue: 900, minutesAgo: 18, sourceId: weatherFeed.def.id, reliability: weatherFeed.reliability, rawField: 'sensor10:visibility_m' },
    // Low battery — a route sensor's own device health, GPS tracker's network.
    { ruleId: battRule.id, subject: sensorSubject(2), value: 15, startValue: 45, minutesAgo: 90, sourceId: gpsTracker.def.id, reliability: gpsTracker.reliability, rawField: 'sensor3:battery_pct' },
    { ruleId: battRule.id, subject: sensorSubject(6), value: 12, startValue: 40, minutesAgo: 130, sourceId: gpsTracker.def.id, reliability: gpsTracker.reliability, rawField: 'sensor7:battery_pct' },
    // Pressure mismatch — altitude discrepancy is a position reading, GPS tracker's.
    { ruleId: pressureRule.id, subject: climberSubject(33), value: 310, startValue: 40, minutesAgo: 65, sourceId: gpsTracker.def.id, reliability: gpsTracker.reliability, rawField: `${climbers[33].id}:altitude_discrepancy_m` },
  ]

  const detections: Detection[] = firingPlan.map((item, i) => {
    const r = rule(item.ruleId)
    const valueTraced = observed(item.sourceId, item.rawField, item.value, item.reliability, { recordedAt: minutesAgo(item.minutesAgo) })
    const id = `detection-${i + 1}`
    const series = generateSeries(id, item.value, item.startValue, r.windowMinutes)
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
    { id: 'resolved-1', ruleId: battRule.id, subject: sensorSubject(11), clearedAt: minutesAgo(25), ranForMinutes: 40, clearedBy: 'Battery replaced by field team', flapping: false },
    { id: 'resolved-2', ruleId: pulseRule.id, subject: climberSubject(34), clearedAt: minutesAgo(10), ranForMinutes: 8, clearedBy: 'Pulse returned below 120 bpm', flapping: true },
    { id: 'resolved-3', ruleId: visRule.id, subject: sensorSubject(12), clearedAt: minutesAgo(5), ranForMinutes: 15, clearedBy: 'Visibility recovered above 200 m', flapping: false },
  ]

  const detectionSuppressions: Suppression[] = [
    {
      id: 'suppression-1',
      ruleId: fastRule.id,
      subject: climberSubject(36),
      reason: 'Guide confirmed this pace is expected — a planned training descent, not an uncontrolled ascent.',
      setBy: 'Lead guide, Khumbu Vertical',
      setAt: hoursAgo(2),
      expiresAt: instant(new Date(buildNow + 22 * 60 * 60 * 1000).toISOString()),
    },
  ]

  // Tuning's background population: every entity a rule watches, not just
  // the ones firing. Firing entities keep their real value; everyone else
  // gets a deterministic (not RNG-stream-consuming — `stableUnit`, same
  // technique as the sparkline generator) synthetic value scattered around
  // the threshold, so dragging the slider has a real distribution to move
  // through. Real named entities throughout — never a placeholder "Climber A".
  function syntheticMember(rule: DetectionRule, subject: DetectionSubject, nodeId: string, firingByNodeId: Map<string, Detection>): TuningPopulationMember {
    const firing = firingByNodeId.get(nodeId)
    if (firing) return { subject, value: firing.valueTraced.value, actuallyDeteriorated: true }
    const spread = (rule.thresholdValue || 20) * 0.35
    const safeBias = rule.thresholdDirection === 'below' ? spread * 0.6 : -spread * 0.6
    const offset = (stableUnit(`${rule.id}:${nodeId}`) - 0.5) * 2 * spread + safeBias
    const value = Math.max(0, rule.thresholdValue + offset)
    const actuallyDeteriorated = stableUnit(`${rule.id}:${nodeId}:gt`) < 0.06
    return { subject, value, actuallyDeteriorated }
  }
  function buildPopulationFor(r: DetectionRule): TuningPopulationMember[] {
    const firingByNodeId = new Map(detections.filter((d) => d.ruleId === r.id && d.subject.kind !== 'system').map((d) => [(d.subject as { nodeId: string }).nodeId, d]))
    if (r.watches === 'climbers') return climbers.map((c, i) => syntheticMember(r, climberSubject(i), `climber:${c.id}`, firingByNodeId))
    if (r.watches === 'sensors') return REGIONS.map((_, routeIdx) => syntheticMember(r, sensorSubject(routeIdx), `sensor:${routeIdx}`, firingByNodeId))
    if (r.watches === 'operators') return operatorNames.map((_, flatIdx) => syntheticMember(r, operatorSubject(flatIdx), `operator:${flatIdx}`, firingByNodeId))
    return []
  }
  const tuningPopulations = new Map(detectionRules.map((r) => [r.id, buildPopulationFor(r)]))

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
  // monitor reports about the graph as a whole, not a per-climber rollup.
  // 113 = Country(5) + Region(14) + Route(14) + Operator(30) + Climber(50);
  // Sensor's 14 are tracked separately, one per route.
  const entitiesTracked = observed(sourceId('kg-builder-monitor'), 'entity_count', 113, sourceReliability(0.99))

  const climberStatusIds = climbers.map((c) => c.status.id)
  const meanConfidencePct = derived(
    climberStatusIds,
    derivationFnId('mean-confidence'),
    Math.round(mean(climberStatusIds.map((id) => confidence(resolveOrThrow(id)))) * 100)
  )

  const findingIds = findings.map((f) => f.traced.id)
  const openIssues = derived(findingIds, derivationFnId('count-open-issues'), findings.length)

  const factsSample = [...climberStatusIds.slice(0, 8), ...sources.map((s) => s.reliabilityPct.id)]
  // A live count read straight from the graph itself at this point in
  // construction, not a hand-typed number — the one honest way to display
  // "how big is the graph" as a folded fact rather than an authored one.
  const factsHeld = derived(factsSample, derivationFnId('count-facts'), allTraced().length)

  // -- needs you --------------------------------------------------------------
  const needsYou = buildNeedsYou(findings)

  // -- pipeline stages ----------------------------------------------------
  const stages = buildStages(rng, sources)

  // -- ontology (S9.5) ----------------------------------------------------
  const ontology = buildOntology({
    sources,
    climbers,
    conflicts,
    findings,
    meanConfidencePct: meanConfidencePct.value,
    entitiesTracked: entitiesTracked.value,
    regionCountryPairs: REGIONS,
    routeNames: ROUTE_NAMES,
    routeOperatorNames: ROUTE_OPERATORS,
    exampleIdentityRecord: identityRecords.get(climbers[0].id) ?? null,
    serialCollisionCount: serialCollisions.length,
  })

  // -- entity resolution (S9.6) --------------------------------------------
  const entityResolution = buildEntityResolution({
    permit,
    roster,
    medical,
    operatorNames,
    james: { id: climbers[0].id, name: climbers[0].name, serial: identityRecords.get(climbers[0].id)?.serial ?? null },
    buildNowIso: new Date(buildNow).toISOString(),
    rng,
  })

  // -- predictions (S9.10) — reuses Nima Tamang's exact SpO2 chain from
  // above, not a second, unrelated dataset of "who's at risk."
  const predictions = buildPredictions({
    climbers,
    identityRecords,
    identityCards,
    detectionEngine,
    nimaClimberId: `climber-${nimaIndex + 1}`,
    nimaSpo2Baseline: nimaSpo2Baseline!,
    nimaSpo2Current: nimaSpo2Current!,
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
  const exposureMarkers: ExposureClimberMarker[] = []
  for (const c of climbers) {
    const record = identityRecords.get(c.id)
    if (!record) continue
    exposureMarkers.push({
      climberId: c.id,
      name: record.who.fullLegalName.value,
      serial: record.serial.value,
      label: `${record.who.fullLegalName.value} — ASE serial`,
      className: 'Identity',
      marker: record.serial,
    })
  }
  for (const r of contextEngine.readings) {
    const tv = r.rawFieldTvs.get(r.headlineFieldKey)
    if (!tv) continue
    const about = r.about
    exposureMarkers.push({
      climberId: about.kind === 'climber' ? about.climberId : null,
      name: about.kind === 'climber' ? about.label : null,
      serial: about.kind === 'climber' ? about.serial : null,
      label: `${r.source} — ${r.headline}`,
      className: 'Meaning',
      marker: tv,
    })
  }
  for (const d of detections) {
    const subject = d.subject
    const ruleLabel = rule(d.ruleId).label
    exposureMarkers.push({
      climberId: subject.kind === 'climber' ? subject.climberId : null,
      name: subject.kind === 'climber' ? subject.name : null,
      serial: subject.kind === 'climber' ? subject.serial : null,
      label: `${ruleLabel} — ${subject.kind === 'climber' ? subject.name : subject.label}`,
      className: 'Detection',
      marker: d.valueTraced,
    })
  }
  for (const p of predictions.predictions.values()) {
    exposureMarkers.push({
      climberId: p.climberId,
      name: p.name,
      serial: p.serial,
      label: `${p.name} — requires-descent likelihood`,
      className: 'Prediction',
      marker: p.likelihoodTraced,
    })
  }
  const exposureSources = EXPOSURE_SOURCE_NAMES.map((name) => sourceByName.get(name)!)
  const exposure = buildExposureState({ sources: exposureSources, markers: exposureMarkers, buildNowMs: buildNow })

  // -- trust (S9.13) — the system's own decisions/security/quality/
  // connections/performance record. Not domain data, so it needs no rng or
  // buildNow — see trust.ts's own header comment for why.
  const trust = buildTrustState()

  return {
    sources,
    climbers,
    findings,
    conflicts,
    ontology,
    identityRecords,
    anteMortems,
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
  const dup = byKind.get('duplicate_identity') ?? []
  if (dup.length > 0) {
    rows.push({
      id: 'needs-identity',
      count: derived(dup.map((f) => f.traced.id), derivationFnId('count-needs-you'), dup.length),
      sentence:
        dup.length === 1
          ? 'identity merge is too close to call and needs your decision.'
          : 'identity merges are too close to call and need your decision.',
      destinationTab: 'identity',
    })
  }
  const conflicting = byKind.get('conflicting_vital') ?? []
  if (conflicting.length > 0) {
    rows.push({
      id: 'needs-model',
      count: derived(conflicting.map((f) => f.traced.id), derivationFnId('count-needs-you'), conflicting.length),
      sentence: conflicting.length === 1 ? "record doesn't fit the model." : "records don't fit the model.",
      destinationTab: 'model',
    })
  }
  const detection = [...(byKind.get('physiological_outlier') ?? []), ...(byKind.get('silent_sensor') ?? [])]
  if (detection.length > 0) {
    rows.push({
      id: 'needs-detection',
      count: derived(detection.map((f) => f.traced.id), derivationFnId('count-needs-you'), detection.length),
      sentence: detection.length === 1 ? 'rule is firing more often than it should.' : 'rules are firing more often than they should.',
      destinationTab: 'detection',
    })
  }
  return rows
}

function buildStages(rng: Rng, sources: SourceRuntime[]): PipelineStage[] {
  const baseline = rng.int(4200, 4800)
  const throughputs: number[] = []
  let current = baseline
  for (let n = 1; n <= 12; n++) {
    if (n === 3) current = Math.round(current * 0.86) // entity resolution merges duplicates out
    if (n === 10) current = Math.round(current * 0.4) // synthesis collapses facts into fewer answers
    if (n === 12) current = Math.round(current * 0.08) // human feedback loop only carries corrections
    throughputs.push(current)
  }

  const catchingUp = new Set([3, 9])

  // A real chain, stage to stage — each stage's throughput is derived from
  // the previous stage's, not independently authored, so the "reconciles
  // down the chain" requirement is true by construction rather than by
  // coincidence of matching numbers.
  const stages: PipelineStage[] = []
  let previousThroughputId: TracedId | null = null
  for (let i = 0; i < STAGE_DEFS.length; i++) {
    const def = STAGE_DEFS[i]
    const n = i + 1
    const state: StageState = catchingUp.has(n) ? 'catching_up' : 'running'
    const stageInputs: TracedId[] = previousThroughputId !== null ? [previousThroughputId] : sources.map((s) => s.lastSyncAgeSec.id)
    const stageThroughput: TracedValue<number> = derived(stageInputs, derivationFnId(`stage-${n}-throughput`), throughputs[i])
    previousThroughputId = stageThroughput.id
    stages.push({ n, name: def.name, band: def.band, state, throughput: stageThroughput, description: def.description })
  }
  return stages
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
    'last_sync_seconds_ago',
    ageSec,
    sourceReliability(runtime.degraded ? rng.float(0.5, 0.6) : rng.float(0.9, 0.99))
  )
  supersede(current.id, next)
}
