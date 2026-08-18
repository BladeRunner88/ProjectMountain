// 8.3: the frame's right panel shell — 380px fixed, always present.
//
// 8.10: wired to the graph's own selection so "the panel opens or
// updates" / "switches to comparison mode" is genuinely true.
//
// 8.11: the actual content. Every value renders through the SAME
// TracedValue path the Control Room uses — `Metric` for anything that's a
// real traced fact, plain text (with an honest "not tracked"/"not
// available") for the spec's requested fields the backend genuinely
// doesn't carry. Nothing here is authored; panelFields.ts computes the
// data shape, this file only lays it out.
//
// 8.13-ui: the 1-selected state moved to TargetDetailPanel.tsx (header
// card + tabs + dense stat-grid card, per the redesign spec) and the
// 0-selected state moved to GlobalDashboard.tsx (LeftPanel.tsx routes to
// those directly now). What's left here — SearchResultsView (searching,
// 0 selected), ComparisonView (2-5 selected), BulkSummaryView (6+
// selected) — is genuinely still the real content for those states; only
// their shared chrome (Header, DividerRow) and frame stayed in this file.

import type { ReactNode } from 'react'
import type { GraphEdge, GraphNode } from '../../graph/adapter'
import {
  ACCENT_BLUE,
  BADGE_TEXT_COLOR,
  BG_SECONDARY,
  BORDER_LIGHT,
  BORDER_MEDIUM,
  LEFT_PANEL_WIDTH_PX,
  PANEL_INTERNAL_PADDING,
  PANEL_SECTION_GAP,
  RADIUS_BADGE,
  RADIUS_BUTTON,
  SPACE_8,
  SPACE_16,
  TEXT_PRIMARY,
  TEXT_TERTIARY,
  TYPE_BUTTON,
  TYPE_PANEL_HEADING,
  TYPE_PILL,
  TYPE_PROPERTY_LABEL,
  TYPE_PROPERTY_VALUE,
  TYPE_SECTION_LABEL,
  TYPE_SUMMARY_BODY,
  TYPE_TIMESTAMP,
} from '../../graph/tokens'
import { connectionRowsFor, curatedPropertyRowsWithConsumedKeys, ENTITY_TYPE_LABEL, READABLE_READINESS } from '../../graph/panelFields'
import { computeTierOrder } from '../../graph/interactionState'
import { computeSearchMatchIds } from '../../graph/searchAndFilter'
import { TargetDetailPanel } from './TargetDetailPanel'

export interface DetailPanelProps {
  selectedNodes: GraphNode[]
  allNodes: GraphNode[]
  allEdges: GraphEdge[]
  /** 8.12: while a search is active AND nothing is selected yet, the panel shows the result list instead of the expedition summary — the moment something IS selected (a direct node click, or a result clicked here), it falls through to the normal 1/2-5/6+ states below. */
  searchQuery: string
  onSelectNode: (nodeId: string) => void
  onDeselectAll: () => void
}

// LeftPanel.tsx routes 0-selected/not-searching to GlobalDashboard directly
// and never reaches this component in that state — the branch below is
// simply absent (rendering nothing) rather than dead EmptyState code.
export function DetailPanelBody({ selectedNodes, allNodes, allEdges, searchQuery, onSelectNode, onDeselectAll }: DetailPanelProps) {
  const isSearching = searchQuery.trim() !== ''
  return (
    <>
      {isSearching && selectedNodes.length === 0 && <SearchResultsView query={searchQuery} allNodes={allNodes} onSelectNode={onSelectNode} />}
      {selectedNodes.length === 1 && (
        <TargetDetailPanel node={selectedNodes[0]} allNodes={allNodes} allEdges={allEdges} onSelectNode={onSelectNode} onDeselectAll={onDeselectAll} />
      )}
      {selectedNodes.length >= 2 && selectedNodes.length <= 5 && (
        <ComparisonView nodes={selectedNodes} allNodes={allNodes} allEdges={allEdges} onDeselectAll={onDeselectAll} />
      )}
      {selectedNodes.length >= 6 && <BulkSummaryView nodes={selectedNodes} onDeselectAll={onDeselectAll} />}
    </>
  )
}

export function DetailPanel(props: DetailPanelProps) {
  return (
    <div
      style={{
        width: LEFT_PANEL_WIDTH_PX,
        flexShrink: 0,
        height: '100%',
        background: BG_SECONDARY,
        borderLeft: `1px solid ${BORDER_LIGHT}`,
        padding: PANEL_INTERNAL_PADDING,
        overflowY: 'auto',
      }}
    >
      <DetailPanelBody {...props} />
    </div>
  )
}

// -- shared chrome ------------------------------------------------------------

export function Header({ title, badgeText, badgeColor, onClose }: { title: string; badgeText?: string; badgeColor?: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between" style={{ marginBottom: PANEL_SECTION_GAP }}>
      <div className="flex items-center" style={{ gap: SPACE_8 }}>
        <p style={TYPE_PANEL_HEADING}>{title}</p>
        {badgeText && (
          <span
            style={{
              ...TYPE_PILL,
              color: BADGE_TEXT_COLOR,
              background: badgeColor ?? ACCENT_BLUE,
              borderRadius: RADIUS_BADGE,
              padding: `2px ${SPACE_8}px`,
            }}
          >
            {badgeText}
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        style={{ ...TYPE_PANEL_HEADING, color: TEXT_TERTIARY, background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1, padding: 0 }}
      >
        ×
      </button>
    </div>
  )
}

export function DividerRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between" style={{ gap: SPACE_8, padding: `${SPACE_8}px 0`, borderBottom: `1px solid ${BORDER_LIGHT}` }}>
      <span style={TYPE_PROPERTY_LABEL}>{label}</span>
      <span style={{ textAlign: 'right' }}>{children}</span>
    </div>
  )
}

// -- PANEL STATE: search active, nothing selected ---------------------------

function SearchResultsView({ query, allNodes, onSelectNode }: { query: string; allNodes: GraphNode[]; onSelectNode: (nodeId: string) => void }) {
  const matchIds = computeSearchMatchIds(allNodes, query)
  const results = computeTierOrder(allNodes).filter((n) => matchIds.has(n.id))

  return (
    <div>
      <p style={TYPE_PANEL_HEADING}>Search Results</p>
      <p style={{ ...TYPE_TIMESTAMP, marginTop: SPACE_8 }}>
        {results.length} match{results.length === 1 ? '' : 'es'} for "{query}"
      </p>
      <div style={{ marginTop: SPACE_16 }}>
        {results.length === 0 ? (
          <p style={{ ...TYPE_TIMESTAMP }}>No node matches this search.</p>
        ) : (
          results.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => onSelectNode(n.id)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: `${SPACE_8}px 0`,
                borderBottom: `1px solid ${BORDER_LIGHT}`,
              }}
            >
              <span style={TYPE_PROPERTY_VALUE}>{n.label}</span>
              <span style={{ ...TYPE_PROPERTY_LABEL, display: 'block' }}>{ENTITY_TYPE_LABEL[n.type]}</span>
            </button>
          ))
        )}
      </div>
    </div>
  )
}

// -- PANEL STATE: 2-5 selected — comparison table ----------------------------

interface ComparisonRow {
  key: string
  label: string
  values: string[]
}

function comparisonRows(nodes: GraphNode[], allNodes: GraphNode[], allEdges: GraphEdge[]): ComparisonRow[] {
  const sameType = nodes.every((n) => n.type === nodes[0].type)
  if (!sameType) {
    return [
      { key: 'type', label: 'Type', values: nodes.map((n) => ENTITY_TYPE_LABEL[n.type]) },
      { key: 'readiness', label: 'Readiness', values: nodes.map((n) => (n.status ? READABLE_READINESS[n.status] : 'Unassessed')) },
    ]
  }
  const perNode = nodes.map((n) => curatedPropertyRowsWithConsumedKeys(n, allNodes, allEdges).rows)
  return perNode[0].map((firstRow, idx) => ({
    key: firstRow.key,
    label: firstRow.label,
    values: perNode.map((rows) => {
      const row = rows[idx]
      if (row.kind === 'text') return row.value ?? '—'
      return row.traced ? String(row.traced.value) : '—'
    }),
  }))
}

function ComparisonView({
  nodes,
  allNodes,
  allEdges,
  onDeselectAll,
}: {
  nodes: GraphNode[]
  allNodes: GraphNode[]
  allEdges: GraphEdge[]
  onDeselectAll: () => void
}) {
  const rows = comparisonRows(nodes, allNodes, allEdges)
  const connectionRowsPerNode = nodes.map((n) => connectionRowsFor(n, allNodes, allEdges))
  const shared = connectionRowsPerNode[0].filter(
    (row, idx) => row.targetNodeId !== null && connectionRowsPerNode.every((rows) => rows[idx].targetNodeId === row.targetNodeId)
  )

  return (
    <div>
      <Header title={`${nodes.length} selected — comparing`} onClose={onDeselectAll} />
      <div style={{ overflowX: 'auto', marginTop: SPACE_16 }}>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              <th style={{ ...TYPE_SECTION_LABEL, textAlign: 'left', padding: SPACE_8, borderBottom: `1px solid ${BORDER_LIGHT}` }}>PROPERTY</th>
              {nodes.map((n) => (
                <th key={n.id} style={{ ...TYPE_PROPERTY_VALUE, textAlign: 'left', padding: SPACE_8, borderBottom: `1px solid ${BORDER_LIGHT}` }}>
                  {n.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <td style={{ ...TYPE_PROPERTY_LABEL, padding: SPACE_8, borderBottom: `1px solid ${BORDER_LIGHT}` }}>{row.label}</td>
                {row.values.map((v, i) => (
                  <td key={nodes[i].id} style={{ ...TYPE_PROPERTY_VALUE, padding: SPACE_8, borderBottom: `1px solid ${BORDER_LIGHT}` }}>
                    {v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: PANEL_SECTION_GAP }}>
        <p style={TYPE_SECTION_LABEL}>SHARED CONNECTIONS</p>
        {shared.length === 0 ? (
          <p style={{ ...TYPE_TIMESTAMP, marginTop: SPACE_8 }}>No connection is shared by every selected node.</p>
        ) : (
          <div style={{ marginTop: SPACE_8 }}>
            {shared.map((row) => (
              <DividerRow key={row.key} label={row.label}>
                <span style={TYPE_PROPERTY_VALUE}>{row.value}</span>
              </DividerRow>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// -- PANEL STATE: 6+ selected — bulk summary ---------------------------------

function BulkSummaryView({ nodes, onDeselectAll }: { nodes: GraphNode[]; onDeselectAll: () => void }) {
  const climbers = nodes.filter((n) => n.type === 'climber')
  const counts: Record<string, number> = { READY: 0, WATCH: 0, IMPAIRED: 0, REQUIRES_DESCENT: 0, UNASSESSED: 0 }
  for (const c of climbers) counts[c.status ?? 'UNASSESSED'] += 1
  const nonClimberCount = nodes.length - climbers.length

  const parts: string[] = []
  if (climbers.length > 0) parts.push(`${climbers.length} climber${climbers.length === 1 ? '' : 's'} selected.`)
  if (counts.REQUIRES_DESCENT > 0) parts.push(`${counts.REQUIRES_DESCENT} require descent.`)
  if (counts.WATCH > 0) parts.push(`${counts.WATCH} watch.`)
  if (counts.IMPAIRED > 0) parts.push(`${counts.IMPAIRED} impaired.`)
  if (counts.READY > 0) parts.push(`${counts.READY} ready.`)
  if (counts.UNASSESSED > 0) parts.push(`${counts.UNASSESSED} unassessed.`)
  if (nonClimberCount > 0) parts.push(`${nonClimberCount} non-climber node${nonClimberCount === 1 ? '' : 's'} also selected.`)

  return (
    <div>
      <Header title={`${nodes.length} selected`} onClose={onDeselectAll} />
      <p style={{ ...TYPE_SUMMARY_BODY, marginTop: SPACE_16 }}>{parts.join(' ')}</p>
      <p style={{ ...TYPE_TIMESTAMP, marginTop: SPACE_8 }}>Bulk actions are not wired to a destination yet.</p>
      <div className="flex flex-wrap" style={{ gap: SPACE_8, marginTop: SPACE_16 }}>
        {['Bulk Message', 'Bulk Assign', 'Export'].map((label) => (
          <button
            key={label}
            type="button"
            disabled
            title="Not yet wired to a destination"
            style={{
              ...TYPE_BUTTON,
              padding: `${SPACE_8}px ${SPACE_16}px`,
              borderRadius: RADIUS_BUTTON,
              border: `1px solid ${BORDER_MEDIUM}`,
              background: 'transparent',
              color: TEXT_PRIMARY,
              cursor: 'not-allowed',
              opacity: 0.6,
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
