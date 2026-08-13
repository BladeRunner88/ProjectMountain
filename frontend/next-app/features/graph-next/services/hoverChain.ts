// S8.6/S8.8: the ancestor-chain-to-country a hovered (or selected) node
// lights up — one implementation, shared by NETWORK, STRATA and TERRAIN so
// "what's in the chain" can never drift between views (S8.6). S8.8 adds the
// requirement this file was always heading toward: precompute every
// entity's own chain ONCE per dataset into a Map, so a mouse move is an O(1)
// lookup, never a tree walk. Sub-nodes never get their own walk at all —
// they just borrow their parent's already-computed chain and add
// themselves to it.

import type { DomainDataset, DomainEntity } from '../types/domain'
import type { GraphId } from '../types/graph'

export interface HoverChain {
  nodeIds: ReadonlySet<GraphId>
  edgeKeys: ReadonlySet<string>
}

export function buildHoverChainIndex(dataset: DomainDataset): ReadonlyMap<GraphId, HoverChain> {
  const byId = new Map<GraphId, DomainEntity>(dataset.domainEntities.map((e) => [e.id, e]))

  const chainByEntity = new Map<GraphId, HoverChain>()
  for (const entity of dataset.domainEntities) {
    const nodeIds = new Set<GraphId>([entity.id])
    const edgeKeys = new Set<string>()
    let current: DomainEntity | undefined = entity
    while (current && current.parentId !== null) {
      edgeKeys.add(`${current.parentId}->${current.id}`)
      nodeIds.add(current.parentId)
      current = byId.get(current.parentId)
    }
    chainByEntity.set(entity.id, { nodeIds, edgeKeys })
  }

  const index = new Map<GraphId, HoverChain>(chainByEntity)
  for (const sub of dataset.subNodes) {
    const parentChain = chainByEntity.get(sub.parentId)
    if (!parentChain) continue
    index.set(sub.id, { nodeIds: new Set([sub.id, ...parentChain.nodeIds]), edgeKeys: parentChain.edgeKeys })
  }
  return index
}
