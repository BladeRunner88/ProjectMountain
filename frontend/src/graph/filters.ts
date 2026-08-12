// S8.8: FILTER CHIPS — All / Anomalies / Watch / By tier / By country.
// "Filtering changes what is drawn, never the dataset" — so this returns a
// visibility SET, not a filtered copy of the dataset; every view still owns
// the full `DomainDataset` and just skips drawing whatever isn't in the set.
// `null` means "no filter active", the common case, so callers don't pay
// for a Set membership check when nothing is filtered.

import { computeWatchIds } from './watchStatus'
import type { DomainDataset, EntityTier } from './domain'
import type { GraphId } from './types'

export type FilterKind = 'all' | 'anomalies' | 'watch' | 'tier' | 'country'

export interface GraphFilter {
  kind: FilterKind
  tier: EntityTier | null
  countryId: GraphId | null
}

export const DEFAULT_FILTER: GraphFilter = { kind: 'all', tier: null, countryId: null }

export function computeFilterVisible(dataset: DomainDataset, filter: GraphFilter): ReadonlySet<GraphId> | null {
  if (filter.kind === 'all') return null

  const visible = new Set<GraphId>()
  if (filter.kind === 'anomalies') {
    for (const e of dataset.domainEntities) if (e.status === 'anomaly') visible.add(e.id)
  } else if (filter.kind === 'watch') {
    for (const id of computeWatchIds(dataset)) visible.add(id)
  } else if (filter.kind === 'tier') {
    for (const e of dataset.domainEntities) if (e.tier === filter.tier) visible.add(e.id)
  } else if (filter.kind === 'country') {
    for (const e of dataset.domainEntities) if (e.countryId === filter.countryId) visible.add(e.id)
  }
  return visible
}
