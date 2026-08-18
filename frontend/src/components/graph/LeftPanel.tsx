// 8.13-ui: the redesigned 420px left panel frame — "Gotham-style," always
// visible, never an empty state. Owns the persistent search box (the old
// top bar's SearchInput, relocated) and delegates content to whichever of
// three states applies: GlobalDashboard (nothing selected), LayerDetailPanel
// (8.13.3, Strata's own layer selected but no cell yet), or the existing
// DetailPanelBody (searching, and/or a node/cell selected — its own
// internal branching covers Network's 1/2-5/6+ AND, since 8.13.2/8.13.3,
// Strata's single-cell selection identically, because both report through
// the SAME selectedNodes shape — "the left panel renders climber detail
// using the SAME component Network uses," never a second implementation).

import { useRef, useState } from 'react'
import type { GraphEdge, GraphNode } from '../../graph/adapter'
import {
  ACCENT_BLUE,
  BADGE_TEXT_COLOR,
  BG_PRIMARY,
  BG_SECONDARY,
  BORDER_LIGHT,
  BORDER_MEDIUM,
  LEFT_PANEL_WIDTH_PX,
  MODAL_CLOSE_FONT_SIZE,
  OVERLAY_BACKDROP,
  PANEL_INTERNAL_PADDING,
  RADIUS_BADGE,
  RADIUS_BUTTON,
  SHADOW_MEDIUM,
  SPACE_8,
  SPACE_16,
  TEXT_PRIMARY,
  TEXT_TERTIARY,
  TYPE_BODY_ROW,
  TYPE_SECTION_LABEL,
} from '../../graph/tokens'
import { SearchIcon } from '../icons'
import { DetailPanelBody } from './DetailPanel'
import { GlobalDashboard, type ActivityEntry } from './GlobalDashboard'
import { LayerDetailPanel } from './LayerDetailPanel'
import { altitudeInLayer, buildStrataLayers, type StrataLayer } from '../../graph/strataLayout'
import { strataLayerFillColor } from '../../graph/strataVisuals'
import { MOVEMENT_ALTITUDES_M, MOVEMENT_CAMPS } from '../../ase/identityCard'
import type { FilterKind, PageLayoutMode, ViewMode } from '../../graph/types'

const SHEET_HEIGHT_VH = 60
const SHEET_EXPANDED_HEIGHT_VH = 90
const SHEET_DRAG_EXPAND_THRESHOLD_PX = 60

const FILTERS: { kind: FilterKind; label: string }[] = [
  { kind: 'all', label: 'All' },
  { kind: 'anomalies', label: 'Anomalies' },
  { kind: 'watch', label: 'Watch' },
  { kind: 'by-tier', label: 'By tier' },
  { kind: 'by-country', label: 'By country' },
]

export interface LeftPanelProps {
  selectedNodes: GraphNode[]
  allNodes: GraphNode[]
  allEdges: GraphEdge[]
  searchQuery: string
  onSearchChange: (value: string) => void
  activeFilter: FilterKind
  onFilterChange: (kind: FilterKind) => void
  recentActivity: ActivityEntry[]
  onSelectNode: (nodeId: string) => void
  onDeselectAll: () => void
  viewMode: ViewMode
  selectedStrataLayer: StrataLayer | null
  /** 8.13-ui: the Strata dashboard's own Country -> Status -> Climbers browser (GlobalDashboard.tsx) — lifted here (not local drill state) because StrataCanvas needs the SAME selection to decide what the right-hand tree renders. */
  selectedStrataCountryId: string | null
  onSelectStrataCountryId: (id: string | null) => void
  onViewLayerInNetwork?: () => void
  onViewLayerInTerrain?: () => void
  /** 8.13.5 RESPONSIVE: 'full'/'compact' render the normal fixed 420px sidebar (unchanged); 'sheet' renders as a bottom sheet overlay so the canvas can take full width; 'mobile' renders as a full-screen modal shown only on selection, matching "the panel never slides in and out at desktop widths... below 1024 it's a sheet, a different component, not a hidden panel." Defaults to 'full' so every existing call site (and every prior Playwright suite) keeps working unchanged. */
  layoutMode?: PageLayoutMode
}

export function LeftPanel({
  selectedNodes,
  allNodes,
  allEdges,
  searchQuery,
  onSearchChange,
  activeFilter,
  onFilterChange,
  recentActivity,
  onSelectNode,
  onDeselectAll,
  viewMode,
  selectedStrataLayer,
  selectedStrataCountryId,
  onSelectStrataCountryId,
  onViewLayerInNetwork,
  onViewLayerInTerrain,
  layoutMode = 'full',
}: LeftPanelProps) {
  const isSearching = searchQuery.trim() !== ''
  const showLayerDetail = viewMode === 'strata' && selectedStrataLayer !== null && selectedNodes.length === 0 && !isSearching
  const hasSelection = selectedNodes.length > 0 || selectedStrataLayer !== null || isSearching
  // 8.13-ui: Strata's tree only renders once a country is picked, and that
  // picker lives in this same panel — on mobile, "hidden until something's
  // selected" would make it unreachable (nothing to select without the
  // panel; no panel without a selection). Strata gets one exception: stay
  // reachable until a country is actually chosen.
  const strataNeedsCountryPicker = viewMode === 'strata' && !showLayerDetail && !hasSelection && selectedStrataCountryId === null

  // 'mobile': no persistent panel — only a full-screen modal, and only once
  // something real is selected. Nothing selected means nothing renders here
  // at all, by design (the desktop "never empty" rule is explicitly a
  // desktop-width rule; the mobile ruling is its own, different shape) —
  // except Strata's country picker above, its one real entry point.
  if (layoutMode === 'mobile' && !hasSelection && !strataNeedsCountryPicker) return null

  return (
    <LeftPanelShell layoutMode={layoutMode} onDismiss={onDeselectAll} title={strataNeedsCountryPicker ? 'SELECT A COUNTRY' : 'DETAIL'}>
      <SearchBox value={searchQuery} onChange={onSearchChange} />
      {/* 8.13-ui: Strata's own status narrowing now lives one level into the
          Country -> Status -> Climbers browser below, not as a second,
          always-visible pill row duplicating it — Network keeps its own
          topology pills exactly as before. */}
      {viewMode !== 'strata' && <QuickFilters activeFilter={activeFilter} onFilterChange={onFilterChange} />}
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: PANEL_INTERNAL_PADDING }}>
        {showLayerDetail && selectedStrataLayer ? (
          <div style={{ padding: PANEL_INTERNAL_PADDING }}>
            <LayerDetailPanel
              key={selectedStrataLayer.index}
              layer={selectedStrataLayer}
              fillColor={strataLayerFillColor(selectedStrataLayer.index, buildStrataLayers(MOVEMENT_CAMPS, MOVEMENT_ALTITUDES_M).length)}
              climbers={allNodes.filter((n) => n.type === 'climber' && altitudeInLayer(typeof n.properties.currentAltitudeM?.value === 'number' ? (n.properties.currentAltitudeM.value as number) : null, selectedStrataLayer))}
              allNodes={allNodes}
              onSelectClimber={onSelectNode}
              onDeselectAll={onDeselectAll}
              onViewInNetwork={() => onViewLayerInNetwork?.()}
              onViewInTerrain={() => onViewLayerInTerrain?.()}
            />
          </div>
        ) : !isSearching && selectedNodes.length === 0 ? (
          <GlobalDashboard
            allNodes={allNodes}
            recentActivity={recentActivity}
            viewMode={viewMode}
            onSelectClimber={onSelectNode}
            selectedCountryId={selectedStrataCountryId}
            onSelectCountryId={onSelectStrataCountryId}
          />
        ) : (
          <div style={{ padding: PANEL_INTERNAL_PADDING }}>
            <DetailPanelBody
              selectedNodes={selectedNodes}
              allNodes={allNodes}
              allEdges={allEdges}
              searchQuery={searchQuery}
              onSelectNode={onSelectNode}
              onDeselectAll={onDeselectAll}
            />
          </div>
        )}
      </div>
    </LeftPanelShell>
  )
}

/** 8.13.5 RESPONSIVE: the outer chrome ONLY — every mode renders the exact same children (SearchBox/QuickFilters/dashboard-or-detail), never a second panel implementation. 'full'/'compact' keep the original fixed-sidebar shell verbatim. 'sheet' adds a real, working drag handle (pointer-driven, not a CSS trick) that swipes between 60vh and 90vh. 'mobile' adds a backdrop + close affordance since there's no persistent chrome around it otherwise. */
function LeftPanelShell({ layoutMode, onDismiss, title = 'DETAIL', children }: { layoutMode: PageLayoutMode; onDismiss: () => void; title?: string; children: React.ReactNode }) {
  const [sheetExpanded, setSheetExpanded] = useState(false)
  const dragRef = useRef<{ startY: number; startExpanded: boolean } | null>(null)

  if (layoutMode === 'full' || layoutMode === 'compact') {
    return (
      <div
        style={{
          width: LEFT_PANEL_WIDTH_PX,
          flexShrink: 0,
          height: '100%',
          background: BG_SECONDARY,
          borderRight: `1px solid ${BORDER_LIGHT}`,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {children}
      </div>
    )
  }

  function handleDragStart(e: React.PointerEvent) {
    ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
    dragRef.current = { startY: e.clientY, startExpanded: sheetExpanded }
  }
  function handleDragMove(e: React.PointerEvent) {
    if (!dragRef.current) return
    const dy = e.clientY - dragRef.current.startY // negative = dragged up
    if (dy < -SHEET_DRAG_EXPAND_THRESHOLD_PX) setSheetExpanded(true)
    else if (dy > SHEET_DRAG_EXPAND_THRESHOLD_PX) setSheetExpanded(false)
  }
  function handleDragEnd() {
    dragRef.current = null
  }

  if (layoutMode === 'sheet') {
    return (
      <>
        <div
          style={{
            position: 'fixed',
            left: 0,
            right: 0,
            bottom: 0,
            height: `${sheetExpanded ? SHEET_EXPANDED_HEIGHT_VH : SHEET_HEIGHT_VH}vh`,
            zIndex: 40,
            background: BG_SECONDARY,
            borderTop: `1px solid ${BORDER_LIGHT}`,
            borderTopLeftRadius: 12,
            borderTopRightRadius: 12,
            boxShadow: SHADOW_MEDIUM,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            transition: 'height 250ms ease-out',
          }}
        >
          <div
            role="button"
            aria-label={sheetExpanded ? 'Collapse panel' : 'Expand panel — swipe up'}
            onPointerDown={handleDragStart}
            onPointerMove={handleDragMove}
            onPointerUp={handleDragEnd}
            onPointerCancel={handleDragEnd}
            onClick={() => setSheetExpanded((v) => !v)}
            style={{ flexShrink: 0, display: 'flex', justifyContent: 'center', padding: `${SPACE_8}px 0`, cursor: 'grab', touchAction: 'none' }}
          >
            <span aria-hidden style={{ width: 36, height: 4, borderRadius: 2, background: BORDER_MEDIUM }} />
          </div>
          {children}
        </div>
      </>
    )
  }

  // 'mobile' — a full-screen modal, real backdrop + close affordance.
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 40, background: OVERLAY_BACKDROP }} onClick={onDismiss}>
      <div
        style={{ position: 'absolute', inset: 0, background: BG_SECONDARY, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between" style={{ padding: PANEL_INTERNAL_PADDING, flexShrink: 0, borderBottom: `1px solid ${BORDER_LIGHT}` }}>
          <span style={TYPE_SECTION_LABEL}>{title}</span>
          <button type="button" onClick={onDismiss} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: TEXT_PRIMARY, fontSize: MODAL_CLOSE_FONT_SIZE, lineHeight: 1, padding: 0 }}>
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

// Persistent — visible whether the dashboard, a search, or a selection is
// showing, since by-tier/by-country need an active selection to resolve a
// reference (searchAndFilter.ts's resolveFilterReferenceId) and would be
// unreachable if these pills only lived inside the 0-selected dashboard.
function QuickFilters({ activeFilter, onFilterChange }: { activeFilter: FilterKind; onFilterChange: (kind: FilterKind) => void }) {
  return (
    <div style={{ flexShrink: 0 }}>
      <p style={{ ...TYPE_SECTION_LABEL, textTransform: 'uppercase', padding: `0 ${SPACE_16}px ${SPACE_8}px` }}>Quick Filters</p>
      <div className="flex flex-wrap" style={{ gap: SPACE_8, padding: `0 ${SPACE_16}px ${SPACE_16}px`, borderBottom: `1px solid ${BORDER_LIGHT}` }}>
        {FILTERS.map((f) => (
          <FilterPill key={f.kind} label={f.label} active={f.kind === activeFilter} onClick={() => onFilterChange(f.kind)} />
        ))}
      </div>
    </div>
  )
}

function FilterPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...TYPE_BODY_ROW,
        height: 28,
        padding: `0 ${SPACE_16}px`,
        borderRadius: RADIUS_BADGE,
        border: active ? 'none' : `1px solid ${BORDER_MEDIUM}`,
        background: active ? ACCENT_BLUE : 'transparent',
        color: active ? BADGE_TEXT_COLOR : TEXT_PRIMARY,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  )
}

function SearchBox({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div style={{ position: 'relative', margin: PANEL_INTERNAL_PADDING, marginBottom: SPACE_8, flexShrink: 0 }}>
      <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: TEXT_TERTIARY, pointerEvents: 'none' }}>
        <SearchIcon className="h-3.5 w-3.5" />
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search name, serial, operator, route, origin…"
        className="graph-search-input"
        style={{
          ...TYPE_BODY_ROW,
          width: '100%',
          height: 36,
          padding: `0 ${SPACE_8}px 0 28px`,
          border: `1px solid ${BORDER_MEDIUM}`,
          borderRadius: RADIUS_BUTTON,
          background: BG_PRIMARY,
        }}
      />
    </div>
  )
}
