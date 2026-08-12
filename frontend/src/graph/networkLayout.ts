// S8.4/8.5: the real dendritic radial layout. S8.5 was handed to this
// session assuming "layout produces ~3,000 points" as an already-true
// starting condition — no 8.4 spec ever arrived to build it. Rendering
// bezier filaments and branch colour against 8.2's flat placeholder ring
// would satisfy none of 8.5's own acceptance line ("the two read as the
// same kind of object"), so this file exists to fill that gap: a genuine
// radial hierarchy (country -> region -> route -> operator/sensor ->
// climber), the same proven technique src/components/demo/graph/layout.ts
// already used for the old 113-entity graph, extended one tier further so
// every entity's own sub-nodes fan outward from it as a terminal spray —
// which is what actually produces the "dendritic... thousands of terminal
// points" read S8.0's reference calls for.
//
// Two-stage, for the same reason as layout.ts's placeholder: the angular
// tree structure only depends on the DATASET (expensive, wedge-splitting
// recursion over ~2,700 nodes), never on canvas SIZE — so it's computed
// once per dataset version and cached here, independent of
// withLayoutSafety's own (dataset, size) memoisation, which only has to do
// cheap polar-to-cartesian conversion on every resize.

import { withLayoutSafety } from './layoutSafety'
import { mulberry32, seedFromString } from './rng'
import type { DomainDataset, DomainEntity, EntityTier } from './domain'
import type { GraphId, Point, Size } from './types'

interface Polar {
  angleRad: number
  radiusFrac: number
}

const TIER_RADIUS_FRAC: Record<EntityTier, number> = {
  country: 0.08,
  region: 0.2,
  route: 0.32,
  operator: 0.44,
  climber: 0.56,
  sensor: 0.56,
}

const SUBNODE_EXTENSION_MIN_FRAC = 0.06
const SUBNODE_EXTENSION_MAX_FRAC = 0.24
const SUBNODE_ANGLE_SPREAD_DEG = 55
const WEDGE_MARGIN = 0.86 // fraction of each slot actually used, leaving a gap between siblings
const ENTITY_ANGLE_JITTER_FRAC = 0.1 // of the entity's own slot width

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180
}

let cachedVersion: number | null = null
let cachedPolar: ReadonlyMap<GraphId, Polar> | null = null

function buildPolarPositions(dataset: DomainDataset): ReadonlyMap<GraphId, Polar> {
  if (cachedVersion === dataset.version && cachedPolar) return cachedPolar

  const polar = new Map<GraphId, Polar>()
  const childrenOf = new Map<GraphId, DomainEntity[]>()
  for (const e of dataset.domainEntities) {
    if (e.parentId === null) continue
    const list = childrenOf.get(e.parentId)
    if (list) list.push(e)
    else childrenOf.set(e.parentId, [e])
  }

  function angleJitterDeg(id: GraphId, slotWidthDeg: number): number {
    const rand = mulberry32(seedFromString(id, 3))
    return (rand() * 2 - 1) * slotWidthDeg * ENTITY_ANGLE_JITTER_FRAC
  }

  function assignWedge(entity: DomainEntity, startDeg: number, endDeg: number) {
    const centerDeg = (startDeg + endDeg) / 2
    const angleDeg = centerDeg + angleJitterDeg(entity.id, endDeg - startDeg)
    polar.set(entity.id, { angleRad: degToRad(angleDeg), radiusFrac: TIER_RADIUS_FRAC[entity.tier] })

    const children = childrenOf.get(entity.id)
    if (!children || children.length === 0) return

    // region -> route is always exactly 1:1 in this dataset (S8.3) — a
    // pass-through that inherits the full wedge rather than narrowing it,
    // since there's nothing to actually split among siblings.
    if (entity.tier === 'region') {
      for (const child of children) assignWedge(child, startDeg, endDeg)
      return
    }

    const slotWidth = (endDeg - startDeg) / children.length
    children.forEach((child, i) => {
      const slotStart = startDeg + i * slotWidth
      const slotEnd = slotStart + slotWidth
      const pad = (slotWidth * (1 - WEDGE_MARGIN)) / 2
      assignWedge(child, slotStart + pad, slotEnd - pad)
    })
  }

  const countries = dataset.domainEntities.filter((e) => e.tier === 'country')
  const countryWedge = 360 / countries.length
  countries.forEach((country, i) => {
    const center = i * countryWedge
    assignWedge(country, center - countryWedge / 2, center + countryWedge / 2)
  })

  // sub-nodes: a terminal spray radiating outward from each entity's own
  // resolved position, not from the graph centre — this is what reads as
  // dendritic rather than just "a bigger ring".
  const subNodesByParent = new Map<GraphId, typeof dataset.subNodes>()
  for (const sub of dataset.subNodes) {
    const list = subNodesByParent.get(sub.parentId)
    if (list) list.push(sub)
    else subNodesByParent.set(sub.parentId, [sub])
  }
  for (const entity of dataset.domainEntities) {
    const parentPolar = polar.get(entity.id)
    if (!parentPolar) continue
    const subs = subNodesByParent.get(entity.id) ?? []
    subs.forEach((sub) => {
      const rand = mulberry32(seedFromString(sub.id, 77))
      const angleOffsetRad = (rand() - 0.5) * degToRad(SUBNODE_ANGLE_SPREAD_DEG)
      const extension = SUBNODE_EXTENSION_MIN_FRAC + rand() * (SUBNODE_EXTENSION_MAX_FRAC - SUBNODE_EXTENSION_MIN_FRAC)
      polar.set(sub.id, {
        angleRad: parentPolar.angleRad + angleOffsetRad,
        radiusFrac: Math.min(0.96, parentPolar.radiusFrac + extension),
      })
    })
  }

  cachedVersion = dataset.version
  cachedPolar = polar
  return polar
}

// S8.4b: "offset from its region at 90° to the branch axis, radius +90px,
// so it visibly branches SIDEWAYS rather than continuing outward." A local
// Cartesian offset from the region's own resolved position — NOT a second
// point on the same polar circle — is what keeps it visually anchored
// beside its region instead of landing who-knows-where around the ring.
const ENVIRONMENT_OFFSET_PX = 90

function computeNetworkPositions(dataset: DomainDataset, size: Size): ReadonlyMap<GraphId, Point> {
  const polar = buildPolarPositions(dataset)
  const cx = size.width / 2
  const cy = size.height / 2
  const halfMin = Math.min(size.width, size.height) / 2
  const map = new Map<GraphId, Point>()
  for (const [id, p] of polar) {
    const r = p.radiusFrac * halfMin
    map.set(id, { x: cx + r * Math.cos(p.angleRad), y: cy + r * Math.sin(p.angleRad) })
  }

  for (const env of dataset.environmentNodes) {
    const regionPolar = polar.get(env.regionId)
    const regionPos = map.get(env.regionId)
    if (!regionPolar || !regionPos) continue
    const perpAngle = regionPolar.angleRad + Math.PI / 2
    map.set(env.id, {
      x: regionPos.x + ENVIRONMENT_OFFSET_PX * Math.cos(perpAngle),
      y: regionPos.y + ENVIRONMENT_OFFSET_PX * Math.sin(perpAngle),
    })
  }

  return map
}

export const networkLayout = withLayoutSafety(computeNetworkPositions, 'networkLayout')

/** Test-only: clears the polar-position cache so successive tests with different datasets don't see a stale tree. */
export function resetNetworkLayoutCache(): void {
  cachedVersion = null
  cachedPolar = null
}
