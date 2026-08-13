// S8.8: the hover tooltip's own data — "name, serial and status" for an
// entity, "kind, timestamp and one-line summary" for a sub-node. Same
// "precompute once per dataset into a Map" discipline as hoverChain.ts and
// search.ts, so a mouse sweeping across thousands of sub-nodes never does
// more than an O(1) lookup per hover change.

import { serialFor } from './serial'
import type { DomainDataset, EntityStatus, EntityTier, SubNodeKind } from '../types/domain'
import type { GraphId } from '../types/graph'

export type TooltipInfo =
  | { kind: 'entity'; label: string; tier: EntityTier; status: EntityStatus; serial: string }
  | { kind: 'subnode'; subKind: SubNodeKind; ts: number; summary: string }

export function buildTooltipIndex(dataset: DomainDataset): ReadonlyMap<GraphId, TooltipInfo> {
  const index = new Map<GraphId, TooltipInfo>()
  for (const e of dataset.domainEntities) {
    index.set(e.id, { kind: 'entity', label: e.label, tier: e.tier, status: e.status, serial: serialFor(e.id) })
  }
  for (const s of dataset.subNodes) {
    index.set(s.id, { kind: 'subnode', subKind: s.kind, ts: s.ts, summary: s.summary })
  }
  return index
}
