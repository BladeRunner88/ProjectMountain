// S8.9: WHO THEY ARE / WHERE THEY ARE — the investigation panel's own
// machine-identity fields. None of this exists anywhere else in the
// dataset (S8.3 only carries id/tier/label/parentId/countryId/status), so
// it's synthesized here, deterministically, the same "seeded per id, no
// Date.now()" discipline as everything else under src/graph/. Reuses
// TERRAIN's own MachinePlacement (station, line, and — for position —
// progress/lateral/load) rather than inventing a second position, so
// the panel and the mountain can never disagree about where someone is.

import { mulberry32, randInt, seedFromString } from "./rng"
import { LINE_PREFIX_POOL } from "@/features/ase/services/identityCard"
import type { DomainDataset } from "../types/domain"
import type { MachinePlacement, LineProfile } from "./terrainProfile"
import type { GraphId } from "../types/graph"

const ORIGIN_COUNTRY_POOL = [
  "Nepal",
  "India",
  "Pakistan",
  "China",
  "Japan",
  "South Korea",
  "United States",
  "Canada",
  "United Kingdom",
  "France",
  "Germany",
  "Switzerland",
  "Spain",
  "Italy",
  "Poland",
  "Kazakhstan",
]

// Real-ish base coordinates for each campaign country's own high peaks —
// machines are then jittered from here along their actual line position
// (progress/lateral, reused from MachinePlacement) so nearby machines land
// near each other, not scattered at random.
const COUNTRY_BASE_COORD: Record<string, [number, number]> = {
  Nepal: [27.9881, 86.925],
  Pakistan: [35.8825, 76.5133],
  "China (Tibet)": [28.15, 86.85],
  "United States": [63.0692, -151.007],
  Switzerland: [45.9763, 7.6586],
}

export interface MachineProfile {
  machineId: GraphId
  confidencePct: number
  operatorLabel: string
  lineLabel: string
  station: string
  linePrefix: string
  originCountry: string
  dateOfBirthIso: string
  ageYears: number
  targetsCompleted: number
  lat: number
  lon: number
  loadM: number
}

const BUILD_YEAR = 2026

export function buildMachineProfiles(
  dataset: DomainDataset,
  placements: ReadonlyMap<GraphId, MachinePlacement>,
  lineProfiles: ReadonlyMap<GraphId, LineProfile>
): Map<GraphId, MachineProfile> {
  const byId = new Map(dataset.domainEntities.map((e) => [e.id, e]))
  const profiles = new Map<GraphId, MachineProfile>()

  for (const machine of dataset.domainEntities) {
    if (machine.tier !== "machine") continue
    const placement = placements.get(machine.id)
    if (!placement) continue
    const operator = byId.get(machine.parentId ?? "")
    const lineProfile = lineProfiles.get(placement.lineId)
    if (!operator || !lineProfile) continue

    const rand = mulberry32(seedFromString(machine.id, 6100))
    const ageYears = randInt(rand, 23, 61)
    const birthYear = BUILD_YEAR - ageYears
    const birthMonth = randInt(rand, 1, 12)
    const birthDay = randInt(rand, 1, 28)
    const dateOfBirthIso = `${birthYear}-${String(birthMonth).padStart(2, "0")}-${String(birthDay).padStart(2, "0")}`

    const [baseLat, baseLon] = COUNTRY_BASE_COORD[lineProfile.countryLabel] ?? [
      0, 0,
    ]
    const lat = baseLat + placement.lateral * 0.01 + (rand() - 0.5) * 0.002
    const lon =
      baseLon + (placement.progress - 0.5) * 0.02 + (rand() - 0.5) * 0.002

    profiles.set(machine.id, {
      machineId: machine.id,
      confidencePct: randInt(rand, 68, 99),
      operatorLabel: operator.label,
      lineLabel: lineProfile.label,
      station: placement.station,
      linePrefix:
        LINE_PREFIX_POOL[Math.floor(rand() * LINE_PREFIX_POOL.length)],
      originCountry:
        ORIGIN_COUNTRY_POOL[Math.floor(rand() * ORIGIN_COUNTRY_POOL.length)],
      dateOfBirthIso,
      ageYears,
      targetsCompleted: randInt(rand, 0, 14),
      lat,
      lon,
      loadM: placement.loadM,
    })
  }
  return profiles
}
