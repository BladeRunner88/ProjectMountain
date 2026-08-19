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

/**
 * A machine's coordinates, derived from the country's name rather than looked
 * up in a table of five specific countries.
 *
 * `COUNTRY_BASE_COORD` used to key on five countries the warehouse does not
 * report, so every one missed and every machine on the map fell back to
 * (0, 0) — the Gulf of Guinea. Same dead-lookup bug the country colour table
 * had. Derived coordinates are not real geography, but they are stable per
 * country and they put each country's machines together, which is all the map
 * actually renders.
 */
const LAT_SPAN = 120
const LAT_OFFSET = -60
const LON_SPAN = 360
const LON_OFFSET = -180

function baseCoordFor(country: string): [number, number] {
  const lat = LAT_OFFSET + (Math.abs(seedFromString(country, 6101)) % LAT_SPAN)
  const lon = LON_OFFSET + (Math.abs(seedFromString(country, 6102)) % LON_SPAN)
  return [lat, lon]
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

    const [baseLat, baseLon] = baseCoordFor(lineProfile.countryLabel)
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
      // The country the machine's own plant sits in, not a draw from a pool of
      // sixteen unrelated nationalities.
      originCountry: lineProfile.countryLabel,
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
