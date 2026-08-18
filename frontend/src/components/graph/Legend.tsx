// 8.3: bottom-left, collapsible, starts collapsed to a "Legend ▾" chip.

import {
  ANOMALY_COLOR,
  BG_PRIMARY,
  BORDER_LIGHT,
  EDGE_KIND_COLOR,
  ENTITY_KIND_COLOR,
  READINESS_COLOR,
  RADIUS_CARD,
  SHADOW_SOFT,
  SPACE_8,
  SPACE_16,
  TEXT_SECONDARY,
  TYPE_PROPERTY_VALUE,
} from '../../graph/tokens'
import type { EdgeKind, EntityKind, ReadinessStatus } from '../../graph/tokens'

const ENTITY_ROW: { kind: EntityKind; label: string }[] = [
  { kind: 'country', label: 'Country' },
  { kind: 'route', label: 'Route' },
  { kind: 'camp', label: 'Camp' },
  { kind: 'climber', label: 'Climber' },
  { kind: 'source', label: 'Source' },
]

const EDGE_ROW: { kind: EdgeKind; label: string }[] = [
  { kind: 'parent-child', label: 'parent-child' },
  { kind: 'sibling', label: 'sibling' },
  { kind: 'cross-connection', label: 'cross-connection' },
]

const READINESS_ROW: ReadinessStatus[] = ['READY', 'WATCH', 'IMPAIRED', 'REQUIRES DESCENT']

export function Legend({ expanded, onToggle }: { expanded: boolean; onToggle: () => void }) {
  return (
    <div style={{ position: 'absolute', left: SPACE_16, bottom: SPACE_16 }}>
      {expanded ? (
        <div
          style={{
            background: BG_PRIMARY,
            border: `1px solid ${BORDER_LIGHT}`,
            borderRadius: RADIUS_CARD,
            boxShadow: SHADOW_SOFT,
            padding: SPACE_16,
            display: 'flex',
            flexDirection: 'column',
            gap: SPACE_8,
          }}
        >
          <button type="button" onClick={onToggle} style={{ ...TYPE_PROPERTY_VALUE, background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left', alignSelf: 'flex-start' }}>
            Legend ▴
          </button>

          <div style={{ display: 'flex', gap: SPACE_16, flexWrap: 'wrap' }}>
            {ENTITY_ROW.map((e) => (
              <Swatch key={e.kind} label={e.label} color={ENTITY_KIND_COLOR[e.kind]} />
            ))}
            <Swatch label="Anomaly" color={ANOMALY_COLOR} />
          </div>

          <div style={{ display: 'flex', gap: SPACE_16, flexWrap: 'wrap' }}>
            {EDGE_ROW.map((e) => (
              <EdgeSwatch key={e.kind} label={e.label} kind={e.kind} />
            ))}
          </div>

          <div style={{ display: 'flex', gap: SPACE_16, flexWrap: 'wrap' }}>
            {READINESS_ROW.map((status) => (
              <Swatch key={status} label={status} color={READINESS_COLOR[status]} />
            ))}
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={onToggle}
          style={{
            ...TYPE_PROPERTY_VALUE,
            background: BG_PRIMARY,
            border: `1px solid ${BORDER_LIGHT}`,
            borderRadius: RADIUS_CARD,
            boxShadow: SHADOW_SOFT,
            padding: `${SPACE_8}px ${SPACE_16}px`,
            cursor: 'pointer',
            color: TEXT_SECONDARY,
          }}
        >
          Legend ▾
        </button>
      )}
    </div>
  )
}

function Swatch({ label, color }: { label: string; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: SPACE_8 / 2 }}>
      <svg width={8} height={8} style={{ flexShrink: 0 }}>
        <circle cx={4} cy={4} r={4} fill={color} />
      </svg>
      <span style={TYPE_PROPERTY_VALUE}>{label}</span>
    </div>
  )
}

function EdgeSwatch({ label, kind }: { label: string; kind: EdgeKind }) {
  const color = EDGE_KIND_COLOR[kind]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: SPACE_8 }}>
      <svg width={24} height={8} style={{ flexShrink: 0 }}>
        {kind === 'cross-connection' ? (
          <path d="M0,4 Q6,0 12,4 T24,4" fill="none" stroke={color} strokeWidth={1.5} />
        ) : (
          <line x1={0} y1={4} x2={24} y2={4} stroke={color} strokeWidth={1.5} strokeDasharray={kind === 'sibling' ? '3 2' : undefined} />
        )}
      </svg>
      <span style={TYPE_PROPERTY_VALUE}>{label}</span>
    </div>
  )
}
