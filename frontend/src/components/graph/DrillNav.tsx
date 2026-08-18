// 8.13-ui: shared "drill down, then back up" primitives for the left
// panel's roster browsers — LayerDetailPanel's per-layer Region -> Route
// -> Expedition -> Climbers browser and GlobalDashboard's Strata default
// Country -> Status -> Climbers browser both walk the same shape (a list
// of named, counted groups; a back button; a trail of where you've been;
// a final list of real climbers). One implementation, not two.

import type { GraphNode } from '../../graph/adapter'
import { STATUS_COLOR } from '../../graph/nodeVisuals'
import {
  ACCENT_BLUE,
  BORDER_LIGHT,
  BORDER_MEDIUM,
  CELL_VESICLE,
  RADIUS_BADGE,
  RADIUS_BUTTON,
  SPACE_8,
  SPACE_16,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  TYPE_PROPERTY_VALUE,
  TYPE_SECTION_LABEL,
  TYPE_STAT_LABEL,
  TYPE_TIMESTAMP,
} from '../../graph/tokens'

export interface DrillGroup {
  key: string
  label: string
  count: number
}

// A plain `+ 's'` breaks on the two irregular nouns this app's levels
// actually use ("Country" -> "Countrys", "Status" -> "Statuss") — spell out
// the irregulars rather than pretend English pluralization is regular.
const IRREGULAR_PLURALS: Record<string, string> = { Country: 'Countries', Status: 'Statuses' }

function pluralizeLevelLabel(word: string, count: number): string {
  if (count === 1) return word
  return IRREGULAR_PLURALS[word] ?? `${word}s`
}

export function DrillTrail({ trail, onBack }: { trail: string[]; onBack: (() => void) | null }) {
  if (!onBack) return null
  return (
    <div className="flex items-center" style={{ gap: SPACE_8, marginBottom: SPACE_8 }}>
      <button
        type="button"
        onClick={onBack}
        className="flex items-center"
        style={{ ...TYPE_STAT_LABEL, gap: 4, padding: `2px ${SPACE_8}px`, borderRadius: RADIUS_BADGE, borderWidth: 1, borderStyle: 'solid', borderColor: BORDER_MEDIUM, background: 'none', color: TEXT_SECONDARY, cursor: 'pointer', flexShrink: 0 }}
      >
        <span aria-hidden>←</span> Back
      </button>
      <span style={{ ...TYPE_TIMESTAMP, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{trail.join(' › ')}</span>
    </div>
  )
}

export function DrillList({
  levelLabel,
  trail,
  groups,
  onBack,
  onSelect,
}: {
  levelLabel: string
  trail: string[]
  groups: DrillGroup[]
  onBack: (() => void) | null
  onSelect: (key: string) => void
}) {
  return (
    <div style={{ padding: SPACE_16, borderTop: `1px solid ${BORDER_LIGHT}` }}>
      <DrillTrail trail={trail} onBack={onBack} />
      <p style={{ ...TYPE_SECTION_LABEL, textTransform: 'uppercase', margin: `0 0 ${SPACE_8}px` }}>
        {pluralizeLevelLabel(levelLabel, groups.length)} ({groups.length})
      </p>
      {groups.map((g) => (
        <button
          key={g.key}
          type="button"
          onClick={() => onSelect(g.key)}
          className="flex items-center justify-between graph-drill-row"
          style={{
            ...TYPE_PROPERTY_VALUE,
            width: '100%',
            textAlign: 'left',
            padding: `${SPACE_8}px ${SPACE_8}px`,
            margin: `0 -${SPACE_8}px`,
            borderRadius: RADIUS_BUTTON,
            borderWidth: 0,
            borderBottomWidth: 1,
            borderStyle: 'solid',
            borderColor: BORDER_LIGHT,
            background: 'none',
            cursor: 'pointer',
            color: TEXT_PRIMARY,
          }}
        >
          <span>{g.label}</span>
          <span style={TYPE_TIMESTAMP}>
            {g.count} climber{g.count === 1 ? '' : 's'} ›
          </span>
        </button>
      ))}
    </div>
  )
}

/** The terminal level of every drill: real climbers, real status dot, click through to Node Details. */
export function ClimberLevelList({
  trail,
  climbers,
  onBack,
  onSelectClimber,
}: {
  trail: string[]
  climbers: GraphNode[]
  onBack: () => void
  onSelectClimber: (id: string) => void
}) {
  return (
    <div style={{ padding: SPACE_16, borderTop: `1px solid ${BORDER_LIGHT}` }}>
      <DrillTrail trail={trail} onBack={onBack} />
      <p style={{ ...TYPE_SECTION_LABEL, textTransform: 'uppercase', margin: `0 0 ${SPACE_8}px` }}>Climbers ({climbers.length})</p>
      {climbers.length === 0 ? (
        <p style={TYPE_TIMESTAMP}>No climbers match the current search/filter.</p>
      ) : (
        climbers.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelectClimber(c.id)}
            className="flex items-center justify-between graph-drill-row"
            style={{
              ...TYPE_PROPERTY_VALUE,
              width: '100%',
              textAlign: 'left',
              padding: `${SPACE_8}px ${SPACE_8}px`,
              margin: `0 -${SPACE_8}px`,
              borderRadius: RADIUS_BUTTON,
              borderWidth: 0,
              borderBottomWidth: 1,
              borderStyle: 'solid',
              borderColor: BORDER_LIGHT,
              background: 'none',
              cursor: 'pointer',
              color: TEXT_PRIMARY,
            }}
          >
            <span style={{ ...TYPE_TIMESTAMP }}>{c.serial ?? c.label}</span>
            <span className="flex items-center" style={{ gap: SPACE_8 / 2, color: ACCENT_BLUE }}>
              <span aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', background: c.status ? STATUS_COLOR[c.status] : CELL_VESICLE, flexShrink: 0 }} />
              {c.label}
            </span>
          </button>
        ))
      )}
    </div>
  )
}

/** Groups real climbers (via an annotated `GraphNode | null` field) into sorted DrillGroups, keyed by real node id — the null/"unresolved" bucket (a chain that genuinely doesn't resolve) always sorts last so it never looks like a real, prioritized entry. Returns a key -> node lookup alongside since DrillList only round-trips string keys. */
export function groupNodesIntoDrillGroups<T>(items: readonly T[], getter: (item: T) => GraphNode | null): { groups: DrillGroup[]; nodeByKey: Map<string, GraphNode | null> } {
  const byKey = new Map<string, { node: GraphNode | null; count: number }>()
  for (const item of items) {
    const node = getter(item)
    const key = node?.id ?? 'unresolved'
    const existing = byKey.get(key)
    if (existing) existing.count += 1
    else byKey.set(key, { node, count: 1 })
  }
  const sorted = [...byKey.entries()].sort(([, a], [, b]) => {
    if (a.node === null) return 1
    if (b.node === null) return -1
    return a.node.label.localeCompare(b.node.label)
  })
  const nodeByKey = new Map(sorted.map(([key, v]) => [key, v.node]))
  const groups = sorted.map(([key, v]) => ({ key, label: v.node?.label ?? 'Unresolved', count: v.count }))
  return { groups, nodeByKey }
}

export function idOrNull(node: GraphNode | null | undefined): string | null {
  return node?.id ?? null
}
