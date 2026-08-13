// S8.8: ONE opacity policy, shared by NETWORK, STRATA and (where it applies)
// TERRAIN — the same discipline S8.6 established for the hover chain
// (exactly one `computeHoverChain`) extended to cover every dimming source
// this block adds: dbl-click focus mode, search, and hover/hoveredTier
// (S8.6's originals). A view calls `resolveOpacity` per node and
// `resolveEdgeOpacity` per edge; which source is "in control" is decided
// here, once, not re-decided per view.
//
// Filter visibility is deliberately NOT part of this priority chain — S8.8
// is explicit that filtering "changes what is drawn, never the dataset",
// i.e. a filtered-out node isn't dimmed, it's absent. Callers check
// `isFilterVisible` first and skip the node/edge entirely; only nodes that
// pass the filter ever reach `resolveOpacity`.

import type { HoverChain } from './hoverChain'
import type { EntityTier } from '../types/domain'
import type { GraphId } from '../types/graph'

export const DIMMED_OPACITY = 0.08

export interface EmphasisContext {
  hoverChain: HoverChain | null
  hoveredTier: EntityTier | null
  focusChain: HoverChain | null
  searchMatches: ReadonlySet<GraphId> | null
}

export function isFilterVisible(id: GraphId, filterVisible: ReadonlySet<GraphId> | null): boolean {
  return !filterVisible || filterVisible.has(id)
}

export function resolveOpacity(id: GraphId, tier: EntityTier, ctx: EmphasisContext): number {
  if (ctx.focusChain) return ctx.focusChain.nodeIds.has(id) ? 1 : DIMMED_OPACITY
  if (ctx.searchMatches) return ctx.searchMatches.has(id) ? 1 : DIMMED_OPACITY
  if (ctx.hoverChain) return ctx.hoverChain.nodeIds.has(id) ? 1 : DIMMED_OPACITY
  if (ctx.hoveredTier) return tier === ctx.hoveredTier ? 1 : DIMMED_OPACITY
  return 1
}

export function resolveEdgeOpacity(edgeKey: string, targetId: GraphId, targetTier: EntityTier, ctx: EmphasisContext): number {
  if (ctx.focusChain) return ctx.focusChain.edgeKeys.has(edgeKey) ? 1 : DIMMED_OPACITY
  if (ctx.searchMatches) return ctx.searchMatches.has(targetId) ? 1 : DIMMED_OPACITY
  if (ctx.hoverChain) return ctx.hoverChain.edgeKeys.has(edgeKey) ? 1 : DIMMED_OPACITY
  if (ctx.hoveredTier) return targetTier === ctx.hoveredTier ? 1 : DIMMED_OPACITY
  return 1
}

/**
 * Sub-nodes have no tier of their own and are never the subject of
 * hoveredTier dimming — but a sub-node's OWN opacity should follow its
 * parent entity: hovering/selecting that entity (or any ancestor of it)
 * keeps the entity's attached records lit alongside it, not faded out as
 * "everything else". `hoverChain`/`focusChain` already carry the sub-node's
 * own id too when IT is the thing directly hovered (hoverChain.ts's index
 * covers sub-nodes), so checking both ids covers "this sub-node is hovered"
 * and "this sub-node's owner is somewhere in the lit chain".
 */
export function resolveSubNodeOpacity(subNodeId: GraphId, parentId: GraphId, ctx: EmphasisContext): number {
  if (ctx.focusChain) return ctx.focusChain.nodeIds.has(subNodeId) || ctx.focusChain.nodeIds.has(parentId) ? 1 : DIMMED_OPACITY
  if (ctx.searchMatches) return ctx.searchMatches.has(subNodeId) || ctx.searchMatches.has(parentId) ? 1 : DIMMED_OPACITY
  if (ctx.hoverChain) return ctx.hoverChain.nodeIds.has(subNodeId) || ctx.hoverChain.nodeIds.has(parentId) ? 1 : DIMMED_OPACITY
  return 1
}
