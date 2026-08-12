// S8: the Step 8 rebuild in progress. Lives at a distinct route from the
// existing /app/graph (react-force-graph-2d + backend calls — exactly what
// S8.0's rules rule out for this build) so the old page keeps working while
// this one is built block by block. Intended to replace /app/graph once the
// three views (NETWORK/STRATA/TERRAIN, 8.4-8.7) exist; nothing about the
// old route is touched until then.
//
// S8.8 — WIRING THE THREE VIEWS. S8.5N later removes the split-pane
// (GraphSplitPane) entirely — "Network is the full canvas, always"; Strata
// and Terrain still get the tab to themselves, full-canvas, when selected
// directly via the segmented control.
//   - SEARCH lives here (top-left of the header) since it dims across all
//     three views identically — one field, one graphStore.searchQuery,
//     not three separate inputs that could disagree.
//   - Escape is handled in exactly ONE place: this file's global listener.
//     NETWORK's own dbl-click focus mode reacts to graphStore.focusChain
//     clearing rather than listening for Escape itself (see
//     NetworkView.tsx) — so there is never a race between two Escape
//     handlers both trying to own the same key.

import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { CANVAS, HAIRLINE, TEXT_PRIMARY } from '../ase/tokens'
import { GraphErrorBoundary } from '../components/graph/GraphErrorBoundary'
import { GraphSearchBar } from '../components/graph/GraphSearchBar'
import { NetworkView } from '../components/graph/NetworkView'
import { StrataView } from '../components/graph/StrataView'
import { TerrainView } from '../components/graph/TerrainView'
import { ViewModeSwitch } from '../components/graph/ViewModeSwitch'
import { InvestigationPanel, PANEL_WIDTH_PX } from '../components/graph/InvestigationPanel'
import { graphStore } from '../graph/graphStore'
import { CURRENT_DATASET } from '../graph/currentDataset'
import { buildSearchIndex, computeSearchMatches, firstSearchMatch } from '../graph/search'

export function GraphNext() {
  const snapshot = useSyncExternalStore(graphStore.subscribe, graphStore.getSnapshot)
  const searchIndex = useMemo(() => buildSearchIndex(CURRENT_DATASET), [])
  const matchCount = useMemo(() => computeSearchMatches(searchIndex, snapshot.searchQuery)?.size ?? null, [searchIndex, snapshot.searchQuery])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      const active = document.activeElement as HTMLElement | null
      // Escape while typing in the search field clears the field itself
      // first — clearing selection out from under someone mid-search would
      // be surprising. A second Escape (field now empty, or already
      // elsewhere) clears selection/hover/focus mode.
      if (active?.tagName === 'INPUT' && snapshot.searchQuery) {
        graphStore.setSearchQuery('')
        return
      }
      graphStore.clearInteraction()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [snapshot.searchQuery])

  function handleSearchEnter() {
    const match = firstSearchMatch(CURRENT_DATASET, searchIndex, snapshot.searchQuery)
    if (match) graphStore.setSelection(match)
  }

  return (
    <div className="flex h-full w-full" style={{ background: CANVAS }}>
      <div className="relative flex min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 px-4 py-2" style={{ borderBottom: `1px solid ${HAIRLINE}` }}>
          <div className="flex items-center gap-4">
            <span className="font-mono" style={{ fontSize: 11, letterSpacing: '0.08em', color: TEXT_PRIMARY }}>
              GRAPH
            </span>
            <GraphSearchBar dataset={CURRENT_DATASET} filter={snapshot.filter} searchQuery={snapshot.searchQuery} matchCount={matchCount} onEnter={handleSearchEnter} />
          </div>
          <div className="flex items-center gap-3">
            <ViewModeSwitch />
          </div>
        </div>
        <div className="relative min-h-0 flex-1">
          <GraphErrorBoundary label="Canvas" onReset={() => graphStore.setSelection(null)}>
            {/* S8.5N: NETWORK is the full canvas, always — no split pane
                beneath it. Strata still gets the tab to itself, full-canvas,
                when selected directly via the segmented control. */}
            {snapshot.viewMode === 'network' ? <NetworkView /> : snapshot.viewMode === 'strata' ? <StrataView dataset={CURRENT_DATASET} /> : <TerrainView />}
          </GraphErrorBoundary>
        </div>
      </div>
      {/* S8.5N: THE DETAIL PANEL — "not a floating card... a fixed 380px
          panel on the right edge, always present." A real flex sibling, not
          an absolutely-positioned overlay: the canvas's own ResizeObserver
          picks up the narrower width automatically, so nothing under the
          panel is ever drawn (and wasted) behind it. Its own error
          boundary, separate from the canvas's — a panel crash must never
          take the canvas down with it (S8.2's rule 7 discipline). */}
      <div className="h-full shrink-0" style={{ width: PANEL_WIDTH_PX }}>
        <GraphErrorBoundary label="Panel" onReset={() => graphStore.setSelection(null)}>
          <InvestigationPanel />
        </GraphErrorBoundary>
      </div>
    </div>
  )
}
