// S8.8: "watch" generalised beyond TERRAIN's own climbers (S8.7) — any
// entity, any tier, still nominal but carrying at least one of its own
// alert-flagged sub-node records. One shared derivation so the WATCH filter
// chip (NETWORK/STRATA) and TERRAIN's amber climber markers can never
// disagree about which ids qualify.

import type { DomainDataset } from '../types/domain'
import type { GraphId } from '../types/graph'

export function computeWatchIds(dataset: DomainDataset): ReadonlySet<GraphId> {
  const hasAlertSubNode = new Set<GraphId>()
  for (const s of dataset.subNodes) {
    if (s.status === 'alert') hasAlertSubNode.add(s.parentId)
  }
  const watch = new Set<GraphId>()
  for (const e of dataset.domainEntities) {
    if (e.status === 'nominal' && hasAlertSubNode.has(e.id)) watch.add(e.id)
  }
  return watch
}
