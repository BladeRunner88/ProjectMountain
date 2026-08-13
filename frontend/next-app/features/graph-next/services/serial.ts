// S8.8: one shared "serial" generator, reused everywhere an entity needs a
// short deterministic identifier tag — the hover tooltip (NETWORK/STRATA),
// TERRAIN's climber labels (S8.7, refactored here so both call sites can
// never disagree about a given id's serial), and search matching.

import { seedFromString } from './rng'
import type { GraphId } from '../types/graph'

export function serialFor(id: GraphId): string {
  return `•••${1000 + ((seedFromString(id, 9001) >>> 0) % 9000)}`
}

/** S8.5N: the detail panel's own IDENTIFIERS block wants the FULL serial unmasked ("serial, full seven digits") — the header keeps the masked `serialFor()` form used everywhere else (tooltips, search). Same seed root as serialFor, just formatted to all seven digits instead of masking the first three, so the two can never disagree about which entity a given serial belongs to. */
export function fullSerialFor(id: GraphId): string {
  return String(1000000 + ((seedFromString(id, 9001) >>> 0) % 9000000))
}
