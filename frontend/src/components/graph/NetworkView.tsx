// 8.6: wires the real backend dataset (via useDataset(), never
// buildDataset() directly — 8.4's own rule) through the adapter (8.4) and
// the layout engine (8.5) into GraphCanvas (8.6).
//
// 8.8: `dataset`'s own object reference never changes for the life of the
// session (ase/store.tsx's own comment: a ref, never reassigned) — only
// `tick` does, bumped every 5s by the REAL live-tick (tickOnce() supersedes
// one source's TracedValue). That means buildGraphView(dataset) must be
// recomputed on every tick to actually pick up the change — so `nodes`
// depends on `tick` too now, unlike 8.6/8.7 where dataset identity alone
// was the (in hindsight, incomplete) dependency. graph/liveGraphState.ts's
// useLiveGraphState is what keeps that from reflowing the whole layout
// every 5 seconds: it runs the one real force-simulation exactly once and
// only ever incrementally patches positions after that.
//
// DEV-ONLY STRESS HOOK: `?stressTest=<n>` swaps in stressFixture.ts's
// synthetic 500+-node graph instead of the real (121-node) dataset — the
// only way to actually verify "60fps pan"/"no label collision" at that
// scale live in a browser, since the real backend has no data anywhere
// near it (8.4's own counts). Gated behind import.meta.env.DEV, so it
// cannot exist in a production build; never mixed into the real
// rendering path otherwise.

import { forwardRef, useEffect, useMemo } from 'react'
import { useDataset } from '../../ase/store'
import type { GraphEdge, GraphNode } from '../../graph/adapter'
import { buildGraphView } from '../../graph/adapter'
import { useLiveGraphState, type LiveGraphEvent } from '../../graph/liveGraphState'
import { buildStressFixture } from '../../graph/stressFixture'
import type { FilterKind } from '../../graph/types'
import { GraphCanvas, type GraphCanvasHandle } from './GraphCanvas'

function stressTestNodeCount(): number | null {
  if (!import.meta.env.DEV) return null
  if (typeof window === 'undefined') return null
  const raw = new URLSearchParams(window.location.search).get('stressTest')
  if (!raw) return null
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : null
}

export interface NetworkViewProps {
  onViewChanged?: (isDefault: boolean) => void
  onSelectionChanged?: (selectedNodes: GraphNode[]) => void
  /** 8.11: the FULL node/edge set (not the live-render subset GraphCanvas gets) — the detail panel needs the whole graph to resolve a selection's parent/route/rope-partner/contributing-sources, and must stay in sync with whichever set (real dataset or the dev-only stress fixture) is actually driving the canvas right now. */
  onGraphDataChanged?: (nodes: GraphNode[], edges: GraphEdge[]) => void
  /** 8.12: the top bar's own search/filter state, passed straight through to GraphCanvas — NetworkView itself has no opinion on either. */
  searchQuery: string
  activeFilter: FilterKind
  /** 8.13-ui: real touched/statusChanged/removed/added events, fired whenever `useLiveGraphState` detects any — feeds the left panel's real RECENT ACTIVITY list. `live.events` is consume-once per its own doc comment, so this fires every time it's non-empty, never a running log itself. */
  onLiveEventsChanged?: (events: readonly LiveGraphEvent[]) => void
}

export const NetworkView = forwardRef<GraphCanvasHandle, NetworkViewProps>(function NetworkView(
  { onViewChanged, onSelectionChanged, onGraphDataChanged, searchQuery, activeFilter, onLiveEventsChanged },
  ref,
) {
  const { dataset, tick } = useDataset()
  const stressCount = stressTestNodeCount()

  // `tick` is intentionally a dependency without being read in the body —
  // it's the live-tick invalidation signal (see this file's own header
  // comment): dataset's object reference never changes, so without `tick`
  // here this memo would never recompute and a live update would never be
  // picked up at all.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const { nodes, edges } = useMemo(() => (stressCount ? buildStressFixture(stressCount) : buildGraphView(dataset)), [dataset, tick, stressCount])
  const live = useLiveGraphState(nodes, edges)

  useEffect(() => {
    onGraphDataChanged?.(nodes, edges)
    // onGraphDataChanged deliberately excluded — an inline parent callback's
    // identity changing every render must not re-trigger this, only a real
    // nodes/edges recompute should (same reasoning as the `tick` memo above).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges])

  useEffect(() => {
    if (live.events.length > 0) onLiveEventsChanged?.(live.events)
    // onLiveEventsChanged deliberately excluded, same reasoning as onGraphDataChanged above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live.events])

  return (
    <GraphCanvas
      ref={ref}
      nodes={live.renderNodes}
      edges={live.renderEdges}
      positions={live.positions}
      liveEvents={live.events}
      removingIds={live.removingIds}
      onViewChanged={onViewChanged}
      onSelectionChanged={onSelectionChanged}
      searchQuery={searchQuery}
      activeFilter={activeFilter}
    />
  )
})
