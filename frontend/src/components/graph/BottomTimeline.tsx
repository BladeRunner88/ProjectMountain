// 8.13-ui: the redesign spec's collapsible 140px bottom timeline. No real
// "mission tasking" concept exists in this domain, so — per the plan —
// this renders exactly two real swimlanes, never a fabricated third:
//   RECENT ACTIVITY   — real LiveGraphEvent history (Stage 4's own ring
//                        buffer), positioned on a real wall-clock axis.
//   DECISION CAPACITY — a selected climber's real PersonPrediction.timeline
//                        (the exact series Control Room's PredictionForecast
//                        already renders), shown only while such a climber
//                        is selected.
// These two axes are honestly DIFFERENT things (a real elapsed-time window
// vs. a forecast's own relative hour labels) — forcing them onto one shared
// axis would imply an alignment that doesn't exist, so each keeps its own.

import type { GraphNode } from '../../graph/adapter'
import type { ActivityEntry } from './GlobalDashboard'
import {
  ACCENT_AMBER,
  ACCENT_BLUE,
  ACCENT_RED,
  BG_PRIMARY,
  BORDER_LIGHT,
  SPACE_8,
  SPACE_16,
  TEXT_PRIMARY,
  TEXT_TERTIARY,
  TYPE_SECTION_LABEL,
  TYPE_STAT_LABEL,
  TYPE_TIMESTAMP,
} from '../../graph/tokens'

const TIMELINE_HEIGHT_PX = 140
const TIMELINE_COLLAPSED_HEIGHT_PX = 40
const ACTIVITY_WINDOW_MS = 60 * 60 * 1000 // real 60-minute rolling window
const ACTIVITY_VERB: Record<ActivityEntry['kind'], string> = {
  added: 'appeared',
  touched: 'updated',
  statusChanged: 'changed status',
  removed: 'was removed',
}

export interface BottomTimelineProps {
  collapsed: boolean
  onToggleCollapsed: () => void
  recentActivity: ActivityEntry[]
  allNodes: GraphNode[]
  /** the single selected node, when it's a climber with a real prediction timeline — null otherwise (0/multi-select, or a climber with none of the 9-of-50 predictions). */
  selectedClimberWithTimeline: GraphNode | null
}

export function BottomTimeline({ collapsed, onToggleCollapsed, recentActivity, allNodes, selectedClimberWithTimeline }: BottomTimelineProps) {
  return (
    <div
      style={{
        height: collapsed ? TIMELINE_COLLAPSED_HEIGHT_PX : TIMELINE_HEIGHT_PX,
        borderTop: `1px solid ${BORDER_LIGHT}`,
        background: BG_PRIMARY,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        transition: 'height 200ms ease-out',
      }}
    >
      <TimelineHeader collapsed={collapsed} onToggleCollapsed={onToggleCollapsed} />
      {!collapsed && (
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
          <ActivitySwimlane recentActivity={recentActivity} allNodes={allNodes} />
          {selectedClimberWithTimeline && <PredictionSwimlane node={selectedClimberWithTimeline} />}
        </div>
      )}
    </div>
  )
}

function TimelineHeader({ collapsed, onToggleCollapsed }: { collapsed: boolean; onToggleCollapsed: () => void }) {
  const today = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  return (
    <button
      type="button"
      onClick={onToggleCollapsed}
      className="flex items-center justify-between"
      style={{
        height: 32,
        flexShrink: 0,
        padding: `0 ${SPACE_16}px`,
        borderBottom: collapsed ? 'none' : `1px solid ${BORDER_LIGHT}`,
        background: 'none',
        border: 'none',
        borderBottomWidth: collapsed ? 0 : 1,
        borderBottomStyle: 'solid',
        borderBottomColor: BORDER_LIGHT,
        cursor: 'pointer',
        width: '100%',
      }}
    >
      <span style={{ ...TYPE_TIMESTAMP, color: TEXT_PRIMARY, fontWeight: 600 }}>{today}</span>
      <span style={{ ...TYPE_TIMESTAMP, color: TEXT_TERTIARY }}>{collapsed ? 'Timeline ▴' : 'Timeline ▾'}</span>
    </button>
  )
}

// 8.13-V.1 BUILD BUG: "the bottom timeline renders as a row of blue dots" —
// real, confirmed: the strip had no baseline, no gridlines, and no time
// labels, so several same-kind events landing close together (most real
// live events are 'touched,' which all render blue) read as an
// undifferentiated cluster of identical circles. Fixed with a real
// baseline + 5 real time gridlines (-60m through now) — the same real
// ACTIVITY_WINDOW_MS this strip already scoped its dots to, just finally
// drawn. Dots at the exact same rounded position now also stack vertically
// instead of overlapping into one blob, so a real burst of simultaneous
// events is still visually countable.
const ACTIVITY_GRIDLINE_COUNT = 4 // -60m, -45m, -30m, -15m, now (5 labels, 4 intervals)
const ACTIVITY_TRACK_HEIGHT_PX = 32
const ACTIVITY_DOT_SIZE_PX = 7
const ACTIVITY_DOT_STACK_GAP_PX = 9

function ActivitySwimlane({ recentActivity, allNodes }: { recentActivity: ActivityEntry[]; allNodes: GraphNode[] }) {
  const nodeById = new Map(allNodes.map((n) => [n.id, n]))
  const now = Date.now()
  const windowStart = now - ACTIVITY_WINDOW_MS
  const inWindow = recentActivity.filter((e) => e.at >= windowStart)

  // Stack dots that land within the same ~1.5%-wide bucket so a real burst
  // of simultaneous events reads as a small tower, never one overlapping blob.
  const bucketCounts = new Map<number, number>()
  const positioned = inWindow.map((entry) => {
    const leftPct = Math.min(100, Math.max(0, ((entry.at - windowStart) / ACTIVITY_WINDOW_MS) * 100))
    const bucket = Math.round(leftPct / 1.5)
    const stackIndex = bucketCounts.get(bucket) ?? 0
    bucketCounts.set(bucket, stackIndex + 1)
    return { entry, leftPct, stackIndex }
  })

  return (
    <div className="flex" style={{ padding: `${SPACE_8}px ${SPACE_16}px`, borderBottom: `1px solid ${BORDER_LIGHT}` }}>
      <div style={{ width: 100, flexShrink: 0 }}>
        <p style={TYPE_SECTION_LABEL}>Activity</p>
      </div>
      <div style={{ flex: 1, position: 'relative', height: ACTIVITY_TRACK_HEIGHT_PX }}>
        {/* real baseline the dots sit on, plus real gridlines/labels across the actual 60-minute window — never a bare floating scatter */}
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 1, background: BORDER_LIGHT }} />
        {Array.from({ length: ACTIVITY_GRIDLINE_COUNT + 1 }, (_, i) => i).map((i) => {
          const leftPct = (i / ACTIVITY_GRIDLINE_COUNT) * 100
          const minutesAgo = Math.round(((ACTIVITY_GRIDLINE_COUNT - i) / ACTIVITY_GRIDLINE_COUNT) * (ACTIVITY_WINDOW_MS / 60000))
          // The first/last gridline sit exactly at the track's own 0%/100%
          // edges — centring their label there (translateX(-50%)) would let
          // half the label bleed past the real edge of the screen. Only the
          // interior gridlines centre; the two end labels anchor inward instead.
          const edgeAlign = i === 0 ? 'left' : i === ACTIVITY_GRIDLINE_COUNT ? 'right' : 'center'
          const tickTransform = edgeAlign === 'left' ? 'none' : edgeAlign === 'right' ? 'translateX(-100%)' : 'translateX(-50%)'
          return (
            <div key={i} style={{ position: 'absolute', left: `${leftPct}%`, bottom: 0, transform: tickTransform, textAlign: edgeAlign }}>
              <div style={{ width: 1, height: 4, background: BORDER_LIGHT, margin: edgeAlign === 'center' ? '0 auto' : edgeAlign === 'right' ? '0 0 0 auto' : 0 }} />
              <span style={{ ...TYPE_STAT_LABEL, color: TEXT_TERTIARY, whiteSpace: 'nowrap' }}>{minutesAgo === 0 ? 'now' : `-${minutesAgo}m`}</span>
            </div>
          )
        })}
        {inWindow.length === 0 && <p style={{ ...TYPE_TIMESTAMP, color: TEXT_TERTIARY, position: 'absolute', top: 2, left: 0 }}>No live events in the last hour.</p>}
        {positioned.map(({ entry, leftPct, stackIndex }) => {
          const node = nodeById.get(entry.nodeId)
          return (
            <span
              key={entry.id}
              title={`${node ? node.label : entry.nodeId} ${ACTIVITY_VERB[entry.kind]}`}
              style={{
                position: 'absolute',
                left: `${leftPct}%`,
                bottom: 4 + stackIndex * ACTIVITY_DOT_STACK_GAP_PX,
                width: ACTIVITY_DOT_SIZE_PX,
                height: ACTIVITY_DOT_SIZE_PX,
                borderRadius: '50%',
                background: entry.kind === 'statusChanged' ? ACCENT_RED : entry.kind === 'removed' ? ACCENT_AMBER : ACCENT_BLUE,
                border: `1px solid ${BG_PRIMARY}`,
                transform: 'translateX(-50%)',
              }}
            />
          )
        })}
      </div>
    </div>
  )
}

function PredictionSwimlane({ node }: { node: GraphNode }) {
  const points = node.timeline ?? []
  return (
    <div className="flex" style={{ padding: `${SPACE_8}px ${SPACE_16}px` }}>
      <div style={{ width: 100, flexShrink: 0 }}>
        <p style={TYPE_SECTION_LABEL}>Capacity</p>
        <p style={{ ...TYPE_TIMESTAMP, color: TEXT_TERTIARY, marginTop: 2 }}>{node.label}</p>
      </div>
      <div className="flex items-end" style={{ flex: 1, gap: SPACE_8, height: 40 }}>
        {points.map((p) => (
          <div key={p.hourLabel} className="flex flex-col items-center" style={{ flex: 1, height: '100%', justifyContent: 'flex-end' }}>
            <div
              title={`${p.hourLabel}: ${p.capacity}/100${p.observed ? '' : ' (projected)'}`}
              style={{
                width: '60%',
                height: `${Math.max(4, p.capacity)}%`,
                background: p.observed ? ACCENT_BLUE : TEXT_TERTIARY,
                opacity: p.observed ? 1 : 0.5,
                borderRadius: 2,
              }}
            />
            <span style={{ ...TYPE_STAT_LABEL, marginTop: 2 }}>{p.hourLabel}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
