'use client'

// S8: the Step 8 rebuild. Distinct from /app/graph (react-force-graph-2d +
// backend). Search lives here (top-left of the header) since it dims across
// all three views identically. Escape is handled in exactly ONE place: this
// file's global listener.

import { useEffect, useMemo, type ReactElement } from 'react'
import { CANVAS, HAIRLINE, TEXT_PRIMARY } from '@/features/ase/tokens'
import { useGraphSnapshot, useGraphStore } from '../hooks/useGraphStore'
import { CURRENT_DATASET } from '../services/currentDataset'
import { buildSearchIndex, computeSearchMatches, firstSearchMatch } from '../services/search'
import { GraphErrorBoundary } from './GraphErrorBoundary'
import { GraphSearchBar } from './GraphSearchBar'
import { InvestigationPanel, PANEL_WIDTH_PX } from './InvestigationPanel'
import { NetworkView } from './NetworkView'
import { StrataView } from './StrataView'
import { TerrainView } from './TerrainView'
import { ViewModeSwitch } from './ViewModeSwitch'
import './graph-next.css'

export function GraphNext(): ReactElement {
  const snapshot = useGraphSnapshot()
  const store = useGraphStore()
  const searchIndex = useMemo(() => buildSearchIndex(CURRENT_DATASET), [])
  const matchCount = useMemo(
    () => computeSearchMatches(searchIndex, snapshot.searchQuery)?.size ?? null,
    [searchIndex, snapshot.searchQuery],
  )

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key !== 'Escape') return
      const active = document.activeElement as HTMLElement | null
      // Escape while typing in the search field clears the field itself
      // first — clearing selection out from under someone mid-search would
      // be surprising. A second Escape (field now empty, or already
      // elsewhere) clears selection/hover/focus mode.
      if (active?.tagName === 'INPUT' && snapshot.searchQuery) {
        store.setSearchQuery('')
        return
      }
      store.clearInteraction()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [snapshot.searchQuery, store])

  function handleSearchEnter(): void {
    const match = firstSearchMatch(CURRENT_DATASET, searchIndex, snapshot.searchQuery)
    if (match) store.setSelection(match)
  }

  const canvas =
    snapshot.viewMode === 'network' ? (
      <NetworkView />
    ) : snapshot.viewMode === 'strata' ? (
      <StrataView dataset={CURRENT_DATASET} />
    ) : (
      <TerrainView />
    )

  return (
    <div className="flex h-full w-full" style={{ background: CANVAS }}>
      <div className="relative flex min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 px-4 py-2" style={{ borderBottom: `1px solid ${HAIRLINE}` }}>
          <div className="flex items-center gap-4">
            <span className="font-mono" style={{ fontSize: 11, letterSpacing: '0.08em', color: TEXT_PRIMARY }}>
              GRAPH
            </span>
            <GraphSearchBar
              dataset={CURRENT_DATASET}
              filter={snapshot.filter}
              searchQuery={snapshot.searchQuery}
              matchCount={matchCount}
              onEnter={handleSearchEnter}
            />
          </div>
          <div className="flex items-center gap-3">
            <ViewModeSwitch />
          </div>
        </div>
        <div className="relative min-h-0 flex-1">
          <GraphErrorBoundary label="Canvas" onReset={() => store.setSelection(null)}>
            {canvas}
          </GraphErrorBoundary>
        </div>
      </div>
      <div className="h-full shrink-0" style={{ width: PANEL_WIDTH_PX }}>
        <GraphErrorBoundary label="Panel" onReset={() => store.setSelection(null)}>
          <InvestigationPanel />
        </GraphErrorBoundary>
      </div>
    </div>
  )
}
