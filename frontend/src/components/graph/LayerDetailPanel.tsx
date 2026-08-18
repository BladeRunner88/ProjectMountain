// 8.13.3: Strata's left-panel LAYER DETAIL state — the dense-card language
// Network's TargetDetailPanel already established (Header/DividerRow reused
// verbatim), extended with data that's genuinely aggregate rather than a
// single TracedValue. Layer-level stats (climber count, average readiness,
// prediction split, source health) are real client-side aggregations over
// real per-climber TracedValues (graph/strataPanelFields.ts) — but the
// AGGREGATE itself has no backend derivation to open, so these render as
// plain values, never a clickable Metric. Individual climber values stay
// clickable via the shared Climber Detail state (TargetDetailPanel) one
// level down.

import { useMemo, useState } from 'react'
import type { GraphNode } from '../../graph/adapter'
import { READABLE_READINESS, nearestAncestorOfType } from '../../graph/panelFields'
import type { StrataLayer } from '../../graph/strataLayout'
import { averageConfidencePct, averageReadinessWord, degradedSourceCount, predictionSplitForLayer, sourcesForLayer, worstStalenessMinutes } from '../../graph/strataPanelFields'
import { STATUS_COLOR } from '../../graph/nodeVisuals'
import { Header } from './DetailPanel'
import { ClimberLevelList, DrillList, groupNodesIntoDrillGroups, idOrNull } from './DrillNav'
import {
  ACCENT_AMBER,
  ACCENT_BLUE,
  ACCENT_GREEN,
  ACCENT_RED,
  BADGE_TEXT_COLOR,
  BG_PRIMARY,
  BG_SECONDARY,
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
  TYPE_BODY_ROW,
  TYPE_IDENTITY_NAME,
  TYPE_PANEL_SUBHEADING,
  TYPE_PROPERTY_VALUE,
  TYPE_SECTION_LABEL,
  TYPE_STAT_LABEL,
  TYPE_STAT_VALUE,
  TYPE_TAB_LABEL,
  TYPE_TIMESTAMP,
} from '../../graph/tokens'

const SOURCE_STATE_COLOR: Record<'healthy' | 'stable' | 'degraded' | 'critical', string> = {
  healthy: ACCENT_GREEN,
  stable: ACCENT_GREEN,
  degraded: ACCENT_AMBER,
  critical: ACCENT_RED,
}

type LayerTab = 'climbers' | 'predictions' | 'sources'

export function LayerDetailPanel({
  layer,
  fillColor,
  climbers,
  allNodes,
  onSelectClimber,
  onDeselectAll,
  onViewInNetwork,
  onViewInTerrain,
}: {
  layer: StrataLayer
  fillColor: string
  climbers: GraphNode[]
  allNodes: GraphNode[]
  onSelectClimber: (nodeId: string) => void
  onDeselectAll: () => void
  onViewInNetwork: () => void
  onViewInTerrain: () => void
}) {
  const [tab, setTab] = useState<LayerTab>('climbers')
  // Local, panel-scoped roster search — distinct from LeftPanel's own
  // top-level search box (which triggers a whole-graph SearchResultsView);
  // typing here only narrows this layer's own Climbers tab list.
  const [rosterSearch, setRosterSearch] = useState('')
  const avgReadiness = averageReadinessWord(climbers)
  const predictions = predictionSplitForLayer(climbers)
  const sources = sourcesForLayer(climbers, allNodes)
  const degraded = degradedSourceCount(sources)
  const worstStaleness = worstStalenessMinutes(climbers)
  const avgConfidence = averageConfidencePct(climbers)

  const filtered = climbers.filter((c) => {
    if (rosterSearch.trim()) {
      const q = rosterSearch.trim().toLowerCase()
      if (!c.label.toLowerCase().includes(q) && !(c.serial ?? '').toLowerCase().includes(q)) return false
    }
    return true
  })

  return (
    <div>
      <Header title="Layer Details" badgeText="LAYER" badgeColor={ACCENT_BLUE} onClose={onDeselectAll} />
      <LayerHeaderCard layer={layer} fillColor={fillColor} climbers={climbers} />

      <div className="flex items-center" style={{ borderBottom: `1px solid ${BORDER_LIGHT}`, marginBottom: PANEL_SECTION_GAP }}>
        <TabButton label="Climbers" active={tab === 'climbers'} onClick={() => setTab('climbers')} />
        <TabButton label="Predictions" active={tab === 'predictions'} onClick={() => setTab('predictions')} />
        <TabButton label="Sources" active={tab === 'sources'} onClick={() => setTab('sources')} />
        <span style={{ ...TYPE_TIMESTAMP, marginLeft: 'auto' }}>{climbers.length} CLIMBERS ANALYSED</span>
      </div>

      {tab === 'climbers' && <RosterSearchBox searchQuery={rosterSearch} onSearchChange={setRosterSearch} />}

      <div style={{ background: BG_PRIMARY, border: `1px solid ${BORDER_LIGHT}`, borderRadius: RADIUS_CARD, overflow: 'hidden', marginBottom: PANEL_SECTION_GAP }}>
        <div className="flex items-center justify-between" style={{ padding: SPACE_16 }}>
          <div className="flex items-center" style={{ gap: SPACE_8 }}>
            <span aria-hidden style={{ width: 28, height: 28, borderRadius: '50%', background: fillColor, border: `1px solid ${BORDER_MEDIUM}`, flexShrink: 0 }} />
            <p style={TYPE_IDENTITY_NAME}>{layer.name}</p>
          </div>
          <span style={{ ...TYPE_STAT_LABEL, color: readinessColor(avgReadiness), border: `1px solid ${readinessColor(avgReadiness)}`, borderRadius: RADIUS_BADGE, padding: `2px ${SPACE_8}px`, textTransform: 'uppercase' }}>
            {avgReadiness}
          </span>
        </div>

        <StatGrid
          columns={4}
          items={[
            { label: 'Climbers', value: String(climbers.length) },
            { label: 'Avg Readiness', value: avgReadiness },
            { label: 'Predictions Active', value: String(predictions.total) },
            { label: 'Sources Reporting', value: String(sources.length) },
          ]}
        />
        <StatGrid
          columns={3}
          items={[
            { label: 'Degraded Sources', value: String(degraded) },
            { label: 'Worst Staleness', value: worstStaleness !== null ? `${worstStaleness}m` : 'Not tracked' },
            { label: 'Avg Confidence', value: avgConfidence !== null ? `${avgConfidence}%` : 'Not tracked' },
          ]}
        />

        {tab === 'climbers' && <ClimberDrill climbers={filtered} allNodes={allNodes} onSelectClimber={onSelectClimber} />}
        {tab === 'predictions' && <PredictionsSection climbers={climbers} predictions={predictions} onSelectClimber={onSelectClimber} />}
        {tab === 'sources' && <SourcesSection sources={sources} />}

        <div style={{ padding: SPACE_16, borderTop: `1px solid ${BORDER_LIGHT}` }}>
          <p style={{ ...TYPE_SECTION_LABEL, textTransform: 'uppercase', marginBottom: SPACE_8 }}>Actions</p>
          <div className="flex flex-wrap" style={{ gap: SPACE_8 }}>
            <button type="button" onClick={onViewInNetwork} style={actionButtonStyle(true)}>
              View in Network
            </button>
            <button type="button" onClick={onViewInTerrain} style={actionButtonStyle(false)}>
              View in Terrain
            </button>
          </div>
        </div>

        <div style={{ padding: `${SPACE_8}px ${SPACE_16}px`, background: BG_SECONDARY }}>
          <span style={{ ...TYPE_TIMESTAMP }}>LIVE (updated just now)</span>
        </div>
      </div>
    </div>
  )
}

function actionButtonStyle(primary: boolean): React.CSSProperties {
  return {
    ...TYPE_BODY_ROW,
    padding: `${SPACE_8}px ${SPACE_16}px`,
    borderRadius: RADIUS_BUTTON,
    border: `1px solid ${primary ? ACCENT_BLUE : BORDER_MEDIUM}`,
    background: primary ? ACCENT_BLUE : 'transparent',
    color: primary ? BADGE_TEXT_COLOR : TEXT_PRIMARY,
    cursor: 'pointer',
  }
}

function readinessColor(word: string): string {
  const status = Object.entries(READABLE_READINESS).find(([, v]) => v === word)?.[0]
  return status ? STATUS_COLOR[status as keyof typeof STATUS_COLOR] : TEXT_TERTIARY
}

// The climber roster itself lives ONLY in the Climbers tab's ClimberDrill
// below — this card used to carry its own second, collapsible copy of the
// same list ("double... layers"), which is exactly the redundancy this
// panel is meant to avoid. Identity + real aggregate stats only.
function LayerHeaderCard({ layer, fillColor, climbers }: { layer: StrataLayer; fillColor: string; climbers: GraphNode[] }) {
  const ceilingLabel = layer.isOpenEnded ? `${layer.floorM.toLocaleString()}m+` : `${layer.floorM.toLocaleString()}m — ${layer.ceilingM.toLocaleString()}m`

  return (
    <div style={{ position: 'relative', background: BG_TERTIARY, border: `1px solid ${BORDER_LIGHT}`, borderRadius: RADIUS_CARD, padding: SPACE_16, marginBottom: PANEL_SECTION_GAP }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center" style={{ gap: SPACE_8 }}>
          <span aria-hidden style={{ width: 36, height: 36, borderRadius: '50%', background: fillColor, border: `1px solid ${BORDER_MEDIUM}`, flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <p style={TYPE_IDENTITY_NAME}>{layer.name}</p>
            <p style={TYPE_PANEL_SUBHEADING}>
              {ceilingLabel} ・ {climbers.length} climber{climbers.length === 1 ? '' : 's'}
            </p>
          </div>
        </div>
        <span style={{ ...TYPE_STAT_LABEL, color: TEXT_TERTIARY, border: `1px solid ${BORDER_MEDIUM}`, borderRadius: RADIUS_BADGE, padding: `2px ${SPACE_8}px`, textTransform: 'uppercase', flexShrink: 0 }}>
          Layer
        </span>
      </div>
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

// Search only — the status pills live in exactly one place, the left
// panel's persistent top-level Quick Filters (same state, same canvas
// dimming); this used to render a second copy of those same six pills
// directly below it, which is the "double pills" this panel now avoids.
function RosterSearchBox({ searchQuery, onSearchChange }: { searchQuery: string; onSearchChange: (v: string) => void }) {
  return (
    <div style={{ marginBottom: PANEL_SECTION_GAP }}>
      <input
        type="text"
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Search climbers in this layer…"
        className="graph-search-input"
        style={{ ...TYPE_BODY_ROW, width: '100%', height: 32, padding: `0 ${SPACE_8}px`, border: `1px solid ${BORDER_MEDIUM}`, borderRadius: RADIUS_BUTTON, background: BG_PRIMARY }}
      />
    </div>
  )
}

function StatGrid({ columns, items }: { columns: number; items: { label: string; value: string }[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, borderTop: `1px solid ${BORDER_LIGHT}` }}>
      {items.map((item, i) => (
        <div key={item.label} style={{ padding: SPACE_8, borderRight: (i + 1) % columns === 0 ? 'none' : `1px solid ${BORDER_LIGHT}`, textAlign: 'center' }}>
          <p style={{ ...TYPE_STAT_LABEL, textTransform: 'uppercase', marginBottom: 4 }}>{item.label}</p>
          <p style={columns === 4 ? TYPE_STAT_VALUE : TYPE_PROPERTY_VALUE}>{item.value}</p>
        </div>
      ))}
    </div>
  )
}

// 8.13-ui: region -> route -> expedition -> climbers. Walks the SAME real
// country->route->operator->climber chain every other panel resolves
// ancestors through (panelFields.ts's nearestAncestorOfType) — never a
// fabricated grouping. A climber whose chain doesn't resolve at some level
// (shouldn't happen given the adapter's fixed structure, but not assumed)
// lands in an honest "Unresolved" bucket rather than being silently
// dropped. `undefined` in DrillPath means "not chosen yet" (show this
// level's list); `null` means "the Unresolved bucket was chosen" — the two
// have to stay distinguishable or picking Unresolved would look identical
// to not having drilled down at all.
type DrillPath = {
  region?: GraphNode | null
  route?: GraphNode | null
  expedition?: GraphNode | null
}

interface AnnotatedClimber {
  climber: GraphNode
  region: GraphNode | null
  route: GraphNode | null
  expedition: GraphNode | null
}

function ClimberDrill({ climbers, allNodes, onSelectClimber }: { climbers: GraphNode[]; allNodes: GraphNode[]; onSelectClimber: (id: string) => void }) {
  const nodeById = useMemo(() => new Map(allNodes.map((n) => [n.id, n])), [allNodes])
  const annotated = useMemo<AnnotatedClimber[]>(
    () =>
      climbers.map((climber) => ({
        climber,
        region: nearestAncestorOfType(climber, 'country', nodeById),
        route: nearestAncestorOfType(climber, 'route', nodeById),
        expedition: nearestAncestorOfType(climber, 'operator', nodeById),
      })),
    [climbers, nodeById],
  )
  const [path, setPath] = useState<DrillPath>({})

  if (annotated.length === 0) {
    return (
      <div style={{ padding: SPACE_16, borderTop: `1px solid ${BORDER_LIGHT}` }}>
        <p style={TYPE_TIMESTAMP}>No climbers match the current search/filter.</p>
      </div>
    )
  }

  if (path.region === undefined) {
    const { groups, nodeByKey } = groupNodesIntoDrillGroups(annotated, (a) => a.region)
    return <DrillList levelLabel="Region" trail={[]} groups={groups} onBack={null} onSelect={(key) => setPath({ region: nodeByKey.get(key) ?? null })} />
  }
  const inRegion = annotated.filter((a) => idOrNull(a.region) === idOrNull(path.region))

  if (path.route === undefined) {
    const { groups, nodeByKey } = groupNodesIntoDrillGroups(inRegion, (a) => a.route)
    return (
      <DrillList
        levelLabel="Route"
        trail={[path.region?.label ?? 'Unresolved region']}
        groups={groups}
        onBack={() => setPath({})}
        onSelect={(key) => setPath({ region: path.region, route: nodeByKey.get(key) ?? null })}
      />
    )
  }
  const inRoute = inRegion.filter((a) => idOrNull(a.route) === idOrNull(path.route))

  if (path.expedition === undefined) {
    const { groups, nodeByKey } = groupNodesIntoDrillGroups(inRoute, (a) => a.expedition)
    return (
      <DrillList
        levelLabel="Expedition"
        trail={[path.region?.label ?? 'Unresolved region', path.route?.label ?? 'Unresolved route']}
        groups={groups}
        onBack={() => setPath({ region: path.region })}
        onSelect={(key) => setPath({ region: path.region, route: path.route, expedition: nodeByKey.get(key) ?? null })}
      />
    )
  }
  const inExpedition = inRoute.filter((a) => idOrNull(a.expedition) === idOrNull(path.expedition))

  return (
    <ClimberLevelList
      trail={[path.region?.label ?? 'Unresolved region', path.route?.label ?? 'Unresolved route', path.expedition?.label ?? 'Unresolved expedition']}
      climbers={inExpedition.map((a) => a.climber)}
      onBack={() => setPath({ region: path.region, route: path.route })}
      onSelectClimber={onSelectClimber}
    />
  )
}

function PredictionsSection({ climbers, predictions, onSelectClimber }: { climbers: GraphNode[]; predictions: ReturnType<typeof predictionSplitForLayer>; onSelectClimber: (id: string) => void }) {
  const outcomes: { key: keyof typeof predictions.byOutcome; label: string }[] = [
    { key: 'requires-descent', label: 'Requires descent' },
    { key: 'requires-review', label: 'Requires review' },
    { key: 'watch', label: 'Watch' },
    { key: 'ready', label: 'Ready' },
  ]
  return (
    <div style={{ padding: SPACE_16, borderTop: `1px solid ${BORDER_LIGHT}` }}>
      <div className="flex items-center" style={{ gap: SPACE_8, marginBottom: SPACE_8 }}>
        <p style={{ ...TYPE_SECTION_LABEL, textTransform: 'uppercase' }}>Predictions ({predictions.total})</p>
        {predictions.byOutcome['requires-descent'] > 0 && (
          <span style={{ ...TYPE_STAT_LABEL, color: ACCENT_AMBER, border: `1px solid ${ACCENT_AMBER}`, borderRadius: RADIUS_BADGE, padding: `1px ${SPACE_8}px` }}>
            {predictions.byOutcome['requires-descent']} DESCENT
          </span>
        )}
      </div>
      {predictions.total === 0 ? (
        <p style={TYPE_TIMESTAMP}>No real predictions on record for this layer.</p>
      ) : (
        outcomes
          .filter((o) => predictions.byOutcome[o.key] > 0)
          .map((o) => {
            const rows = climbers.filter((c) => c.predictedOutcome === o.key)
            return <OutcomeRow key={o.key} label={o.label} climbers={rows} onSelectClimber={onSelectClimber} />
          })
      )}
    </div>
  )
}

function OutcomeRow({ label, climbers, onSelectClimber }: { label: string; climbers: GraphNode[]; onSelectClimber: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ borderBottom: `1px solid ${BORDER_LIGHT}`, padding: `${SPACE_8}px 0` }}>
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex items-center justify-between" style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
        <span style={{ ...TYPE_PROPERTY_VALUE, display: 'flex', alignItems: 'center', gap: SPACE_8 / 2 }}>
          <span aria-hidden>{open ? '▾' : '▸'}</span> {label}
        </span>
        <span style={TYPE_TIMESTAMP}>{climbers.length}</span>
      </button>
      {open && (
        <div style={{ marginTop: SPACE_8, paddingLeft: 18 }}>
          {climbers.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelectClimber(c.id)}
              style={{ ...TYPE_PROPERTY_VALUE, display: 'block', width: '100%', textAlign: 'left', color: ACCENT_BLUE, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0', textDecoration: 'underline' }}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function SourcesSection({ sources }: { sources: ReturnType<typeof sourcesForLayer> }) {
  if (sources.length === 0) {
    return (
      <div style={{ padding: SPACE_16, borderTop: `1px solid ${BORDER_LIGHT}` }}>
        <p style={TYPE_TIMESTAMP}>No real sources contributing to this layer's climbers.</p>
      </div>
    )
  }
  return (
    <div style={{ padding: SPACE_16, borderTop: `1px solid ${BORDER_LIGHT}` }}>
      <p style={{ ...TYPE_SECTION_LABEL, textTransform: 'uppercase', marginBottom: SPACE_8 }}>Sources ({sources.length})</p>
      {sources.map((s) => (
        <div key={s.id} className="flex items-center justify-between" style={{ padding: `${SPACE_8}px 0`, borderBottom: `1px solid ${BORDER_LIGHT}` }}>
          <span className="flex items-center" style={{ gap: SPACE_8 }}>
            <span aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', background: s.state ? SOURCE_STATE_COLOR[s.state] : TEXT_TERTIARY, flexShrink: 0 }} />
            <span style={TYPE_PROPERTY_VALUE}>{s.label}</span>
          </span>
          <span style={TYPE_TIMESTAMP}>{s.state ?? 'not tracked'}</span>
        </div>
      ))}
    </div>
  )
}
