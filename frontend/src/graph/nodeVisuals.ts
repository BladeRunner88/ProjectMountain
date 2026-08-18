// 8.6: node fill colours and the badge rollup. Two things this block had
// to invent, disclosed:
//
//  1. A climber with a null status (41 of 50 — see 8.4's own report on why)
//     needs SOME fill; none of the four given readiness colours fit
//     "unknown," so it falls back to --text-tertiary, the same neutral
//     grey a leaf node uses — a deliberate "no data" read, not a fifth
//     status.
//  2. Root's "critical badge" and parent's "status badge" both require a
//     status to show at all, but only climbers carry one. Both badges are
//     therefore a ROLLUP: the single worst status among a node's own
//     descendant climbers, walked bottom-up once per render. Root's badge
//     is binary (a red dot, shown only when the rollup is exactly
//     REQUIRES_DESCENT — "critical," not merely "not READY"); parent's
//     badge shows the rollup's own colour at any of the four levels. A
//     node with no scored descendants at all shows no badge — most nodes,
//     given only 9 of 50 climbers are scored.

import {
  ACCENT_AMBER,
  ACCENT_AMBER_HEX,
  ACCENT_BLUE,
  ACCENT_BLUE_HEX,
  ACCENT_CYAN,
  ACCENT_CYAN_HEX,
  ACCENT_GREEN,
  ACCENT_GREEN_HEX,
  ACCENT_ORANGE,
  ACCENT_ORANGE_HEX,
  ACCENT_RED,
  ACCENT_RED_HEX,
  TEXT_TERTIARY,
  TEXT_TERTIARY_HEX,
} from './tokens'
import type { GraphNode, GraphNodeStatus } from './adapter'

export const READINESS_SEVERITY: Record<GraphNodeStatus, number> = {
  READY: 0,
  WATCH: 1,
  IMPAIRED: 2,
  REQUIRES_DESCENT: 3,
}

export const STATUS_COLOR: Record<GraphNodeStatus, string> = {
  READY: ACCENT_GREEN,
  WATCH: ACCENT_AMBER,
  IMPAIRED: ACCENT_ORANGE,
  REQUIRES_DESCENT: ACCENT_RED,
}

/** The neutral fill for a climber the backend hasn't scored — see this file's own header note. */
export const UNKNOWN_STATUS_FILL = TEXT_TERTIARY

export const ROOT_BASE_COLOR = ACCENT_BLUE
export const PARENT_COLOR = ACCENT_CYAN
export const LEAF_COLOR = TEXT_TERTIARY

/** A node's own solid fill (or, for root, the representative colour used at the gradient's centre and as an edge-gradient endpoint — the visible node itself is a radial gradient, built separately in GraphCanvas.tsx). */
export function baseColorFor(node: GraphNode): string {
  switch (node.tier) {
    case 'root':
      return ROOT_BASE_COLOR
    case 'parent':
      return PARENT_COLOR
    case 'child':
      return node.status ? STATUS_COLOR[node.status] : UNKNOWN_STATUS_FILL
    case 'leaf':
      return LEAF_COLOR
  }
}

/** Bottom-up: every climber with a real status contributes it to every one of its own ancestors (parentId chain), keeping only the MOST SEVERE per ancestor. Nodes with no scored descendant at all are simply absent from the returned map — "no badge," not "READY by default." */
export function computeStatusRollup(nodes: readonly GraphNode[]): Map<string, GraphNodeStatus> {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const rollup = new Map<string, GraphNodeStatus>()

  function bubbleUp(startParentId: string | null, status: GraphNodeStatus) {
    let currentId = startParentId
    while (currentId) {
      const existing = rollup.get(currentId)
      if (!existing || READINESS_SEVERITY[status] > READINESS_SEVERITY[existing]) {
        rollup.set(currentId, status)
      }
      currentId = byId.get(currentId)?.parentId ?? null
    }
  }

  for (const n of nodes) {
    if (n.tier === 'child' && n.status) bubbleUp(n.parentId, n.status)
  }

  return rollup
}

/** Root's own badge: binary, red, shown ONLY for the most severe rollup — "critical," not "anything but READY." */
export function isCritical(nodeId: string, rollup: ReadonlyMap<string, GraphNodeStatus>): boolean {
  return rollup.get(nodeId) === 'REQUIRES_DESCENT'
}

export function truncateLabel(label: string, maxChars = 20): string {
  return label.length > maxChars ? `${label.slice(0, maxChars - 1)}…` : label
}

/** 8.13-ui/8.13.2: the redesign spec's "organelle" dots — 2-3 small semi-transparent white dots inside a cell's membrane. Deliberately decorative texture, not a data encoding (disclosed): position is a deterministic hash of the cell's own id, stable across re-renders. Shared by GraphCanvas.tsx (Network's Parent Cells) and StrataCanvas.tsx (every Strata cell) — "cell anatomy is shared with Network... do not invent a third cell construction." */
export function organelleOffsets(cellId: string, radius: number): { x: number; y: number; r: number; opacity: number }[] {
  let h = 0
  for (let i = 0; i < cellId.length; i++) h = (h * 31 + cellId.charCodeAt(i)) >>> 0
  const angle = (offset: number) => (((h >>> offset) % 360) * Math.PI) / 180
  return [
    { x: Math.cos(angle(0)) * radius * 0.4, y: Math.sin(angle(0)) * radius * 0.4, r: radius * 0.13, opacity: 0.6 },
    { x: Math.cos(angle(8)) * radius * 0.32, y: Math.sin(angle(8)) * radius * 0.32, r: radius * 0.1, opacity: 0.5 },
    { x: Math.cos(angle(16)) * radius * 0.24, y: Math.sin(angle(16)) * radius * 0.24, r: radius * 0.08, opacity: 0.4 },
  ]
}

// -- 8.7: hex mirrors of the above, for SMIL colour interpolation only ----
// Same mapping as STATUS_COLOR/baseColorFor, resolved to a literal hex
// value instead of a var() reference — see tokens.ts's own comment on why.

export const STATUS_COLOR_HEX: Record<GraphNodeStatus, string> = {
  READY: ACCENT_GREEN_HEX,
  WATCH: ACCENT_AMBER_HEX,
  IMPAIRED: ACCENT_ORANGE_HEX,
  REQUIRES_DESCENT: ACCENT_RED_HEX,
}

export const UNKNOWN_STATUS_FILL_HEX = TEXT_TERTIARY_HEX
export const ROOT_BASE_COLOR_HEX = ACCENT_BLUE_HEX
export const PARENT_COLOR_HEX = ACCENT_CYAN_HEX
export const LEAF_COLOR_HEX = TEXT_TERTIARY_HEX

/** Same mapping as baseColorFor, resolved to a literal hex instead of a var() reference. A budding child's own PARENT calls this on itself to get "the colour I lend my bud while it's still my own tissue" (8.7 phase 2) — works for any host tier, not just root/parent, since a climber hosting a directly-attached source is exactly as valid a host as a route hosting an operator. */
export function resolvedHexColorFor(node: GraphNode): string {
  switch (node.tier) {
    case 'root':
      return ROOT_BASE_COLOR_HEX
    case 'parent':
      return PARENT_COLOR_HEX
    case 'child':
      return node.status ? STATUS_COLOR_HEX[node.status] : UNKNOWN_STATUS_FILL_HEX
    case 'leaf':
      return LEAF_COLOR_HEX
  }
}
