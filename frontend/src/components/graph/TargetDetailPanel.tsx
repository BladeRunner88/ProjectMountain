// 8.13-ui: the redesign spec's "Target Detail View" — a header card
// (icon + identity + collapsible Position), a Properties/Connections tab
// bar, and a dense stat-grid "Asset Card" underneath. Every value here
// traces to a real function in panelFields.ts; nothing is invented. Where
// the spec named a military concept with no real Isildur equivalent
// (munitions, aimpoints, aircraft, mission tasking), the mapping is:
//   munitions summary line  → generateSummary() (already a real sentence)
//   4-col primary stat grid → the curated `kind:'metric'` rows (real TracedValues)
//   3-col secondary grid    → the curated `kind:'text'` rows (honest gaps included)
//   "Aimpoints"             → positionRowsFor() (real camp/position/GPS-fix-age, climbers only)
//   "MISSION & TASKS"       → node.drivers (real prediction drivers, relabeled DRIVERS)
//   "AIRCRAFT"               → connectionRowsFor() (real Parent/Route/Rope/Sources rows)
//   "LIVE (updated Ns ago)" → dropped in favour of the real Created timestamp already shown

import { useState } from 'react'
import type { GraphEdge, GraphNode } from '../../graph/adapter'
import { Metric } from '../../ase/Metric'
import { baseColorFor, STATUS_COLOR } from '../../graph/nodeVisuals'
import {
  connectionCount,
  connectionRowsFor,
  countDescendantsByType,
  curatedPropertyRowsWithConsumedKeys,
  ENTITY_TYPE_LABEL,
  extraPropertyRows,
  generateSummary,
  labelsFor,
  positionRowsFor,
  READABLE_READINESS,
  type ConnectionRowSpec,
  type LabelSpec,
  type PropertyRowSpec,
} from '../../graph/panelFields'
import {
  ACCENT_BLUE,
  ACCENT_ORANGE,
  BADGE_TEXT_COLOR,
  BG_PRIMARY,
  BG_TERTIARY,
  BORDER_LIGHT,
  BORDER_MEDIUM,
  PANEL_SECTION_GAP,
  RADIUS_BADGE,
  RADIUS_BUTTON,
  RADIUS_CARD,
  SPACE_8,
  SPACE_16,
  TEXT_PRIMARY,
  TEXT_TERTIARY,
  TYPE_BUTTON,
  TYPE_IDENTITY_NAME,
  TYPE_PANEL_SUBHEADING,
  TYPE_PILL,
  TYPE_PROPERTY_LABEL,
  TYPE_PROPERTY_VALUE,
  TYPE_SECTION_LABEL,
  TYPE_STAT_LABEL,
  TYPE_STAT_VALUE,
  TYPE_SUMMARY_BODY,
  TYPE_TAB_LABEL,
  TYPE_TIMESTAMP,
} from '../../graph/tokens'
import { Header, DividerRow } from './DetailPanel'

export function TargetDetailPanel({
  node,
  allNodes,
  allEdges,
  onSelectNode,
  onDeselectAll,
}: {
  node: GraphNode
  allNodes: GraphNode[]
  allEdges: GraphEdge[]
  onSelectNode: (nodeId: string) => void
  onDeselectAll: () => void
}) {
  const [tab, setTab] = useState<'properties' | 'connections'>('properties')
  const { rows: propertyRows, consumedKeys } = curatedPropertyRowsWithConsumedKeys(node, allNodes, allEdges)
  const extraRows = extraPropertyRows(node, consumedKeys)
  const connectionRows = connectionRowsFor(node, allNodes, allEdges)
  const nConnections = connectionCount(connectionRows)

  return (
    <div>
      <Header title="Node Details" badgeText={ENTITY_TYPE_LABEL[node.type]} badgeColor={baseColorFor(node)} onClose={onDeselectAll} />
      <TargetHeaderCard node={node} allNodes={allNodes} />
      <TabBar tab={tab} onTabChange={setTab} propertiesCount={propertyRows.length + extraRows.length} connectionsCount={nConnections} />
      {tab === 'properties' ? (
        <AssetCard node={node} allNodes={allNodes} propertyRows={propertyRows} extraRows={extraRows} />
      ) : (
        <ConnectionsList rows={connectionRows} onSelectNode={onSelectNode} />
      )}
    </div>
  )
}

// -- header card --------------------------------------------------------------

function subtitleFor(node: GraphNode, allNodes: GraphNode[]): string {
  switch (node.type) {
    case 'climber':
      return node.role ? `Climber · ${node.role}` : 'Climber'
    case 'country': {
      const routes = countDescendantsByType(node.id, 'route', allNodes)
      return `Country · ${routes} route${routes === 1 ? '' : 's'}`
    }
    case 'route':
    case 'operator': {
      const climbers = countDescendantsByType(node.id, 'climber', allNodes)
      return `${ENTITY_TYPE_LABEL[node.type]} · ${climbers} climber${climbers === 1 ? '' : 's'}`
    }
    case 'source':
      return node.sourceCategory ? `Source · ${node.sourceCategory}` : 'Source'
  }
}

function TargetHeaderCard({ node, allNodes }: { node: GraphNode; allNodes: GraphNode[] }) {
  const [copied, setCopied] = useState(false)
  const [positionOpen, setPositionOpen] = useState(false)
  const positionRows = positionRowsFor(node)

  function copySerial() {
    if (!node.serial) return
    navigator.clipboard?.writeText(node.serial).catch(() => {})
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div style={{ position: 'relative', background: BG_TERTIARY, border: `1px solid ${BORDER_LIGHT}`, borderRadius: RADIUS_CARD, padding: SPACE_16, marginBottom: PANEL_SECTION_GAP }}>
      <div className="flex items-center" style={{ gap: SPACE_8 }}>
        <span
          aria-hidden
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: baseColorFor(node),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: BADGE_TEXT_COLOR,
            flexShrink: 0,
          }}
        >
          <span style={{ ...TYPE_TAB_LABEL, textTransform: 'uppercase', color: BADGE_TEXT_COLOR }}>{node.label.charAt(0)}</span>
        </span>
        <div style={{ minWidth: 0 }}>
          <p style={TYPE_IDENTITY_NAME}>{node.label}</p>
          <p style={TYPE_PANEL_SUBHEADING}>{subtitleFor(node, allNodes)}</p>
        </div>
      </div>

      {node.type === 'climber' && (
        <div style={{ marginTop: SPACE_16 }}>
          <button
            type="button"
            onClick={() => setPositionOpen((v) => !v)}
            style={{ ...TYPE_TAB_LABEL, textTransform: 'none', color: TEXT_PRIMARY, background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: SPACE_8 / 2 }}
          >
            <span aria-hidden>{positionOpen ? '▾' : '▸'}</span> Position
          </button>
          {positionOpen && (
            <div style={{ marginTop: SPACE_8, paddingLeft: SPACE_16 }}>
              {positionRows.map((row) => (
                <PropertyRowView key={row.key} row={row} />
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex items-center" style={{ gap: SPACE_8, marginTop: SPACE_16 }}>
        <span style={TYPE_PROPERTY_LABEL}>{node.serial ?? 'No serial on record'}</span>
        {node.serial && (
          <button
            type="button"
            onClick={copySerial}
            style={{ ...TYPE_PROPERTY_LABEL, background: 'none', border: `1px solid ${BORDER_MEDIUM}`, borderRadius: RADIUS_BUTTON, cursor: 'pointer', padding: `1px ${SPACE_8}px` }}
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        )}
      </div>
      <p style={{ ...TYPE_TIMESTAMP, marginTop: SPACE_8 / 2 }}>Created {new Date(node.createdAt).toLocaleString()}</p>
    </div>
  )
}

function PropertyRowView({ row }: { row: PropertyRowSpec }) {
  return (
    <DividerRow label={row.label}>
      {row.kind === 'metric' && row.traced ? <Metric traced={row.traced} label={row.label} /> : <span style={TYPE_PROPERTY_VALUE}>{row.value}</span>}
      {row.note && <span style={{ ...TYPE_TIMESTAMP, display: 'block', marginTop: 2 }}>{row.note}</span>}
    </DividerRow>
  )
}

// -- tab bar --------------------------------------------------------------

function TabBar({
  tab,
  onTabChange,
  propertiesCount,
  connectionsCount,
}: {
  tab: 'properties' | 'connections'
  onTabChange: (tab: 'properties' | 'connections') => void
  propertiesCount: number
  connectionsCount: number
}) {
  return (
    <div className="flex items-center" style={{ borderBottom: `1px solid ${BORDER_LIGHT}`, marginBottom: PANEL_SECTION_GAP }}>
      <TabButton label="Properties" active={tab === 'properties'} onClick={() => onTabChange('properties')} />
      <TabButton label="Connections" active={tab === 'connections'} onClick={() => onTabChange('connections')} />
      <span style={{ ...TYPE_TIMESTAMP, marginLeft: 'auto' }}>{tab === 'properties' ? `${propertiesCount} PROPERTIES` : `${connectionsCount} CONNECTIONS`}</span>
    </div>
  )
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...TYPE_TAB_LABEL,
        textTransform: 'uppercase',
        padding: `${SPACE_8}px ${SPACE_16}px`,
        color: active ? TEXT_PRIMARY : TEXT_TERTIARY,
        background: 'none',
        border: 'none',
        borderBottom: active ? `2px solid ${ACCENT_BLUE}` : '2px solid transparent',
        marginBottom: -1,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  )
}

// -- the dense "Asset Card" (Properties tab) ---------------------------------

function AssetCard({
  node,
  allNodes,
  propertyRows,
  extraRows,
}: {
  node: GraphNode
  allNodes: GraphNode[]
  propertyRows: PropertyRowSpec[]
  extraRows: PropertyRowSpec[]
}) {
  const [showAll, setShowAll] = useState(false)
  const metricRows = propertyRows.filter((r) => r.kind === 'metric')
  const textRows = propertyRows.filter((r) => r.kind === 'text')
  const labels = labelsFor(node, allNodes)

  return (
    <div style={{ background: BG_PRIMARY, border: `1px solid ${BORDER_LIGHT}`, borderRadius: RADIUS_CARD, overflow: 'hidden', marginBottom: PANEL_SECTION_GAP }}>
      <div style={{ padding: SPACE_16 }}>
        <ReadinessPill node={node} />
        <p style={{ ...TYPE_SUMMARY_BODY, marginTop: SPACE_8 }}>{generateSummary(node, allNodes)}</p>
      </div>

      {metricRows.length > 0 && <StatGrid rows={metricRows} primary />}
      {textRows.length > 0 && <StatGrid rows={textRows} />}

      {extraRows.length > 0 && (
        <div style={{ padding: `${SPACE_8}px ${SPACE_16}px`, borderTop: `1px solid ${BORDER_LIGHT}` }}>
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            style={{ ...TYPE_PROPERTY_LABEL, color: ACCENT_BLUE, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            {showAll ? 'Hide extra properties' : `+ Show all properties (${extraRows.length} more)`}
          </button>
          {showAll && (
            <div style={{ marginTop: SPACE_8 }}>
              {extraRows.map((row) => (
                <PropertyRowView key={row.key} row={row} />
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ padding: SPACE_16, borderTop: `1px solid ${BORDER_LIGHT}` }}>
        <p style={{ ...TYPE_SECTION_LABEL, textTransform: 'uppercase' }}>Labels</p>
        <div className="flex flex-wrap" style={{ gap: SPACE_8, marginTop: SPACE_8 }}>
          {labels.map((label) => (
            <LabelPill key={label.key} label={label} node={node} />
          ))}
        </div>
      </div>

      <DriversSection node={node} />
      <ActionsSection />
    </div>
  )
}

function ReadinessPill({ node }: { node: GraphNode }) {
  return (
    <span
      style={{
        ...TYPE_PILL,
        color: node.status ? STATUS_COLOR[node.status] : TEXT_TERTIARY,
        border: `1px solid ${node.status ? STATUS_COLOR[node.status] : BORDER_MEDIUM}`,
        borderRadius: RADIUS_BADGE,
        padding: `2px ${SPACE_8}px`,
      }}
    >
      {node.status ? READABLE_READINESS[node.status] : 'Unassessed'}
    </span>
  )
}

function StatGrid({ rows, primary }: { rows: PropertyRowSpec[]; primary?: boolean }) {
  const columns = Math.min(primary ? 4 : 3, rows.length)
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, borderTop: `1px solid ${BORDER_LIGHT}` }}>
      {rows.map((row, i) => (
        <div key={row.key} style={{ padding: SPACE_8, borderRight: (i + 1) % columns === 0 ? 'none' : `1px solid ${BORDER_LIGHT}`, textAlign: 'center' }}>
          <p style={{ ...TYPE_STAT_LABEL, textTransform: 'uppercase', marginBottom: 4 }}>{row.label}</p>
          {row.kind === 'metric' && row.traced ? <Metric traced={row.traced} label={row.label} /> : <p style={primary ? TYPE_STAT_VALUE : TYPE_PROPERTY_VALUE}>{row.value}</p>}
        </div>
      ))}
    </div>
  )
}

function LabelPill({ label, node }: { label: LabelSpec; node: GraphNode }) {
  const style = (() => {
    switch (label.kind) {
      case 'entityType':
        return { background: BG_TERTIARY, color: TEXT_PRIMARY, border: 'none' }
      case 'status':
        return { background: node.status ? STATUS_COLOR[node.status] : BG_TERTIARY, color: BADGE_TEXT_COLOR, border: 'none' }
      case 'risk':
        return { background: 'transparent', color: ACCENT_ORANGE, border: `1px solid ${ACCENT_ORANGE}` }
      case 'source':
        return { background: 'transparent', color: ACCENT_BLUE, border: `1px solid ${ACCENT_BLUE}` }
    }
  })()
  return <span style={{ ...TYPE_PILL, ...style, borderRadius: RADIUS_BADGE, padding: `2px ${SPACE_8}px` }}>{label.text}</span>
}

// -- DRIVERS (spec's "MISSION & TASKS", mapped onto real prediction drivers) --

function DriversSection({ node }: { node: GraphNode }) {
  return (
    <div style={{ padding: SPACE_16, borderTop: `1px solid ${BORDER_LIGHT}` }}>
      <p style={{ ...TYPE_SECTION_LABEL, textTransform: 'uppercase' }}>Drivers{node.drivers ? ` (${node.drivers.length})` : ''}</p>
      {node.type === 'climber' && <p style={{ ...TYPE_TIMESTAMP, marginTop: SPACE_8 }}>Inferred from observable behaviour, not brain activity.</p>}
      {node.drivers && node.drivers.length > 0 ? (
        <div style={{ marginTop: SPACE_8 }}>
          {node.drivers.map((d) => (
            <div key={d.id} style={{ padding: `${SPACE_8}px 0`, borderBottom: `1px solid ${BORDER_LIGHT}` }}>
              <div className="flex items-center justify-between">
                <span style={TYPE_PROPERTY_VALUE}>{d.label}</span>
                <span style={{ ...TYPE_PROPERTY_VALUE, fontWeight: 600 }}>+{d.contributionPct}%</span>
              </div>
              <p style={{ ...TYPE_TIMESTAMP, marginTop: 2 }}>
                {d.evidence}
                {d.heldOf && ` (held in ${d.heldOf.holds} of ${d.heldOf.total} similar cases)`}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p style={{ ...TYPE_TIMESTAMP, marginTop: SPACE_8 }}>No traceable drivers on record{node.type === 'climber' ? ' for this climber.' : '.'}</p>
      )}
    </div>
  )
}

// -- ACTIONS -------------------------------------------------------------

const ACTIONS = ['View Profile', 'View Cascade', 'View Forecast', 'Message', 'Assign', 'Raise Queue Item'] as const

function ActionsSection() {
  return (
    <div style={{ padding: SPACE_16, borderTop: `1px solid ${BORDER_LIGHT}` }}>
      <p style={{ ...TYPE_SECTION_LABEL, textTransform: 'uppercase' }}>Actions</p>
      <p style={{ ...TYPE_TIMESTAMP, marginTop: SPACE_8 }}>Not wired to a destination yet — no Profile/Cascade/Forecast page exists for the graph to open.</p>
      <div className="flex flex-wrap" style={{ gap: SPACE_8, marginTop: SPACE_8 }}>
        {ACTIONS.map((label, i) => (
          <button
            key={label}
            type="button"
            disabled
            title="Not yet wired to a destination"
            style={{
              ...TYPE_BUTTON,
              padding: `${SPACE_8}px ${SPACE_16}px`,
              borderRadius: RADIUS_BUTTON,
              border: `1px solid ${i === 0 ? ACCENT_BLUE : BORDER_MEDIUM}`,
              background: i === 0 ? ACCENT_BLUE : 'transparent',
              color: i === 0 ? BADGE_TEXT_COLOR : TEXT_PRIMARY,
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

// -- Connections tab -------------------------------------------------------

function ConnectionsList({ rows, onSelectNode }: { rows: ConnectionRowSpec[]; onSelectNode: (nodeId: string) => void }) {
  return (
    <div style={{ background: BG_PRIMARY, border: `1px solid ${BORDER_LIGHT}`, borderRadius: RADIUS_CARD, padding: SPACE_16 }}>
      {rows.map((row) => (
        <DividerRow key={row.key} label={row.label}>
          {row.targetNodeId ? (
            <button
              type="button"
              onClick={() => onSelectNode(row.targetNodeId!)}
              style={{ ...TYPE_PROPERTY_VALUE, color: ACCENT_BLUE, background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
            >
              {row.value}
            </button>
          ) : (
            <span style={TYPE_PROPERTY_VALUE}>{row.value}</span>
          )}
        </DividerRow>
      ))}
    </div>
  )
}
