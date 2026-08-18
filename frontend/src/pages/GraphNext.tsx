// 8.3: THE FRAME the three views mount into. Full-height flex, no page
// scroll — the canvas never scrolls, it pans (once panning exists; for now
// it's a static placeholder pane).
//
// `.graph-root` (graph/tokens.css) scopes the white token palette to this
// subtree only; graph/interactions.css carries the hover/focus pseudo-
// class rules plain inline styles can't express. Neither leaks onto the
// rest of the app, which keeps its current dark treatment.

import { useCallback, useEffect, useRef, useState } from 'react'
import '../graph/tokens.css'
import '../graph/interactions.css'
import { TopBar } from '../components/graph/TopBar'
import { ResetViewButton } from '../components/graph/ResetViewButton'
import { Legend } from '../components/graph/Legend'
import { PlaceholderPane } from '../components/graph/PlaceholderPane'
import { LeftPanel } from '../components/graph/LeftPanel'
import { type ActivityEntry } from '../components/graph/GlobalDashboard'
import { BottomTimeline } from '../components/graph/BottomTimeline'
import { NetworkView } from '../components/graph/NetworkView'
import type { GraphCanvasHandle } from '../components/graph/GraphCanvas'
import { StrataCanvas, type StrataCanvasHandle } from '../components/graph/StrataCanvas'
import type { GraphEdge, GraphNode } from '../graph/adapter'
import type { LiveGraphEvent } from '../graph/liveGraphState'
import type { StrataLayer } from '../graph/strataLayout'
import { pageLayoutModeForWidth, type FilterKind, type PageLayoutMode, type ViewMode } from '../graph/types'
import { nearestAncestorOfType } from '../graph/panelFields'
import { TOP_BAR_HEIGHT_PX } from '../graph/tokens'
import { HoverProvider } from '../ase/hover'
import { InspectorProvider } from '../components/controlRoom/InspectorContext'
import { SelectionProvider, useSelection } from '../ase/selection'
import { Inspector } from '../components/controlRoom/Inspector'

const RECENT_ACTIVITY_LIMIT = 20

const VIEW_LABEL: Record<ViewMode, string> = { network: 'NETWORK', strata: 'STRATA', terrain: 'TERRAIN' }

// 8.11: the panel's PROPERTIES section reuses Metric/Inspector verbatim
// ("the same derivation the Control Room shows, not a second
// implementation") — which means this page needs its own, page-scoped
// instances of the three contexts Metric/Inspector depend on. Deliberately
// separate from Control Room's own instances (mounted once in
// AppShell/ControlRoom, not here) — clicking a value on the graph page must
// not clobber whatever's selected in a different, unrelated Control Room
// tab a user might still have state for.
export function GraphNext() {
  return (
    <SelectionProvider>
      <HoverProvider>
        <InspectorProvider>
          <GraphNextInner />
        </InspectorProvider>
      </HoverProvider>
    </SelectionProvider>
  )
}

function GraphNextInner() {
  const [viewMode, setViewMode] = useState<ViewMode>('network')
  const [searchQuery, setSearchQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState<FilterKind>('all')
  const [legendExpanded, setLegendExpanded] = useState(false)
  // "differs from default" — filters (this state) OR the canvas's own
  // pan/zoom (GraphCanvas.tsx owns that as a ref; onViewChanged reports
  // only the rare moment it crosses into/out of default, never per frame).
  const [canvasIsDefault, setCanvasIsDefault] = useState(true)
  // 8.10: the graph's current selection — GraphCanvas owns the actual
  // selectedNodeIds state (a graph-topology concern) and reports the
  // resolved GraphNode objects up here, the same "own it low, report it
  // up" shape onViewChanged already uses for pan/zoom.
  const [selectedNodes, setSelectedNodes] = useState<GraphNode[]>([])
  // 8.11: the FULL graph (not the live-render subset) — the detail panel's
  // CONNECTIONS/PROPERTIES need to resolve parents/ancestors/contributing
  // sources against every node, not just whatever's currently animated in.
  const [graphNodes, setGraphNodes] = useState<GraphNode[]>([])
  const [graphEdges, setGraphEdges] = useState<GraphEdge[]>([])
  // 8.13-ui: real touched/statusChanged/removed/added events, bounded to the
  // most recent RECENT_ACTIVITY_LIMIT — the left panel's Global Dashboard's
  // own real "Recent Activity" feed.
  const [recentActivity, setRecentActivity] = useState<ActivityEntry[]>([])
  // 8.13.5 RESPONSIVE: "compact: timeline collapses to its 40px tab by
  // default" — including on a page that LOADS directly at a compact width
  // (not just one that resizes into it), so the initial value itself reads
  // the real starting width rather than relying solely on the resize effect
  // below (which only fires on a MODE TRANSITION, not on mount).
  const [timelineCollapsed, setTimelineCollapsed] = useState(() => typeof window !== 'undefined' && pageLayoutModeForWidth(window.innerWidth) === 'compact')
  // 8.13.2: Strata's own two-level selection (a layer, and optionally a
  // cell within it) — the cell half reuses `selectedNodes` above (same
  // shared-panel data Network already feeds), this tracks the layer half
  // for the breadcrumb's "ASE < Graph < Strata < Camp III" segment.
  const [selectedStrataLayer, setSelectedStrataLayer] = useState<StrataLayer | null>(null)
  // 8.13-ui: the Strata dashboard's own Country -> Status -> Climbers
  // browser (GlobalDashboard.tsx) lives here, not as local drill state —
  // StrataCanvas.tsx needs this SAME real country id to decide what its
  // own right-hand tree renders ("select Nepal on the left, only Nepal
  // shows on the right; nothing selected, only the altitude bands show").
  // Cleared on view switch below, same as selectedStrataLayer.
  const [selectedStrataCountryId, setSelectedStrataCountryId] = useState<string | null>(null)
  const networkRef = useRef<GraphCanvasHandle>(null)
  const strataRef = useRef<StrataCanvasHandle>(null)
  // 8.13.4 correction: "the left panel does not blank during the morph. If
  // a node was selected, its detail stays rendered throughout" overrides
  // 8.13.2's earlier "switching views always clears selection" — a climber
  // selection now carries across a view switch (Strata only has a
  // representation for climbers, so a non-climber Network selection still
  // has nothing to carry into Strata and correctly falls back to the
  // dashboard). The NEW canvas's ref isn't attached until after this
  // render commits, so the actual re-affirm happens in the effect below.
  const pendingCarrySelectionRef = useRef<string | null>(null)
  const { selection } = useSelection()

  // 8.13.5 RESPONSIVE: the one layout-mode signal every breakpoint rule
  // below reads from — computed from the real window width, not a media
  // query string duplicated in three places.
  const [layoutMode, setLayoutMode] = useState<PageLayoutMode>(() => (typeof window === 'undefined' ? 'full' : pageLayoutModeForWidth(window.innerWidth)))
  useEffect(() => {
    function onResize() {
      setLayoutMode(pageLayoutModeForWidth(window.innerWidth))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  // "compact: timeline collapses to its 40px tab BY DEFAULT" — only forces
  // the collapse on the transition INTO compact, so a user who manually
  // re-expands it isn't fought on every resize-triggered re-render.
  const prevLayoutModeRef = useRef(layoutMode)
  useEffect(() => {
    if (layoutMode === 'compact' && prevLayoutModeRef.current !== 'compact') setTimelineCollapsed(true)
    prevLayoutModeRef.current = layoutMode
  }, [layoutMode])

  // 8.13-ui Stage 8: the bottom timeline's Decision Capacity swimlane only
  // ever shows for a single selected climber that actually has a real
  // prediction timeline (the 9-of-50 gate already applied in adapter.ts) —
  // never for 0/multi-select, and never a fabricated lane for the other 41.
  const selectedClimberWithTimeline = selectedNodes.length === 1 && selectedNodes[0].timeline ? selectedNodes[0] : null

  // 8.12: "Filters and search compose. Active filters make RESET VIEW
  // appear" — search does too, since it also pans the camera and dims the
  // graph; clearing it is as much a "back to default" action as clearing a
  // filter or re-centring pan/zoom.
  const isDefaultView = activeFilter === 'all' && canvasIsDefault && searchQuery.trim() === ''

  function handleResetView() {
    setActiveFilter('all')
    setSearchQuery('')
    if (viewMode === 'strata') strataRef.current?.resetView()
    else networkRef.current?.resetView()
  }

  // 8.13.4: a selected CLIMBER carries across a view switch (Network <->
  // Strata <-> Terrain) — "the left panel does not blank during the morph,
  // only its contents update." Only climbers carry (the one node type
  // every view can represent); a country/route/operator/source selection,
  // or nothing selected, has no honest equivalent in Strata and correctly
  // falls back to the dashboard rather than pretending otherwise.
  function handleViewModeChange(mode: ViewMode) {
    const climberToCarry = selectedNodes.length === 1 && selectedNodes[0].type === 'climber' ? selectedNodes[0].id : null
    pendingCarrySelectionRef.current = climberToCarry
    setViewMode(mode)
    if (!climberToCarry) {
      setSelectedNodes([])
      setSelectedStrataLayer(null)
      setSelectedStrataCountryId(null)
    }
  }

  // Runs after the new canvas has mounted and attached its ref (refs are
  // set during commit, before effects run) — re-affirms the carried
  // climber's selection in whichever real canvas just mounted so its OWN
  // selection state (and, for Strata, the layer it belongs to) is correct,
  // not just the left panel's already-preserved `selectedNodes`.
  useEffect(() => {
    const carryId = pendingCarrySelectionRef.current
    if (!carryId) return
    pendingCarrySelectionRef.current = null
    if (viewMode === 'strata') {
      // The right-hand tree only renders a country the left panel's own
      // browser has selected — a climber carried in from Network needs
      // that SAME real country set here first, or it would arrive
      // "selected" with nothing on canvas to show it in.
      const nodeById = new Map(graphNodes.map((n) => [n.id, n]))
      const carriedNode = nodeById.get(carryId)
      const country = carriedNode ? nearestAncestorOfType(carriedNode, 'country', nodeById) : null
      if (country) setSelectedStrataCountryId(country.id)
      strataRef.current?.selectNodeExternally(carryId)
    } else if (viewMode === 'network') networkRef.current?.selectNodeExternally(carryId)
  }, [viewMode, graphNodes])

  const handleGraphDataChanged = useCallback((nodes: GraphNode[], edges: GraphEdge[]) => {
    setGraphNodes(nodes)
    setGraphEdges(edges)
  }, [])

  const handleLiveEventsChanged = useCallback((events: readonly LiveGraphEvent[]) => {
    setRecentActivity((prev) => {
      const next = [...events.map((e) => ({ id: `${e.kind}-${e.nodeId}-${e.at}`, kind: e.kind, nodeId: e.nodeId, at: e.at })), ...prev]
      return next.slice(0, RECENT_ACTIVITY_LIMIT)
    })
  }, [])

  const handleSelectNode = useCallback(
    (nodeId: string) => {
      if (viewMode === 'strata') strataRef.current?.selectNodeExternally(nodeId)
      else networkRef.current?.selectNodeExternally(nodeId)
    },
    [viewMode],
  )

  const handleDeselectAll = useCallback(() => {
    if (viewMode === 'strata') strataRef.current?.deselectAllExternally()
    else networkRef.current?.deselectAllExternally()
  }, [viewMode])

  // 8.13.2: "Clicking Camp III from a cell returns to layer selection
  // without collapsing the layer" — clears only the cell, keeps the layer.
  const strataViewLevelCrumb =
    viewMode === 'strata' && selectedStrataLayer ? { label: selectedStrataLayer.name, onClick: () => strataRef.current?.deselectCellKeepLayer() } : null

  return (
    <div className="graph-root flex h-full w-full flex-col overflow-hidden">
      <TopBar
        selectedNodes={selectedNodes}
        allNodes={graphNodes}
        onSelectNode={handleSelectNode}
        onDeselectAll={handleDeselectAll}
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
        viewLevelCrumb={strataViewLevelCrumb}
      />
      <div className="flex min-h-0 w-full flex-1 overflow-hidden">
        <LeftPanel
          selectedNodes={selectedNodes}
          allNodes={graphNodes}
          allEdges={graphEdges}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          activeFilter={activeFilter}
          onFilterChange={setActiveFilter}
          recentActivity={recentActivity}
          onSelectNode={handleSelectNode}
          onDeselectAll={handleDeselectAll}
          viewMode={viewMode}
          selectedStrataLayer={selectedStrataLayer}
          selectedStrataCountryId={selectedStrataCountryId}
          onSelectStrataCountryId={setSelectedStrataCountryId}
          onViewLayerInNetwork={() => handleViewModeChange('network')}
          onViewLayerInTerrain={() => handleViewModeChange('terrain')}
          layoutMode={layoutMode}
        />
        <div className="relative min-w-0 flex-1 overflow-hidden">
          {viewMode === 'network' && (
            <NetworkView
              ref={networkRef}
              onViewChanged={setCanvasIsDefault}
              onSelectionChanged={setSelectedNodes}
              onGraphDataChanged={handleGraphDataChanged}
              onLiveEventsChanged={handleLiveEventsChanged}
              searchQuery={searchQuery}
              activeFilter={activeFilter}
            />
          )}
          {viewMode === 'strata' && (
            <StrataCanvas
              ref={strataRef}
              onViewChanged={setCanvasIsDefault}
              onSelectionChanged={setSelectedNodes}
              onLayerSelectionChanged={setSelectedStrataLayer}
              onGraphDataChanged={handleGraphDataChanged}
              onLiveEventsChanged={handleLiveEventsChanged}
              selectedCountryId={selectedStrataCountryId}
              layoutMode={layoutMode}
            />
          )}
          {viewMode === 'terrain' && <PlaceholderPane label={VIEW_LABEL[viewMode]} />}
          <ResetViewButton visible={!isDefaultView} onClick={handleResetView} />
          {/* Strata renders its OWN legend (real layer stress tiers, cell shape/colour, size) inside StrataCanvas itself — Network's shows country/route/climber/source colours that don't apply there, so it stays Network-only. 8.13.5: hidden below 1024px, same "no canvas width stolen at a width that can't afford it" ruling StrataCanvas applies to its own legend/minimap. */}
          {viewMode === 'network' && layoutMode !== 'sheet' && layoutMode !== 'mobile' && <Legend expanded={legendExpanded} onToggle={() => setLegendExpanded((v) => !v)} />}
        </div>
        {selection?.kind === 'value' && (
          // 8.13-ui: an overlay drawer, not a flex sibling — "the graph
          // canvas must fill ALL remaining width" (the redesign spec's own
          // rule) has to stay true even while a derivation is open, so this
          // floats over the left-panel/canvas row instead of squeezing it.
          // Docked LEFT, not right — "information stays on the left, never
          // a right panel" applies to every panel this page shows, not just
          // the persistent one. Inspector's own dark theme and internals
          // are untouched.
          <div style={{ position: 'fixed', top: TOP_BAR_HEIGHT_PX, left: 0, bottom: 0, zIndex: 30 }}>
            <Inspector />
          </div>
        )}
      </div>
      <BottomTimeline
        collapsed={timelineCollapsed}
        onToggleCollapsed={() => setTimelineCollapsed((v) => !v)}
        recentActivity={recentActivity}
        allNodes={graphNodes}
        selectedClimberWithTimeline={selectedClimberWithTimeline}
      />
    </div>
  )
}
