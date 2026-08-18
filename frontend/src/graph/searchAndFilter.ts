// 8.12: pure logic behind the top bar's SEARCH and FILTERS controls — kept
// out of GraphCanvas.tsx so "who matches" is unit-testable without a DOM.
//
// "Filters and search compose": By-tier/by-country don't have their own
// selector UI (the pills are plain single-value toggles), so their
// reference point is resolved from whatever's already active elsewhere —
// the single selected node, else the first search match, else nothing (in
// which case the pill is a structural no-op, same as "All").

import type { GraphEdge, GraphNode, GraphNodeTier } from './adapter'
import { computeTierOrder } from './interactionState'
import { nearestAncestorOfType } from './panelFields'
import type { FilterKind } from './types'
import type { Point } from './layout'

// -- SEARCH -------------------------------------------------------------

function resolvedString(tv: GraphNode['properties'][string] | undefined): string | null {
  if (!tv) return null
  return typeof tv.value === 'string' ? tv.value : null
}

/** name, serial, operator, route, origin (nearest country ancestor) — exactly the fields the search placeholder promises. */
export function matchesSearch(node: GraphNode, query: string, nodeById: ReadonlyMap<string, GraphNode>): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return false
  const origin = node.type === 'country' ? node.label : (nearestAncestorOfType(node, 'country', nodeById)?.label ?? null)
  const candidates: (string | null)[] = [
    node.label,
    node.serial,
    resolvedString(node.properties.operatorName),
    resolvedString(node.properties.routeName),
    origin,
  ]
  return candidates.some((c) => c !== null && c.toLowerCase().includes(q))
}

export function computeSearchMatchIds(nodes: readonly GraphNode[], query: string): Set<string> {
  if (!query.trim()) return new Set()
  const nodeById = new Map(nodes.map((n) => [n.id, n]))
  const ids = new Set<string>()
  for (const n of nodes) {
    if (matchesSearch(n, query, nodeById)) ids.add(n.id)
  }
  return ids
}

/** Deterministic "first match" for camera-pan/pulse/by-tier-or-country-reference purposes — root-before-parent-before-child-before-leaf, ties broken by input order (computeTierOrder's own stability guarantee). */
export function firstSearchMatch(nodes: readonly GraphNode[], query: string): GraphNode | null {
  const ids = computeSearchMatchIds(nodes, query)
  if (ids.size === 0) return null
  const ordered = computeTierOrder(nodes)
  return ordered.find((n) => ids.has(n.id)) ?? null
}

// -- FILTERS -------------------------------------------------------------

/** Every node that itself matches `directPredicate`, plus every one of its ancestors — so a filter never leaves a matching node's own parent chain looking orphaned/dimmed. */
function subtreeMatchIds(nodes: readonly GraphNode[], directPredicate: (n: GraphNode) => boolean): Set<string> {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const ids = new Set<string>()
  for (const n of nodes) {
    if (!directPredicate(n)) continue
    let cur: GraphNode | undefined = n
    while (cur) {
      ids.add(cur.id)
      cur = cur.parentId ? byId.get(cur.parentId) : undefined
    }
  }
  return ids
}

export function computeTierFilterMatchIds(nodes: readonly GraphNode[], referenceTier: GraphNodeTier): Set<string> {
  return new Set(nodes.filter((n) => n.tier === referenceTier).map((n) => n.id))
}

/** The reference country node itself, plus every real descendant of it (walked via each node's own parentId chain — not a fabricated grouping). */
export function computeCountryFilterMatchIds(nodes: readonly GraphNode[], referenceCountryId: string): Set<string> {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const ids = new Set<string>([referenceCountryId])
  for (const n of nodes) {
    let cur: GraphNode | undefined = n
    while (cur) {
      if (cur.id === referenceCountryId) {
        ids.add(n.id)
        break
      }
      cur = cur.parentId ? byId.get(cur.parentId) : undefined
    }
  }
  return ids
}

/** Selection wins over search (a deliberate click beats an incidental first-match); with neither, by-tier/by-country have nothing to anchor to and are a no-op. */
export function resolveFilterReferenceId(filterKind: FilterKind, selectedNodeIds: ReadonlySet<string>, nodes: readonly GraphNode[], searchQuery: string): string | null {
  if (filterKind !== 'by-tier' && filterKind !== 'by-country') return null
  if (selectedNodeIds.size === 1) {
    const [id] = selectedNodeIds
    return id
  }
  return firstSearchMatch(nodes, searchQuery)?.id ?? null
}

/** null means "everyone matches" (All, or a by-tier/by-country pill with no resolved reference) — the caller's own no-dim default, not a special case here. */
export function computeFilterMatchIds(filterKind: FilterKind, nodes: readonly GraphNode[], referenceId: string | null): Set<string> | null {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  switch (filterKind) {
    case 'all':
      return null
    case 'anomalies':
      return subtreeMatchIds(nodes, (n) => n.status === 'IMPAIRED' || n.status === 'REQUIRES_DESCENT')
    case 'watch':
      return subtreeMatchIds(nodes, (n) => n.status === 'WATCH')
    case 'by-tier': {
      if (!referenceId) return null
      const ref = byId.get(referenceId)
      return ref ? computeTierFilterMatchIds(nodes, ref.tier) : null
    }
    case 'by-country': {
      if (!referenceId) return null
      const ref = byId.get(referenceId)
      if (!ref) return null
      const countryId = ref.type === 'country' ? ref.id : (nearestAncestorOfType(ref, 'country', byId)?.id ?? null)
      return countryId ? computeCountryFilterMatchIds(nodes, countryId) : null
    }
  }
}

/** An edge is part of the highlighted subgraph only when BOTH endpoints are — the same "no ambiguous half-lit edge" rule 8.10's own ancestor-chain/mutual-connection highlighting already follows. */
export function edgeMatchesFilter(edge: GraphEdge, matchIds: ReadonlySet<string> | null): boolean {
  if (matchIds === null) return true
  return matchIds.has(edge.source) && matchIds.has(edge.target)
}

// -- by-country layout rebalance ------------------------------------------

/** "the matching subtree stays full size, the rest is pushed toward the edges" — a non-matching node's position is pushed further from the graph's own centre along the SAME direction it already sits in, `factor` > 1. A matching node (or when `active` is false) keeps its real, unmodified position — nothing here invents a new layout, it only displaces existing positions relative to the true centre. */
export function pushedPosition(pos: Point, center: Point, factor: number): Point {
  return { x: center.x + (pos.x - center.x) * factor, y: center.y + (pos.y - center.y) * factor }
}

// -- 8.13-ui: selected-node children push -----------------------------------

/** "Selected: children push outward 10px along the spindle axis" — moves `pos` a fixed distance further from `originPos` along the direction already between them (the real parent-child line), not a new direction. Falls back to the unmoved position if the two points coincide (distance 0 has no defined direction). */
export function pushedAlongAxis(pos: Point, originPos: Point, distancePx: number): Point {
  const dx = pos.x - originPos.x
  const dy = pos.y - originPos.y
  const dist = Math.sqrt(dx * dx + dy * dy)
  if (dist === 0) return pos
  return { x: pos.x + (dx / dist) * distancePx, y: pos.y + (dy / dist) * distancePx }
}
