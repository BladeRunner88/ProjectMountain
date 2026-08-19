// S8.5N: SIZES. Every node is a filled circle — one shape for everything
// (shape variation was carrying meaning colour/size already carry). Entities
// carry a 1px darker ring (their own outline, not an emphasis ring); sub-
// nodes do not.

import type { EntityTier } from "../types/domain"

export const TIER_RADIUS_PX: Record<EntityTier, number> = {
  country: 5.5,
  plant: 3.5,
  line: 2.75,
  machine: 1.5,
  // S8.5N's own SIZE list doesn't name sensors — a scope decision, disclosed:
  // sensors keep operators' size, the same pairing this file already had
  // before this block (both were 1.75 already).
  sensor: 1.75,
}
// The spec gives these as full sizes (11/7/5.5/3.5/3px) — read here as
// diameters, halved above into the radius every circle draw call actually
// wants, so nothing downstream has to remember to divide by two.

export const SUBNODE_RADIUS_PX = 0.6
export const SUBNODE_ALERT_RADIUS_PX = 1

/** S8.5N: "quietly: same circle, 4px" — environment nodes are a plain circle now, not a diamond. Same full-size/halved-radius convention as TIER_RADIUS_PX above. */
export const ENVIRONMENT_RADIUS_PX = 2

export const DRIFT_AMPLITUDE_BY_TIER: Record<EntityTier, number> = {
  country: 1,
  plant: 2,
  line: 3,
  machine: 5,
  sensor: 4,
}
export const SUBNODE_DRIFT_AMPLITUDE = 7
/** S8.4b: environment nodes aren't an EntityTier (NETWORK-only, never STRATA/TERRAIN), so their drift amplitude lives as its own constant rather than in the Record above. */
export const ENVIRONMENT_DRIFT_AMPLITUDE = 3
