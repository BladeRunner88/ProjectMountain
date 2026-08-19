// S8.7: THE MOUNTAIN'S OWN DATA. TERRAIN needs three things NETWORK/STRATA
// never did — a real elevation profile per line (entry/crux/exit load,
// the shape the height field is generated FROM), a placement for every
// machine on that profile (progress along the line, lateral offset, station,
// a 24h rampUp trail), and a set of "current conditions" for the margin
// readout. All of it derives from the SAME 127-entity dataset (S8.3) the
// other two views read — no new entities, no backend call, just a richer
// deterministic projection of what's already there, the same shape as
// strataLayout.ts deriving a dendrogram from the dataset rather than owning
// its own data.

import { mulberry32, randInt, seedFromString, weightedPick } from "./rng"
import { serialFor } from "./serial"
import { computeWatchIds } from "./watchStatus"
import type { DomainDataset, DomainEntity } from "../types/domain"
import type { GraphId } from "../types/graph"

// Fictional lines, but the load bands are keyed to each country's real
// mountaineering character — Nepal/Pakistan/China(Tibet) run 7-8,000m+,
// the US band sits at Denali's scale, Switzerland at the Alps' — so a
// line's country still shapes what kind of mountain it renders as.
const COUNTRY_TARGET_RANGE_M: Record<string, [number, number]> = {
  Nepal: [7200, 8850],
  Pakistan: [7000, 8611],
  "China (Tibet)": [7000, 8201],
  "United States": [4800, 6194],
  Switzerland: [3800, 4808],
}
const COUNTRY_ENTRY_DROP_M: Record<string, [number, number]> = {
  Nepal: [2200, 3400],
  Pakistan: [2000, 3200],
  "China (Tibet)": [2000, 3000],
  "United States": [1400, 2400],
  Switzerland: [900, 1600],
}
const DEFAULT_TARGET_RANGE: [number, number] = [5000, 7000]
const DEFAULT_ENTRY_DROP: [number, number] = [1500, 2500]

export interface LineProfile {
  lineId: GraphId
  label: string
  countryId: GraphId
  countryLabel: string
  entryLoadM: number
  /** The line's named technical crux — not necessarily the target; sits at `cruxProgress` along the line. */
  cruxLoadM: number
  cruxProgress: number
  /** = the target. */
  exitLoadM: number
  lengthKm: number
  corridorWidthM: number
}

export function buildLineProfiles(
  dataset: DomainDataset
): Map<GraphId, LineProfile> {
  const countryLabelById = new Map<GraphId, string>()
  for (const e of dataset.domainEntities) {
    if (e.tier === "country") countryLabelById.set(e.id, e.label)
  }

  const profiles = new Map<GraphId, LineProfile>()
  for (const line of dataset.domainEntities) {
    if (line.tier !== "line") continue
    const countryLabel = countryLabelById.get(line.countryId) ?? ""
    const targetRange =
      COUNTRY_TARGET_RANGE_M[countryLabel] ?? DEFAULT_TARGET_RANGE
    const entryDrop = COUNTRY_ENTRY_DROP_M[countryLabel] ?? DEFAULT_ENTRY_DROP
    const rand = mulberry32(seedFromString(line.id, 5100))

    const exitLoadM = randInt(rand, targetRange[0], targetRange[1])
    const entryLoadM = exitLoadM - randInt(rand, entryDrop[0], entryDrop[1])
    const cruxProgress = 0.55 + rand() * 0.3
    const cruxLine = entryLoadM + (exitLoadM - entryLoadM) * cruxProgress
    const cruxLoadM = Math.round(
      cruxLine + (rand() - 0.5) * 0.06 * (exitLoadM - entryLoadM)
    )
    const lengthKm = Math.round((8 + rand() * 10) * 10) / 10
    const corridorWidthM = randInt(rand, 220, 620)

    profiles.set(line.id, {
      lineId: line.id,
      label: line.label,
      countryId: line.countryId,
      countryLabel,
      entryLoadM,
      cruxLoadM,
      cruxProgress,
      exitLoadM,
      lengthKm,
      corridorWidthM,
    })
  }
  return profiles
}

/** The smooth (noise-free) centreline load at a point along the line — entry -> crux -> exit, piecewise linear. Shared by machine placement and the height field's own base surface, so neither can drift from the other. */
export function loadAt(profile: LineProfile, progress: number): number {
  const p = Math.min(1, Math.max(0, progress))
  if (p <= profile.cruxProgress) {
    const t = profile.cruxProgress === 0 ? 0 : p / profile.cruxProgress
    return profile.entryLoadM + (profile.cruxLoadM - profile.entryLoadM) * t
  }
  const t = (p - profile.cruxProgress) / (1 - profile.cruxProgress)
  return profile.cruxLoadM + (profile.exitLoadM - profile.cruxLoadM) * t
}

export interface LineConditions {
  vibrationMmS: number
  tempC: number
  oeePct: number
  cycleTimeS: number
}

export function buildLineConditions(lineId: GraphId): LineConditions {
  const rand = mulberry32(seedFromString(lineId, 5200))
  return {
    vibrationMmS: randInt(rand, 12, 95),
    tempC: -randInt(rand, 8, 38),
    oeePct: Math.round((1 + rand() * 13) * 10) / 10,
    cycleTimeS: randInt(rand, 3600, 5600),
  }
}

// -- machine placement --------------------------------------------------

export const STATIONS: readonly { label: string; progress: number }[] = [
  { label: "Base Station", progress: 0.04 },
  { label: "Station I", progress: 0.24 },
  { label: "Station II", progress: 0.46 },
  { label: "Station III", progress: 0.66 },
  { label: "Station IV", progress: 0.85 },
  { label: "Target", progress: 0.98 },
]
const STATION_WEIGHTS: Record<string, number> = {
  "Base Station": 0.12,
  "Station I": 0.16,
  "Station II": 0.24,
  "Station III": 0.24,
  "Station IV": 0.16,
  Target: 0.08,
}

export interface TrailPoint {
  progress: number
  lateral: number
  loadM: number
}

export interface MachinePlacement {
  machineId: GraphId
  lineId: GraphId
  progress: number
  lateral: number
  loadM: number
  station: string
  /** Oldest first; the last entry is the machine's current position. */
  trail: TrailPoint[]
  /** Presentation-only tier between nominal and anomaly: a machine whose status is still 'nominal' but who has at least one of their own sub-nodes flagged 'alert' — a real signal drawn from S8.3's data, not an arbitrary third bucket. */
  watch: boolean
  serial: string
}

function lineIdForMachine(
  byId: ReadonlyMap<GraphId, DomainEntity>,
  machine: DomainEntity
): GraphId | null {
  let current: DomainEntity | undefined = machine
  let hops = 0
  while (current && current.tier !== "line") {
    if (current.parentId === null) return null
    current = byId.get(current.parentId)
    hops++
    if (hops > 6) return null
  }
  return current ? current.id : null
}

export function buildMachinePlacements(
  dataset: DomainDataset,
  profiles: ReadonlyMap<GraphId, LineProfile>
): Map<GraphId, MachinePlacement> {
  const byId = new Map(dataset.domainEntities.map((e) => [e.id, e]))
  const watchIds = computeWatchIds(dataset)

  const placements = new Map<GraphId, MachinePlacement>()
  for (const machine of dataset.domainEntities) {
    if (machine.tier !== "machine") continue
    const lineId = lineIdForMachine(byId, machine)
    const profile = lineId ? profiles.get(lineId) : undefined
    if (!lineId || !profile) continue

    const rand = mulberry32(seedFromString(machine.id, 5300))
    const station = weightedPick(rand, STATION_WEIGHTS)
    const stationDef = STATIONS.find((c) => c.label === station)!
    const progress = Math.min(
      0.995,
      Math.max(0.01, stationDef.progress + (rand() - 0.5) * 0.06)
    )
    // biased toward the corridor centre, same shape as the height field's own density gradient
    const u = rand() * 2 - 1
    const lateral = Math.sign(u) * Math.pow(Math.abs(u), 1.6) * 0.7
    const loadM = Math.round(loadAt(profile, progress))

    const trailSteps = 5 + Math.floor(rand() * 4)
    const trail: TrailPoint[] = []
    for (let i = trailSteps; i >= 0; i--) {
      const back = i * (0.012 + rand() * 0.01)
      const p = Math.max(0.005, progress - back)
      const l = i === 0 ? lateral : lateral + (rand() - 0.5) * 0.12
      trail.push({
        progress: p,
        lateral: l,
        loadM: Math.round(loadAt(profile, p)),
      })
    }

    const watch = watchIds.has(machine.id)
    const serial = serialFor(machine.id)

    placements.set(machine.id, {
      machineId: machine.id,
      lineId,
      progress,
      lateral,
      loadM,
      station,
      trail,
      watch,
      serial,
    })
  }
  return placements
}

/** A line with a currently-anomalous machine on it, so the view opens on something worth looking at rather than an empty mountain — a deliberate, disclosed default, not an arbitrary line-0 pick. */
export function defaultLineId(
  dataset: DomainDataset,
  placements: ReadonlyMap<GraphId, MachinePlacement>
): GraphId {
  for (const machineId of dataset.anomalyMachineIds) {
    const placement = placements.get(machineId)
    if (placement) return placement.lineId
  }
  const anyLine = dataset.domainEntities.find((e) => e.tier === "line")
  return anyLine ? anyLine.id : ""
}

export interface LineMachineSummary {
  totalOnLine: number
  anomalyCount: number
  byStation: { station: string; count: number }[]
}

export function summarizeLineMachines(
  dataset: DomainDataset,
  placements: ReadonlyMap<GraphId, MachinePlacement>,
  lineId: GraphId
): LineMachineSummary {
  const byId = new Map(dataset.domainEntities.map((e) => [e.id, e]))
  const onLine = [...placements.values()].filter((p) => p.lineId === lineId)
  const byStation = STATIONS.map((c) => ({
    station: c.label,
    count: onLine.filter((p) => p.station === c.label).length,
  }))
  const anomalyCount = onLine.filter(
    (p) => byId.get(p.machineId)?.status === "anomaly"
  ).length
  return { totalOnLine: onLine.length, anomalyCount, byStation }
}
