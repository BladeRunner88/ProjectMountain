// 8.10: pure graph-topology helpers for hover/select/multi-select — kept
// separate from GraphCanvas.tsx (already large) and framework-free so the
// underlying rules (who's an ancestor, who's connected, what order is
// "tier order") are unit-testable without mounting anything.

import type { GraphEdge, GraphNode, GraphNodeTier } from './adapter'

/** Bidirectional: every edge connects its source and target both ways — hover's "connected nodes glow" doesn't care about edge direction. */
export function buildAdjacency(edges: readonly GraphEdge[]): Map<string, Set<string>> {
  const adjacency = new Map<string, Set<string>>()
  function link(a: string, b: string) {
    if (!adjacency.has(a)) adjacency.set(a, new Set())
    adjacency.get(a)!.add(b)
  }
  for (const e of edges) {
    link(e.source, e.target)
    link(e.target, e.source)
  }
  return adjacency
}

export interface HighlightSet {
  nodeIds: ReadonlySet<string>
  edgeIds: ReadonlySet<string>
}

/** SELECT (single): root down to the selected node — the selection itself included. Parent-edge ids follow adapter.ts's own convention (`parent:${parentId}->${childId}`) so they match real rendered edges exactly. */
export function computeAncestorChain(nodeId: string, nodeById: ReadonlyMap<string, GraphNode>): HighlightSet {
  const nodeIds = new Set<string>()
  const edgeIds = new Set<string>()
  let current = nodeById.get(nodeId)
  while (current) {
    nodeIds.add(current.id)
    if (current.parentId) {
      edgeIds.add(`parent:${current.parentId}->${current.id}`)
      current = nodeById.get(current.parentId)
    } else {
      current = undefined
    }
  }
  return { nodeIds, edgeIds }
}

/** MULTI-SELECT: only the selected nodes themselves, plus edges connecting two selected nodes to each other — no ancestor trail, that's single-select's own rule. */
export function computeMutualConnections(selectedIds: ReadonlySet<string>, edges: readonly GraphEdge[]): HighlightSet {
  const edgeIds = new Set<string>()
  for (const e of edges) {
    if (selectedIds.has(e.source) && selectedIds.has(e.target)) edgeIds.add(e.id)
  }
  return { nodeIds: selectedIds, edgeIds }
}

const TIER_RANK: Record<GraphNodeTier, number> = { root: 0, parent: 1, child: 2, leaf: 3 }

/** KEYBOARD: Tab order is root, then parent, then child, then leaf — a stable sort (each tier keeps its own existing relative order) so it stays consistent with everything else already ordered by the adapter's own array order (fan angle, spawn stagger). */
export function computeTierOrder(nodes: readonly GraphNode[]): GraphNode[] {
  return [...nodes].sort((a, b) => TIER_RANK[a.tier] - TIER_RANK[b.tier])
}
