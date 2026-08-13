// S8.7: THE MOUNTAIN'S OWN DATA. TERRAIN needs three things NETWORK/STRATA
// never did — a real elevation profile per route (entry/crux/exit altitude,
// the shape the height field is generated FROM), a placement for every
// climber on that profile (progress along the route, lateral offset, camp,
// a 24h ascent trail), and a set of "current conditions" for the margin
// readout. All of it derives from the SAME 127-entity dataset (S8.3) the
// other two views read — no new entities, no backend call, just a richer
// deterministic projection of what's already there, the same shape as
// strataLayout.ts deriving a dendrogram from the dataset rather than owning
// its own data.

import { mulberry32, randInt, seedFromString, weightedPick } from './rng'
import { serialFor } from './serial'
import { computeWatchIds } from './watchStatus'
import type { DomainDataset, DomainEntity } from '../types/domain'
import type { GraphId } from '../types/graph'

// Fictional routes, but the altitude bands are keyed to each country's real
// mountaineering character — Nepal/Pakistan/China(Tibet) run 7-8,000m+,
// the US band sits at Denali's scale, Switzerland at the Alps' — so a
// route's country still shapes what kind of mountain it renders as.
const COUNTRY_SUMMIT_RANGE_M: Record<string, [number, number]> = {
  Nepal: [7200, 8850],
  Pakistan: [7000, 8611],
  'China (Tibet)': [7000, 8201],
  'United States': [4800, 6194],
  Switzerland: [3800, 4808],
}
const COUNTRY_ENTRY_DROP_M: Record<string, [number, number]> = {
  Nepal: [2200, 3400],
  Pakistan: [2000, 3200],
  'China (Tibet)': [2000, 3000],
  'United States': [1400, 2400],
  Switzerland: [900, 1600],
}
const DEFAULT_SUMMIT_RANGE: [number, number] = [5000, 7000]
const DEFAULT_ENTRY_DROP: [number, number] = [1500, 2500]

export interface RouteProfile {
  routeId: GraphId
  label: string
  countryId: GraphId
  countryLabel: string
  entryAltitudeM: number
  /** The route's named technical crux — not necessarily the summit; sits at `cruxProgress` along the route. */
  cruxAltitudeM: number
  cruxProgress: number
  /** = the summit. */
  exitAltitudeM: number
  lengthKm: number
  corridorWidthM: number
}

export function buildRouteProfiles(dataset: DomainDataset): Map<GraphId, RouteProfile> {
  const countryLabelById = new Map<GraphId, string>()
  for (const e of dataset.domainEntities) {
    if (e.tier === 'country') countryLabelById.set(e.id, e.label)
  }

  const profiles = new Map<GraphId, RouteProfile>()
  for (const route of dataset.domainEntities) {
    if (route.tier !== 'route') continue
    const countryLabel = countryLabelById.get(route.countryId) ?? ''
    const summitRange = COUNTRY_SUMMIT_RANGE_M[countryLabel] ?? DEFAULT_SUMMIT_RANGE
    const entryDrop = COUNTRY_ENTRY_DROP_M[countryLabel] ?? DEFAULT_ENTRY_DROP
    const rand = mulberry32(seedFromString(route.id, 5100))

    const exitAltitudeM = randInt(rand, summitRange[0], summitRange[1])
    const entryAltitudeM = exitAltitudeM - randInt(rand, entryDrop[0], entryDrop[1])
    const cruxProgress = 0.55 + rand() * 0.3
    const cruxLine = entryAltitudeM + (exitAltitudeM - entryAltitudeM) * cruxProgress
    const cruxAltitudeM = Math.round(cruxLine + (rand() - 0.5) * 0.06 * (exitAltitudeM - entryAltitudeM))
    const lengthKm = Math.round((8 + rand() * 10) * 10) / 10
    const corridorWidthM = randInt(rand, 220, 620)

    profiles.set(route.id, {
      routeId: route.id,
      label: route.label,
      countryId: route.countryId,
      countryLabel,
      entryAltitudeM,
      cruxAltitudeM,
      cruxProgress,
      exitAltitudeM,
      lengthKm,
      corridorWidthM,
    })
  }
  return profiles
}

/** The smooth (noise-free) centreline altitude at a point along the route — entry -> crux -> exit, piecewise linear. Shared by climber placement and the height field's own base surface, so neither can drift from the other. */
export function altitudeAt(profile: RouteProfile, progress: number): number {
  const p = Math.min(1, Math.max(0, progress))
  if (p <= profile.cruxProgress) {
    const t = profile.cruxProgress === 0 ? 0 : p / profile.cruxProgress
    return profile.entryAltitudeM + (profile.cruxAltitudeM - profile.entryAltitudeM) * t
  }
  const t = (p - profile.cruxProgress) / (1 - profile.cruxProgress)
  return profile.cruxAltitudeM + (profile.exitAltitudeM - profile.cruxAltitudeM) * t
}

export interface RouteConditions {
  windKph: number
  tempC: number
  visibilityKm: number
  freezingLevelM: number
}

export function buildRouteConditions(routeId: GraphId): RouteConditions {
  const rand = mulberry32(seedFromString(routeId, 5200))
  return {
    windKph: randInt(rand, 12, 95),
    tempC: -randInt(rand, 8, 38),
    visibilityKm: Math.round((1 + rand() * 13) * 10) / 10,
    freezingLevelM: randInt(rand, 3600, 5600),
  }
}

// -- climber placement --------------------------------------------------

export const CAMPS: readonly { label: string; progress: number }[] = [
  { label: 'Base Camp', progress: 0.04 },
  { label: 'Camp I', progress: 0.24 },
  { label: 'Camp II', progress: 0.46 },
  { label: 'Camp III', progress: 0.66 },
  { label: 'Camp IV', progress: 0.85 },
  { label: 'Summit', progress: 0.98 },
]
const CAMP_WEIGHTS: Record<string, number> = {
  'Base Camp': 0.12,
  'Camp I': 0.16,
  'Camp II': 0.24,
  'Camp III': 0.24,
  'Camp IV': 0.16,
  Summit: 0.08,
}

export interface TrailPoint {
  progress: number
  lateral: number
  altitudeM: number
}

export interface ClimberPlacement {
  climberId: GraphId
  routeId: GraphId
  progress: number
  lateral: number
  altitudeM: number
  camp: string
  /** Oldest first; the last entry is the climber's current position. */
  trail: TrailPoint[]
  /** Presentation-only tier between nominal and anomaly: a climber whose status is still 'nominal' but who has at least one of their own sub-nodes flagged 'alert' — a real signal drawn from S8.3's data, not an arbitrary third bucket. */
  watch: boolean
  serial: string
}

function routeIdForClimber(byId: ReadonlyMap<GraphId, DomainEntity>, climber: DomainEntity): GraphId | null {
  let current: DomainEntity | undefined = climber
  let hops = 0
  while (current && current.tier !== 'route') {
    if (current.parentId === null) return null
    current = byId.get(current.parentId)
    hops++
    if (hops > 6) return null
  }
  return current ? current.id : null
}

export function buildClimberPlacements(dataset: DomainDataset, profiles: ReadonlyMap<GraphId, RouteProfile>): Map<GraphId, ClimberPlacement> {
  const byId = new Map(dataset.domainEntities.map((e) => [e.id, e]))
  const watchIds = computeWatchIds(dataset)

  const placements = new Map<GraphId, ClimberPlacement>()
  for (const climber of dataset.domainEntities) {
    if (climber.tier !== 'climber') continue
    const routeId = routeIdForClimber(byId, climber)
    const profile = routeId ? profiles.get(routeId) : undefined
    if (!routeId || !profile) continue

    const rand = mulberry32(seedFromString(climber.id, 5300))
    const camp = weightedPick(rand, CAMP_WEIGHTS)
    const campDef = CAMPS.find((c) => c.label === camp)!
    const progress = Math.min(0.995, Math.max(0.01, campDef.progress + (rand() - 0.5) * 0.06))
    // biased toward the corridor centre, same shape as the height field's own density gradient
    const u = rand() * 2 - 1
    const lateral = Math.sign(u) * Math.pow(Math.abs(u), 1.6) * 0.7
    const altitudeM = Math.round(altitudeAt(profile, progress))

    const trailSteps = 5 + Math.floor(rand() * 4)
    const trail: TrailPoint[] = []
    for (let i = trailSteps; i >= 0; i--) {
      const back = i * (0.012 + rand() * 0.01)
      const p = Math.max(0.005, progress - back)
      const l = i === 0 ? lateral : lateral + (rand() - 0.5) * 0.12
      trail.push({ progress: p, lateral: l, altitudeM: Math.round(altitudeAt(profile, p)) })
    }

    const watch = watchIds.has(climber.id)
    const serial = serialFor(climber.id)

    placements.set(climber.id, { climberId: climber.id, routeId, progress, lateral, altitudeM, camp, trail, watch, serial })
  }
  return placements
}

/** A route with a currently-anomalous climber on it, so the view opens on something worth looking at rather than an empty mountain — a deliberate, disclosed default, not an arbitrary route-0 pick. */
export function defaultRouteId(dataset: DomainDataset, placements: ReadonlyMap<GraphId, ClimberPlacement>): GraphId {
  for (const climberId of dataset.anomalyClimberIds) {
    const placement = placements.get(climberId)
    if (placement) return placement.routeId
  }
  const anyRoute = dataset.domainEntities.find((e) => e.tier === 'route')
  return anyRoute ? anyRoute.id : ''
}

export interface RouteClimberSummary {
  totalOnRoute: number
  anomalyCount: number
  byCamp: { camp: string; count: number }[]
}

export function summarizeRouteClimbers(dataset: DomainDataset, placements: ReadonlyMap<GraphId, ClimberPlacement>, routeId: GraphId): RouteClimberSummary {
  const byId = new Map(dataset.domainEntities.map((e) => [e.id, e]))
  const onRoute = [...placements.values()].filter((p) => p.routeId === routeId)
  const byCamp = CAMPS.map((c) => ({ camp: c.label, count: onRoute.filter((p) => p.camp === c.label).length }))
  const anomalyCount = onRoute.filter((p) => byId.get(p.climberId)?.status === 'anomaly').length
  return { totalOnRoute: onRoute.length, anomalyCount, byCamp }
}
