// S8.6: THE LEVEL GRAPH. Same data as NETWORK, read as hierarchy instead of
// connection — six fixed horizontal bands (country..sensor), each entity
// positioned horizontally by its PARENT's x, so a subtree stays vertically
// aligned and the whole thing reads as a family tree. This is the standard
// "tidy tree" / dendrogram technique: every leaf gets a sequential x slot in
// a stable traversal order, and every non-leaf's x is the average of its
// children's — computed bottom-up, once per dataset version.
//
// Sub-nodes are never part of this layout at all (S8.6: "3,000 points in a
// 60px band is noise") — only the 127 domain entities.

import type { DomainDataset, DomainEntity, EntityTier } from '../types/domain'
import type { GraphId, Point } from '../types/graph'

export const BAND_HEIGHT = 60
export const BAND_ORDER: EntityTier[] = ['country', 'region', 'route', 'operator', 'climber', 'sensor']
export const BAND_LABEL: Record<EntityTier, string> = {
  country: 'COUNTRIES',
  region: 'REGIONS',
  route: 'ROUTES',
  operator: 'OPERATORS',
  climber: 'CLIMBERS',
  sensor: 'SENSORS',
}

// "country" -> "countries" isn't a naive +s — the count line ("30 operators
// · 3 in anomaly") needs a real plural, not BAND_LABEL's fixed all-caps form.
const TIER_PLURAL: Record<EntityTier, string> = { country: 'countries', region: 'regions', route: 'routes', operator: 'operators', climber: 'climbers', sensor: 'sensors' }
const TIER_SINGULAR: Record<EntityTier, string> = { country: 'country', region: 'region', route: 'route', operator: 'operator', climber: 'climber', sensor: 'sensor' }
export function pluralizeTier(tier: EntityTier, count: number): string {
  return count === 1 ? TIER_SINGULAR[tier] : TIER_PLURAL[tier]
}
export const BAND_INDEX: Record<EntityTier, number> = { country: 0, region: 1, route: 2, operator: 3, climber: 4, sensor: 5 }
export const STRATA_TOTAL_HEIGHT = BAND_ORDER.length * BAND_HEIGHT

const SIZE_BASE_PX = 3
const SIZE_PER_CHILD_PX = 1.1
const SIZE_MAX_PX = 11

export interface StrataLayout {
  positions: ReadonlyMap<GraphId, Point>
  /** direct domain-entity child count — what drives node size ("an operator with 4 climbers is larger than one with 1"). */
  childCount: ReadonlyMap<GraphId, number>
  radius: ReadonlyMap<GraphId, number>
}

let cachedVersion: number | null = null
let cachedWidth: number | null = null
let cachedResult: StrataLayout | null = null

export function computeStrataLayout(dataset: DomainDataset, width: number): StrataLayout {
  if (cachedVersion === dataset.version && cachedWidth === width && cachedResult) return cachedResult

  const childrenOf = new Map<GraphId, DomainEntity[]>()
  for (const e of dataset.domainEntities) {
    if (e.parentId === null) continue
    const list = childrenOf.get(e.parentId)
    if (list) list.push(e)
    else childrenOf.set(e.parentId, [e])
  }

  const leafSlot = new Map<GraphId, number>()
  const xSlot = new Map<GraphId, number>()
  let nextLeaf = 0

  function assign(entity: DomainEntity): number {
    const children = childrenOf.get(entity.id)
    if (!children || children.length === 0) {
      const slot = nextLeaf++
      leafSlot.set(entity.id, slot)
      xSlot.set(entity.id, slot)
      return slot
    }
    const childSlots = children.map(assign)
    const mean = childSlots.reduce((a, b) => a + b, 0) / childSlots.length
    xSlot.set(entity.id, mean)
    return mean
  }

  const countries = dataset.domainEntities.filter((e) => e.tier === 'country')
  for (const c of countries) assign(c)
  const totalLeaves = Math.max(1, nextLeaf)

  const positions = new Map<GraphId, Point>()
  const childCount = new Map<GraphId, number>()
  for (const e of dataset.domainEntities) {
    const slot = xSlot.get(e.id) ?? 0
    const x = ((slot + 0.5) / totalLeaves) * width
    const y = BAND_INDEX[e.tier] * BAND_HEIGHT + BAND_HEIGHT / 2
    positions.set(e.id, { x, y })
    childCount.set(e.id, (childrenOf.get(e.id) ?? []).length)
  }

  const radius = new Map<GraphId, number>()
  for (const [id, count] of childCount) {
    radius.set(id, Math.min(SIZE_MAX_PX, SIZE_BASE_PX + count * SIZE_PER_CHILD_PX))
  }

  const result: StrataLayout = { positions, childCount, radius }
  cachedVersion = dataset.version
  cachedWidth = width
  cachedResult = result
  return result
}

export function resetStrataLayoutCache(): void {
  cachedVersion = null
  cachedWidth = null
  cachedResult = null
}

export interface BandStats {
  tier: EntityTier
  total: number
  anomalyCount: number
}

export function computeBandStats(dataset: DomainDataset): BandStats[] {
  return BAND_ORDER.map((tier) => {
    const entities = dataset.domainEntities.filter((e) => e.tier === tier)
    return { tier, total: entities.length, anomalyCount: entities.filter((e) => e.status === 'anomaly').length }
  })
}

/** A per-band histogram of how entities cluster horizontally — `bins` buckets across the band's width, each a 0..1 density relative to the band's busiest bucket. */
export function computeDensityStrip(dataset: DomainDataset, layout: StrataLayout, tier: EntityTier, width: number, bins = 40): number[] {
  const counts: number[] = new Array(bins).fill(0)
  const entities = dataset.domainEntities.filter((e) => e.tier === tier)
  for (const e of entities) {
    const p = layout.positions.get(e.id)
    if (!p) continue
    const bin = Math.min(bins - 1, Math.max(0, Math.floor((p.x / width) * bins)))
    counts[bin]++
  }
  const max = Math.max(1, ...counts)
  return counts.map((c) => c / max)
}
