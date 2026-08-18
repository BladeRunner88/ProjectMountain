// 8.8: LIVE DATA — the graph must react to the dataset changing after
// initial load (ase/store.tsx's real 5s live tick: tickOnce() supersedes
// one source's TracedValue, bumping `tick`) WITHOUT re-running the force
// simulation. `dataset`'s own object reference never changes (store.tsx's
// own comment: a ref, never reassigned) — only `tick` does — so
// buildGraphView(dataset) must be recomputed on every tick to pick up the
// supersede, which means `nodes`/`edges` get fresh array references every
// 5 seconds even though (almost always) only ONE node's properties
// actually moved. Feeding fresh arrays straight into runSimulation would
// reflow the ENTIRE layout every 5 seconds — a subtler way for "the graph
// is still there every time" to be false even though nothing visibly
// vanishes. This hook is the fix: positions are seeded ONCE (the first
// real force-simulation), then updated PURELY INCREMENTALLY — an added
// node gets a seeded position next to its parent (graph/layout.ts's own
// seedIncrementalPosition), a removed node keeps its last known position
// long enough to animate away, and everything else's position is never
// touched again for the rest of the session.

import { useEffect, useMemo, useReducer, useRef } from 'react'
import type { GraphEdge, GraphNode, GraphNodeStatus } from './adapter'
import { runSimulation, seedIncrementalPosition, type Point } from './layout'

export const REMOVAL_DURATION_MS = 500

export type LiveGraphEventKind = 'added' | 'touched' | 'statusChanged' | 'removed'

export interface LiveGraphEvent {
  kind: LiveGraphEventKind
  nodeId: string
  fromStatus?: GraphNodeStatus | null
  toStatus?: GraphNodeStatus | null
  /** 8.13-ui: wall-clock time the event was detected (Date.now(), not performance.now() — this feeds a real "Nm ago" activity readout, not an animation timer). */
  at: number
}

export interface LiveGraphState {
  /** current nodes plus any still mid-removal-animation (kept alive just long enough to shrink and fade). */
  renderNodes: GraphNode[]
  renderEdges: GraphEdge[]
  positions: ReadonlyMap<string, Point>
  /** Events newly detected THIS render only — consume-once, not a running log. */
  events: LiveGraphEvent[]
  removingIds: ReadonlySet<string>
}

/** Two TracedValue-bearing nodes differ if any property's recordedAt moved — supersede() always produces a new TracedValue with a fresh recordedAt, so comparing that (not the resolved value itself) is a cheap, reliable "did this node's underlying data change" signal without needing to know each property's own equality semantics. */
export function propertiesChanged(a: GraphNode, b: GraphNode): boolean {
  const keys = new Set([...Object.keys(a.properties), ...Object.keys(b.properties)])
  for (const k of keys) {
    if (a.properties[k]?.recordedAt !== b.properties[k]?.recordedAt) return true
  }
  return false
}

export function useLiveGraphState(nodes: readonly GraphNode[], edges: readonly GraphEdge[]): LiveGraphState {
  const prevNodesRef = useRef<Map<string, GraphNode> | null>(null)
  const positionsRef = useRef<Map<string, Point>>(new Map())
  const removingRef = useRef<Map<string, { node: GraphNode; edge: GraphEdge | null; removedAt: number }>>(new Map())
  const [, bump] = useReducer((x: number) => x + 1, 0)

  // Cleans up nodes whose removal animation has finished — runs after every
  // render (cheap: the map is empty outside a live removal), never touches
  // positions for anything still alive.
  useEffect(() => {
    if (removingRef.current.size === 0) return
    const timers: number[] = []
    for (const [id, entry] of removingRef.current) {
      const elapsed = performance.now() - entry.removedAt
      const remaining = Math.max(0, REMOVAL_DURATION_MS - elapsed)
      timers.push(
        window.setTimeout(() => {
          removingRef.current.delete(id)
          positionsRef.current.delete(id)
          bump()
        }, remaining),
      )
    }
    return () => timers.forEach((t) => clearTimeout(t))
  })

  return useMemo(() => {
    const nextById = new Map(nodes.map((n) => [n.id, n]))
    const events: LiveGraphEvent[] = []

    if (prevNodesRef.current === null) {
      // First build this session: the one and only full force-simulation.
      const result = runSimulation(nodes, edges)
      positionsRef.current = new Map(result.positions)
      prevNodesRef.current = nextById
      return { renderNodes: [...nodes], renderEdges: [...edges], positions: positionsRef.current, events, removingIds: new Set() }
    }

    const prev = prevNodesRef.current

    for (const [id, p] of prev) {
      if (nextById.has(id) || removingRef.current.has(id)) continue
      const oldEdge = edgesTo(id, prev, edges) // best-effort: find its parent edge from whatever we can still see
      removingRef.current.set(id, { node: p, edge: oldEdge, removedAt: performance.now() })
      events.push({ kind: 'removed', nodeId: id, at: Date.now() })
    }

    for (const n of nodes) {
      const p = prev.get(n.id)
      if (!p) {
        events.push({ kind: 'added', nodeId: n.id, at: Date.now() })
        if (!positionsRef.current.has(n.id) && n.parentId) {
          const parentPos = positionsRef.current.get(n.parentId)
          const parentNode = nextById.get(n.parentId)
          if (parentPos && parentNode) {
            const grandparentPos = parentNode.parentId ? positionsRef.current.get(parentNode.parentId) : undefined
            positionsRef.current.set(n.id, seedIncrementalPosition(n, parentPos, grandparentPos))
          }
        }
        continue
      }
      if (p.status !== n.status) events.push({ kind: 'statusChanged', nodeId: n.id, fromStatus: p.status, toStatus: n.status, at: Date.now() })
      else if (propertiesChanged(p, n)) events.push({ kind: 'touched', nodeId: n.id, at: Date.now() })
    }

    prevNodesRef.current = nextById

    const removingEntries = [...removingRef.current.values()]
    const renderNodes = [...nodes, ...removingEntries.map((e) => e.node)]
    const retractingEdges = removingEntries.map((e) => e.edge).filter((e): e is GraphEdge => e !== null)
    const renderEdges = [...edges, ...retractingEdges]
    const removingIds = new Set(removingRef.current.keys())

    return { renderNodes, renderEdges, positions: positionsRef.current, events, removingIds }
  }, [nodes, edges])
}

export function edgesTo(nodeId: string, prevNodes: Map<string, GraphNode>, currentEdges: readonly GraphEdge[]): GraphEdge | null {
  const node = prevNodes.get(nodeId)
  if (!node?.parentId) return null
  // The real parent-edge object is gone from `currentEdges` along with the
  // node — synthesize it from the departing node's own last-known parentId,
  // matching adapter.ts's own id convention exactly so it's indistinguishable
  // from a real one for rendering purposes.
  const existing = currentEdges.find((e) => e.kind === 'parent' && e.target === nodeId)
  if (existing) return existing
  return { id: `parent:${node.parentId}->${node.id}`, source: node.parentId, target: node.id, kind: 'parent', label: null }
}
