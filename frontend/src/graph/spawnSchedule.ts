// 8.7: THE SPAWN SCHEDULE — pure, deterministic per-node timing for the
// "cell division" spawn animation. Walks the same parent->children
// structure layout.ts's own seeding already walks, in the SAME array
// order, so a child's bud angle always matches its own final fan
// position — the bud has to appear where the node is actually going to
// settle, not somewhere arbitrary.
//
// Roots and the 8 parentless provenance sources (adapter.ts's own
// disclosed gap — no single parent in the country->route->operator->
// climber chain) have nothing to divide FROM, so they render immediately,
// unanimated — the anchors a viewer arrives to.
//
// Everything else divides off its own parent: a node's children begin
// budding only once THAT node has finished ITS OWN split and taken on its
// own settled colour (local +1000ms, the moment phase 4 begins — see the
// PHASE_* constants below), one sibling every 300ms, never together. This
// recursive "wait for your own split, then stagger your children" rule is
// what produces the depth-first cascade the spec asks for: a branch
// shoots to full depth as fast as the 1000ms-per-generation floor allows,
// independently of how long a SIBLING branch's own subtree takes, since
// each subtree's timing only depends on its own ancestor chain.

import type { GraphNode } from './adapter'

export const PHASE_PULSE_END_MS = 200
export const PHASE_BUD_END_MS = 600
export const PHASE_SPLIT_END_MS = 1000
export const PHASE_SETTLE_END_MS = 1500

/** A node's children can't start budding until it has finished its own split and wears its own colour — that's local +1000ms, i.e. PHASE_SPLIT_END_MS. */
export const CHILDREN_TRIGGER_OFFSET_MS = PHASE_SPLIT_END_MS

export const SIBLING_STAGGER_MS = 300

export interface SpawnTiming {
  /** ms from the graph's own mount at which this node's 4-phase spawn begins. Meaningless (0) when animated is false. */
  startMs: number
  /** false for roots and parentless nodes — already there, never divides into existence. */
  animated: boolean
}

export function computeSpawnSchedule(nodes: readonly GraphNode[]): ReadonlyMap<string, SpawnTiming> {
  const schedule = new Map<string, SpawnTiming>()
  const childrenOf = new Map<string, GraphNode[]>()
  for (const n of nodes) {
    if (!n.parentId) continue
    const list = childrenOf.get(n.parentId) ?? []
    list.push(n)
    childrenOf.set(n.parentId, list)
  }

  function assignChildren(parentId: string, parentStartMs: number, parentAnimated: boolean) {
    const children = childrenOf.get(parentId) ?? []
    const offset = parentAnimated ? CHILDREN_TRIGGER_OFFSET_MS : 0
    children.forEach((child, idx) => {
      const startMs = parentStartMs + offset + idx * SIBLING_STAGGER_MS
      schedule.set(child.id, { startMs, animated: true })
      assignChildren(child.id, startMs, true)
    })
  }

  for (const n of nodes) {
    if (n.tier === 'root' || n.parentId === null) schedule.set(n.id, { startMs: 0, animated: false })
  }
  for (const n of nodes) {
    if (n.tier === 'root') assignChildren(n.id, 0, false)
  }

  return schedule
}
