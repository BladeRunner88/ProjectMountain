// S8.9: WHO THEY ARE / WHERE THEY ARE — the investigation panel's own
// climber-identity fields. None of this exists anywhere else in the
// dataset (S8.3 only carries id/tier/label/parentId/countryId/status), so
// it's synthesized here, deterministically, the same "seeded per id, no
// Date.now()" discipline as everything else under src/graph/. Reuses
// TERRAIN's own ClimberPlacement (camp, route, and — for position —
// progress/lateral/altitude) rather than inventing a second position, so
// the panel and the mountain can never disagree about where someone is.

import { mulberry32, randInt, seedFromString } from './rng'
import { ETHNICITY_POOL } from '../ase/identityCard'
import type { DomainDataset } from './domain'
import type { ClimberPlacement, RouteProfile } from './terrainProfile'
import type { GraphId } from './types'

const ORIGIN_COUNTRY_POOL = [
  'Nepal', 'India', 'Pakistan', 'China', 'Japan', 'South Korea', 'United States', 'Canada',
  'United Kingdom', 'France', 'Germany', 'Switzerland', 'Spain', 'Italy', 'Poland', 'Kazakhstan',
]

// Real-ish base coordinates for each expedition country's own high peaks —
// climbers are then jittered from here along their actual route position
// (progress/lateral, reused from ClimberPlacement) so nearby climbers land
// near each other, not scattered at random.
const COUNTRY_BASE_COORD: Record<string, [number, number]> = {
  Nepal: [27.9881, 86.925],
  Pakistan: [35.8825, 76.5133],
  'China (Tibet)': [28.15, 86.85],
  'United States': [63.0692, -151.007],
  Switzerland: [45.9763, 7.6586],
}

export interface ClimberProfile {
  climberId: GraphId
  confidencePct: number
  operatorLabel: string
  routeLabel: string
  camp: string
  ethnicity: string
  originCountry: string
  dateOfBirthIso: string
  ageYears: number
  summitsCompleted: number
  lat: number
  lon: number
  altitudeM: number
}

const BUILD_YEAR = 2026

export function buildClimberProfiles(
  dataset: DomainDataset,
  placements: ReadonlyMap<GraphId, ClimberPlacement>,
  routeProfiles: ReadonlyMap<GraphId, RouteProfile>,
): Map<GraphId, ClimberProfile> {
  const byId = new Map(dataset.domainEntities.map((e) => [e.id, e]))
  const profiles = new Map<GraphId, ClimberProfile>()

  for (const climber of dataset.domainEntities) {
    if (climber.tier !== 'climber') continue
    const placement = placements.get(climber.id)
    if (!placement) continue
    const operator = byId.get(climber.parentId ?? '')
    const routeProfile = routeProfiles.get(placement.routeId)
    if (!operator || !routeProfile) continue

    const rand = mulberry32(seedFromString(climber.id, 6100))
    const ageYears = randInt(rand, 23, 61)
    const birthYear = BUILD_YEAR - ageYears
    const birthMonth = randInt(rand, 1, 12)
    const birthDay = randInt(rand, 1, 28)
    const dateOfBirthIso = `${birthYear}-${String(birthMonth).padStart(2, '0')}-${String(birthDay).padStart(2, '0')}`

    const [baseLat, baseLon] = COUNTRY_BASE_COORD[routeProfile.countryLabel] ?? [0, 0]
    const lat = baseLat + placement.lateral * 0.01 + (rand() - 0.5) * 0.002
    const lon = baseLon + (placement.progress - 0.5) * 0.02 + (rand() - 0.5) * 0.002

    profiles.set(climber.id, {
      climberId: climber.id,
      confidencePct: randInt(rand, 68, 99),
      operatorLabel: operator.label,
      routeLabel: routeProfile.label,
      camp: placement.camp,
      ethnicity: ETHNICITY_POOL[Math.floor(rand() * ETHNICITY_POOL.length)],
      originCountry: ORIGIN_COUNTRY_POOL[Math.floor(rand() * ORIGIN_COUNTRY_POOL.length)],
      dateOfBirthIso,
      ageYears,
      summitsCompleted: randInt(rand, 0, 14),
      lat,
      lon,
      altitudeM: placement.altitudeM,
    })
  }
  return profiles
}
