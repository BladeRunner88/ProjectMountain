// 8.13-ui/8.13.2: the redesigned 48px breadcrumb bar — logo + breadcrumb on
// the left, actions on the right: the NETWORK · STRATA · TERRAIN switcher
// (a visible segmented control per 8.13.2's own instruction — "a global
// mode control, not view chrome, and it is the one addition to that bar"),
// then × (clear selection) and ☰ (the "GO TO" nav menu, now that the old
// AppShell Sidebar is gone everywhere — see app/Topbar.tsx and
// controlRoom/TopBar.tsx for the same menu on the other pages).

import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { CloseIcon, MenuIcon } from '../icons'
import {
  BG_PRIMARY,
  BG_SECONDARY,
  BORDER_LIGHT,
  RADIUS_BUTTON,
  RADIUS_CARD,
  SHADOW_MEDIUM,
  SPACE_8,
  SPACE_16,
  SHADOW_SOFT,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  TEXT_TERTIARY,
  TOP_BAR_HEIGHT_PX,
  TYPE_BREADCRUMB,
  TYPE_LOGO,
  TYPE_SECTION_LABEL,
} from '../../graph/tokens'
import type { GraphNode } from '../../graph/adapter'
import { nearestAncestorOfType } from '../../graph/panelFields'
import type { ViewMode } from '../../graph/types'

const VIEWS: { mode: ViewMode; label: string }[] = [
  { mode: 'network', label: 'Network' },
  { mode: 'strata', label: 'Strata' },
  { mode: 'terrain', label: 'Terrain' },
]

const NAV_LINKS = [
  { to: '/app/dashboard', label: 'Dashboard' },
  { to: '/app/search', label: 'Search' },
  { to: '/app/control-room', label: 'Control Room' },
  { to: '/app/control-room/findings', label: 'Findings' },
]

interface Crumb {
  label: string
  active: boolean
  onClick?: () => void
}

const VIEW_CRUMB_LABEL: Record<ViewMode, string> = { network: 'Network', strata: 'Strata', terrain: 'Terrain' }

/**
 * ASE < Graph < Network (or Strata/Terrain, per the current view) when
 * nothing's selected. `viewLevelCrumb` is an extra segment specific to the
 * current view's OWN sub-selection concept — Strata's "a layer is selected
 * but no cell yet" state (INSPECT-style: ASE < Graph < Strata < Camp III)
 * — null for views with no such concept (Network). When a node/cell is
 * also selected, the same prefix continues on to <country> < <label>
 * (dropping the country segment when the node genuinely has no country
 * ancestor — a parentless source — rather than fabricating one), or
 * < N selected for multi-select.
 */
function buildBreadcrumb(
  selectedNodes: GraphNode[],
  allNodes: GraphNode[],
  viewMode: ViewMode,
  viewLevelCrumb: { label: string; onClick: () => void } | null,
  onDeselectAll: () => void,
  onSelectNode: (id: string) => void,
): Crumb[] {
  const base: Crumb[] = [
    { label: 'ASE', active: false, onClick: onDeselectAll },
    { label: 'Graph', active: false, onClick: onDeselectAll },
  ]
  const hasNodeSelection = selectedNodes.length > 0

  if (!hasNodeSelection && !viewLevelCrumb) {
    return [...base, { label: VIEW_CRUMB_LABEL[viewMode], active: true }]
  }
  base.push({ label: VIEW_CRUMB_LABEL[viewMode], active: false, onClick: onDeselectAll })
  if (viewLevelCrumb) base.push({ ...viewLevelCrumb, active: !hasNodeSelection })
  if (!hasNodeSelection) return base

  if (selectedNodes.length > 1) {
    return [...base, { label: `${selectedNodes.length} selected`, active: true }]
  }
  const node = selectedNodes[0]
  const nodeById = new Map(allNodes.map((n) => [n.id, n]))
  const country = node.type === 'country' ? null : nearestAncestorOfType(node, 'country', nodeById)
  if (country) base.push({ label: country.label, active: false, onClick: () => onSelectNode(country.id) })
  base.push({ label: node.label, active: true })
  return base
}

export function TopBar({
  selectedNodes,
  allNodes,
  onSelectNode,
  onDeselectAll,
  viewMode,
  onViewModeChange,
  viewLevelCrumb = null,
}: {
  selectedNodes: GraphNode[]
  allNodes: GraphNode[]
  onSelectNode: (nodeId: string) => void
  onDeselectAll: () => void
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  /** Strata's "layer selected, no cell yet" breadcrumb segment — see buildBreadcrumb's own doc. */
  viewLevelCrumb?: { label: string; onClick: () => void } | null
}) {
  const crumbs = buildBreadcrumb(selectedNodes, allNodes, viewMode, viewLevelCrumb, onDeselectAll, onSelectNode)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    function onOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', onOutside)
    document.addEventListener('keydown', onEscape)
    return () => {
      document.removeEventListener('mousedown', onOutside)
      document.removeEventListener('keydown', onEscape)
    }
  }, [menuOpen])

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        height: TOP_BAR_HEIGHT_PX,
        flexShrink: 0,
        background: BG_PRIMARY,
        borderBottom: `1px solid ${BORDER_LIGHT}`,
        padding: `0 ${SPACE_16}px`,
        gap: SPACE_16,
      }}
    >
      <span style={{ ...TYPE_LOGO, flexShrink: 0 }}>Isildur</span>

      <div className="flex items-center" style={{ gap: SPACE_8, minWidth: 0, overflow: 'hidden' }}>
        {crumbs.map((c, i) => (
          <span key={i} className="flex items-center" style={{ gap: SPACE_8 }}>
            {i > 0 && <span style={{ ...TYPE_BREADCRUMB, color: TEXT_TERTIARY }}>{'<'}</span>}
            {c.onClick ? (
              <button
                type="button"
                onClick={c.onClick}
                style={{
                  ...TYPE_BREADCRUMB,
                  color: c.active ? TEXT_PRIMARY : TEXT_SECONDARY,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  whiteSpace: 'nowrap',
                }}
              >
                {c.label}
              </button>
            ) : (
              <span style={{ ...TYPE_BREADCRUMB, fontWeight: c.active ? 500 : 400, color: c.active ? TEXT_PRIMARY : TEXT_TERTIARY, whiteSpace: 'nowrap' }}>{c.label}</span>
            )}
          </span>
        ))}
      </div>

      <div style={{ flex: 1 }} />

      <ViewSwitcher viewMode={viewMode} onViewModeChange={onViewModeChange} />

      <button
        type="button"
        onClick={onDeselectAll}
        disabled={selectedNodes.length === 0}
        aria-label="Clear selection"
        title="Clear selection"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, background: 'none', border: 'none', cursor: selectedNodes.length === 0 ? 'default' : 'pointer', color: selectedNodes.length === 0 ? TEXT_TERTIARY : TEXT_SECONDARY, opacity: selectedNodes.length === 0 ? 0.4 : 1 }}
      >
        <CloseIcon className="h-4 w-4" />
      </button>

      <div ref={menuRef} style={{ position: 'relative' }}>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Menu"
          aria-expanded={menuOpen}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, background: 'none', border: 'none', cursor: 'pointer', color: TEXT_SECONDARY }}
        >
          <MenuIcon className="h-4 w-4" />
        </button>

        {menuOpen && (
          <div
            style={{
              position: 'absolute',
              top: 36,
              right: 0,
              width: 200,
              background: BG_PRIMARY,
              border: `1px solid ${BORDER_LIGHT}`,
              borderRadius: RADIUS_CARD,
              boxShadow: SHADOW_MEDIUM,
              padding: SPACE_8,
              zIndex: 20,
            }}
          >
            <p style={{ ...TYPE_SECTION_LABEL, padding: `${SPACE_8}px ${SPACE_8}px 4px` }}>GO TO</p>
            {NAV_LINKS.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                onClick={() => setMenuOpen(false)}
                style={{ ...TYPE_BREADCRUMB, display: 'block', width: '100%', padding: `${SPACE_8}px`, color: TEXT_PRIMARY, borderRadius: RADIUS_CARD, textDecoration: 'none' }}
              >
                {link.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/** 8.13.2: "sits in the top bar's right action group, ahead of the icon buttons — it is a global mode control, not view chrome" — a visible segmented control, not tucked inside the ☰ menu. */
function ViewSwitcher({ viewMode, onViewModeChange }: { viewMode: ViewMode; onViewModeChange: (mode: ViewMode) => void }) {
  return (
    <div className="flex items-center" style={{ background: BG_SECONDARY, borderRadius: RADIUS_BUTTON, padding: 2, gap: 2 }} role="tablist" aria-label="View">
      {VIEWS.map((v) => (
        <button
          key={v.mode}
          type="button"
          role="tab"
          aria-selected={v.mode === viewMode}
          onClick={() => onViewModeChange(v.mode)}
          style={{
            ...TYPE_BREADCRUMB,
            padding: `4px ${SPACE_8}px`,
            fontWeight: v.mode === viewMode ? 600 : 400,
            color: v.mode === viewMode ? TEXT_PRIMARY : TEXT_SECONDARY,
            background: v.mode === viewMode ? BG_PRIMARY : 'none',
            border: 'none',
            borderRadius: RADIUS_BUTTON,
            cursor: 'pointer',
            boxShadow: v.mode === viewMode ? SHADOW_SOFT : 'none',
          }}
        >
          {v.label}
        </button>
      ))}
    </div>
  )
}
