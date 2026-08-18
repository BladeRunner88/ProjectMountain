// 8.13-ui: the left panel's 0-selected state — spec's "Global Dashboard."
// Never an empty state (the spec's own anti-pattern rule): always shows
// real network stats and a real recent-activity feed. Every number here is
// the same real computation the old DetailPanel's EmptyState already used
// (climber count, active-prediction count, average tracked source health)
// — just relabeled to the spec's "Parent Cells / Child Cells" mitosis
// vocabulary where a real 1:1 mapping exists, and kept as plain real
// Isildur terms ("Active Predictions") where forcing the metaphor would
// obscure what the number actually is.
//
// Quick Filters live in LeftPanel.tsx instead, NOT here — by-tier/by-
// country need an active selection to have a reference (see
// searchAndFilter.ts's resolveFilterReferenceId), so the filter pills must
// stay reachable even once something's selected, not disappear the moment
// this dashboard unmounts.

import { useEffect, useMemo, useState } from 'react'
import type { GraphNode } from '../../graph/adapter'
import { ACCENT_AMBER, ACCENT_BLUE, ACCENT_GREEN, ACCENT_RED, BORDER_LIGHT, SPACE_8, SPACE_16, TEXT_SECONDARY, TEXT_TERTIARY, TYPE_BODY_ROW, TYPE_SECTION_LABEL, TYPE_STAT_VALUE } from '../../graph/tokens'
import type { LiveGraphEventKind } from '../../graph/liveGraphState'
import type { ViewMode } from '../../graph/types'
import { nearestAncestorOfType } from '../../graph/panelFields'
import { ClimberLevelList, DrillList, groupNodesIntoDrillGroups, idOrNull, type DrillGroup } from './DrillNav'

export interface ActivityEntry {
  id: string
  kind: LiveGraphEventKind
  nodeId: string
  at: number
}

const ACTIVITY_VERB: Record<LiveGraphEventKind, string> = {
  added: 'appeared',
  touched: 'updated',
  statusChanged: 'changed status',
  removed: 'was removed',
}

function relativeTime(at: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - at) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  return `${hours}h ago`
}

/** Normal/warning/danger for one activity row — real severity, not the event KIND (an "update" is only alarming if what it updated actually is). A climber's real readiness status and a source's real health state are the two tiers this dataset has; anything else (a route/operator/country touch, or a node that's already gone) has no severity concept of its own and reads as informational. */
function activityTierColor(node: GraphNode | undefined): string {
  if (node?.type === 'climber') {
    switch (node.status) {
      case 'WATCH':
        return ACCENT_AMBER
      case 'IMPAIRED':
      case 'REQUIRES_DESCENT':
        return ACCENT_RED
      default:
        return ACCENT_BLUE
    }
  }
  if (node?.type === 'source' && node.sourceHealth) {
    switch (node.sourceHealth.state) {
      case 'degraded':
        return ACCENT_AMBER
      case 'critical':
        return ACCENT_RED
      default:
        return ACCENT_BLUE
    }
  }
  return ACCENT_BLUE
}

export function GlobalDashboard({
  allNodes,
  recentActivity,
  viewMode = 'network',
  onSelectClimber,
  selectedCountryId = null,
  onSelectCountryId,
}: {
  allNodes: GraphNode[]
  recentActivity: ActivityEntry[]
  viewMode?: ViewMode
  /** Only exercised by the Strata branch's country/status/climber browser below — Network's own dashboard has no drill-through of its own. */
  onSelectClimber?: (id: string) => void
  /** 8.13-ui: lifted (not local drill state) — StrataCanvas.tsx needs this SAME real country id to decide what the right-hand tree renders, "select Nepal on the left, only Nepal shows on the right." */
  selectedCountryId?: string | null
  onSelectCountryId?: (id: string | null) => void
}) {
  const parentTierCount = allNodes.filter((n) => n.tier === 'root' || n.tier === 'parent').length
  const climberCount = allNodes.filter((n) => n.type === 'climber').length
  const activePredictions = allNodes.filter((n) => n.type === 'climber' && n.drivers && n.drivers.length > 0).length
  const trackedSources = allNodes.filter((n) => n.type === 'source' && n.sourceHealth)
  const avgHealth =
    trackedSources.length > 0 ? Math.round(trackedSources.reduce((sum, n) => sum + (n.sourceHealth?.healthPct ?? 0), 0) / trackedSources.length) : null
  const nodeById = new Map(allNodes.map((n) => [n.id, n]))
  const now = Date.now()

  return (
    <div>
      {viewMode === 'strata' ? (
        <>
          <SectionHeader>Strata Overview</SectionHeader>
          <LiveIndicator trackedSources={trackedSources} />
          <StrataCountryDrill
            allNodes={allNodes}
            onSelectClimber={onSelectClimber ?? (() => {})}
            selectedCountryId={selectedCountryId}
            onSelectCountryId={onSelectCountryId ?? (() => {})}
          />
        </>
      ) : (
        <>
          <SectionHeader>Network Overview</SectionHeader>
          <StatRow label="Total Parent Cells" value={String(parentTierCount)} />
          <StatRow label="Total Child Cells" value={String(climberCount)} />
          <StatRow label="Active Predictions" value={String(activePredictions)} />
          <StatRow label="Source Health" value={avgHealth !== null ? `${avgHealth}% avg` : 'Not tracked'} />
        </>
      )}

      <SectionHeader>Recent Activity</SectionHeader>
      {recentActivity.length === 0 ? (
        <p style={{ ...TYPE_BODY_ROW, color: TEXT_TERTIARY, padding: `${SPACE_8}px ${SPACE_16}px` }}>No recent activity.</p>
      ) : (
        <div style={{ padding: `${SPACE_8}px ${SPACE_16}px`, display: 'flex', flexDirection: 'column', gap: SPACE_8 }}>
          {recentActivity.map((entry) => {
            const node = nodeById.get(entry.nodeId)
            return (
              <div key={entry.id} className="flex items-start" style={{ gap: SPACE_8 }}>
                <span aria-hidden style={{ width: 5, height: 5, borderRadius: '50%', background: activityTierColor(node), marginTop: 6, flexShrink: 0 }} />
                <span style={TYPE_BODY_ROW}>
                  {node ? node.label : entry.nodeId} {ACTIVITY_VERB[entry.kind]}
                  <span style={{ color: TEXT_TERTIARY }}> · {relativeTime(entry.at, now)}</span>
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function SectionHeader({ children }: { children: string }) {
  return (
    <p
      style={{
        ...TYPE_SECTION_LABEL,
        textTransform: 'uppercase',
        padding: `${SPACE_16}px ${SPACE_16}px ${SPACE_8}px`,
        borderBottom: `1px solid ${BORDER_LIGHT}`,
        marginTop: 0,
      }}
    >
      {children}
    </p>
  )
}

/** "The indicator displaced from the old bottom bar" — pulsing dot, real: green only when every tracked source's real health state is healthy/stable, amber the moment any is degraded/critical. "Updated Ns ago" reports the freshest real lastSyncAgeSec among tracked sources. */
function LiveIndicator({ trackedSources }: { trackedSources: GraphNode[] }) {
  const anyStale = trackedSources.some((n) => n.sourceHealth?.state === 'degraded' || n.sourceHealth?.state === 'critical')
  const freshestAgeSec = trackedSources.length > 0 ? Math.min(...trackedSources.map((n) => n.sourceHealth?.lastSyncAgeSec ?? Infinity)) : null
  const color = anyStale ? ACCENT_AMBER : ACCENT_GREEN

  return (
    <div className="flex items-center" style={{ gap: SPACE_8, padding: `${SPACE_8}px ${SPACE_16}px`, borderBottom: `1px solid ${BORDER_LIGHT}` }}>
      <span aria-hidden className="graph-live-dot" style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
      <span style={{ ...TYPE_BODY_ROW, color: TEXT_SECONDARY }}>
        LIVE {freshestAgeSec !== null && Number.isFinite(freshestAgeSec) ? `· updated ${Math.round(freshestAgeSec)}s ago` : ''}
      </span>
    </div>
  )
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between" style={{ padding: `${SPACE_8}px ${SPACE_16}px`, borderBottom: `1px solid ${BORDER_LIGHT}` }}>
      <span style={{ ...TYPE_BODY_ROW, color: TEXT_SECONDARY }}>{label}</span>
      <span style={TYPE_STAT_VALUE}>{value}</span>
    </div>
  )
}

// 8.13-ui: Strata's default (nothing-selected) browser — Country -> Status
// -> Climbers, walking the real country->route->operator->climber chain's
// COUNTRY level directly (panelFields.ts's nearestAncestorOfType), then the
// real per-climber status field. This replaces the flat "Network Overview"
// stat tiles that used to sit here in Strata — this dataset's real entry
// point is "which country, then which readiness bucket," not a handful of
// aggregate counts. The route/expedition levels stay one click away too,
// inside each camp's own Layer Details panel (LayerDetailPanel.tsx) — this
// browser is the OTHER real entry point into the same climbers, starting
// from geography instead of altitude.
const STRATA_STATUS_BUCKETS: { key: string; label: string; matches: (c: GraphNode) => boolean }[] = [
  { key: 'READY', label: 'Ready', matches: (c) => c.status === 'READY' },
  { key: 'WATCH', label: 'Watch', matches: (c) => c.status === 'WATCH' },
  { key: 'IMPAIRED', label: 'Impaired', matches: (c) => c.status === 'IMPAIRED' },
  { key: 'REQUIRES_DESCENT', label: 'Requires descent', matches: (c) => c.status === 'REQUIRES_DESCENT' },
  { key: 'UNKNOWN', label: 'Unknown', matches: (c) => c.status === null },
]

function StrataCountryDrill({
  allNodes,
  onSelectClimber,
  selectedCountryId,
  onSelectCountryId,
}: {
  allNodes: GraphNode[]
  onSelectClimber: (id: string) => void
  /** Lifted to GraphNext.tsx — StrataCanvas.tsx needs this SAME id to decide what its own right-hand tree renders. */
  selectedCountryId: string | null
  onSelectCountryId: (id: string | null) => void
}) {
  const nodeById = useMemo(() => new Map(allNodes.map((n) => [n.id, n])), [allNodes])
  const climbers = useMemo(() => allNodes.filter((n) => n.type === 'climber'), [allNodes])
  const annotated = useMemo(() => climbers.map((climber) => ({ climber, country: nearestAncestorOfType(climber, 'country', nodeById) })), [climbers, nodeById])
  // Status is local, panel-only browsing state — the canvas has no notion
  // of "status" to sync with, unlike the country level above it. Resets
  // whenever the selected country changes so a status chosen for Nepal
  // doesn't silently carry over once you back out and pick Pakistan.
  const [status, setStatus] = useState<string | undefined>(undefined)
  useEffect(() => setStatus(undefined), [selectedCountryId])

  if (annotated.length === 0) {
    return (
      <div style={{ padding: `${SPACE_8}px ${SPACE_16}px` }}>
        <p style={{ ...TYPE_BODY_ROW, color: TEXT_TERTIARY }}>No climbers on record.</p>
      </div>
    )
  }

  if (selectedCountryId === null) {
    const { groups, nodeByKey } = groupNodesIntoDrillGroups(annotated, (a) => a.country)
    return <DrillList levelLabel="Country" trail={[]} groups={groups} onBack={null} onSelect={(key) => onSelectCountryId(nodeByKey.get(key)?.id ?? null)} />
  }
  const countryNode = nodeById.get(selectedCountryId) ?? null
  const inCountry = annotated.filter((a) => idOrNull(a.country) === selectedCountryId)

  if (status === undefined) {
    const statusGroups: DrillGroup[] = STRATA_STATUS_BUCKETS.map((s) => ({ key: s.key, label: s.label, count: inCountry.filter((a) => s.matches(a.climber)).length }))
    return (
      <DrillList
        levelLabel="Status"
        trail={[countryNode?.label ?? 'Unresolved country']}
        groups={statusGroups}
        onBack={() => onSelectCountryId(null)}
        onSelect={(key) => setStatus(key)}
      />
    )
  }

  const bucket = STRATA_STATUS_BUCKETS.find((s) => s.key === status)
  const inStatus = bucket ? inCountry.filter((a) => bucket.matches(a.climber)) : []

  return (
    <ClimberLevelList
      trail={[countryNode?.label ?? 'Unresolved country', bucket?.label ?? 'Unknown']}
      climbers={inStatus.map((a) => a.climber)}
      onBack={() => setStatus(undefined)}
      onSelectClimber={onSelectClimber}
    />
  )
}

