'use client'

import { useMemo, useState, type ReactElement } from 'react'
import {
  ANOMALY,
  BORDER_WIDTH,
  HAIRLINE,
  NOMINAL,
  PANEL_RAISED,
  RADIUS_INTERACTIVE,
  RADIUS_STATIC,
  SPACE_16,
  SPACE_32,
  SPACE_8,
  TEXT_DIM,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  TYPE_BODY,
  TYPE_CAPTION,
  WATCH,
} from '@/features/ase/tokens'
import type { RevisionState, TimelineEvent, TimelineLayer, TimelineSeverity } from '@/features/ase/services/revision'
import { DirectManipulationSlider } from '@/features/control-room'
import { focusRingStyle, useFocusRing } from '@/features/control-room'

type ZoomLevel = '1h' | '6h' | '24h' | '7d' | '30d' | 'full'
const ZOOM_HOURS: Record<ZoomLevel, number> = { '1h': 1, '6h': 6, '24h': 24, '7d': 168, '30d': 720, full: 24 * 60 }
const LAYER_LABEL: Record<TimelineLayer, string> = { system: 'SYSTEM', external: 'EXTERNAL', upcoming: 'UPCOMING', annotation: 'ANNOTATIONS' }
const SEVERITY_SIZE: Record<TimelineSeverity, number> = { low: 4, medium: 6, high: 9, incident: 12 }
const SEVERITY_COLOR: Record<TimelineSeverity, string> = { low: TEXT_DIM, medium: NOMINAL, high: WATCH, incident: ANOMALY }

// TIMELINE — the shape should read before any label does: severity is
// visual weight, correlation is proposed as a question (ASE does not
// assert a cause), and observed/projected never share the same weight.
export function RevisionTimeline({ state }: { state: RevisionState }): ReactElement {
  const [zoom, setZoom] = useState<ZoomLevel>('24h')
  const [scrubPct, setScrubPct] = useState(50)
  const [compare, setCompare] = useState(false)
  const [now] = useState(() => Date.now())

  const windowMs = ZOOM_HOURS[zoom] * 3600000
  const rangeStart = now - windowMs
  const events = useMemo(() => state.timelineEvents.filter((e) => new Date(e.at).getTime() >= rangeStart - windowMs * 0.1), [state.timelineEvents, rangeStart, windowMs])

  const scrubAt = rangeStart + (scrubPct / 100) * windowMs * 1.3
  const belief = useMemo(() => {
    if (state.asOfBeliefs.length === 0) return null
    return state.asOfBeliefs.reduce((best, b) => (Math.abs(new Date(b.at).getTime() - scrubAt) < Math.abs(new Date(best.at).getTime() - scrubAt) ? b : best))
  }, [state.asOfBeliefs, scrubAt])

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between">
        <div className="flex items-center" style={{ gap: SPACE_8 }}>
          {(Object.keys(ZOOM_HOURS) as ZoomLevel[]).map((z) => (
            <ZoomButton key={z} label={z} active={z === zoom} onClick={() => setZoom(z)} />
          ))}
        </div>
        <CompareToggle active={compare} onClick={() => setCompare((c) => !c)} />
      </div>

      <TimelineStrip events={events} rangeStart={rangeStart} windowMs={windowMs} label={compare ? 'THIS PERIOD' : undefined} />
      {compare && (
        <div style={{ marginTop: SPACE_16 }}>
          <TimelineStrip
            events={state.timelineEvents.filter((e) => {
              const shifted = new Date(e.at).getTime() + 3 * 86400000
              return shifted >= rangeStart - windowMs * 0.1 && shifted <= now + windowMs * 0.3
            })}
            rangeStart={rangeStart - 3 * 86400000}
            windowMs={windowMs}
            label="SAME PERIOD, 3 DAYS AGO"
          />
        </div>
      )}

      {state.eventClusters.length > 0 && (
        <div style={{ marginTop: SPACE_16 }}>
          {state.eventClusters.map((c) => (
            <div key={c.id} style={{ padding: SPACE_16, background: PANEL_RAISED, borderRadius: RADIUS_STATIC, border: `${BORDER_WIDTH}px solid ${WATCH}` }}>
              <p style={{ ...TYPE_CAPTION, color: WATCH }}>EVENT CORRELATION</p>
              <p style={{ ...TYPE_BODY, color: TEXT_PRIMARY, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>{c.question}</p>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: SPACE_32, padding: SPACE_16, background: PANEL_RAISED, borderRadius: RADIUS_STATIC, border: `${BORDER_WIDTH}px solid ${HAIRLINE}` }}>
        <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>AS-OF DETAIL — SCRUB THE TIMELINE</p>
        <div style={{ marginTop: SPACE_16 }}>
          <DirectManipulationSlider value={scrubPct} min={0} max={100} step={0.5} onChange={setScrubPct} ariaLabel="Scrub timeline" accentColor={NOMINAL} />
        </div>
        <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_8 }}>{new Date(scrubAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
        {belief ? (
          <p style={{ ...TYPE_BODY, color: TEXT_PRIMARY, marginTop: SPACE_16, textTransform: 'none', letterSpacing: 'normal' }}>
            At {new Date(belief.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}, ASE believed {belief.name} {belief.serial} was {belief.believedPct}% likely to require descent. Actual outcome:{' '}
            {belief.outcome}. ASE was {belief.wasCorrect ? 'correct' : 'wrong'}.
          </p>
        ) : (
          <p style={{ ...TYPE_BODY, color: TEXT_DIM, marginTop: SPACE_16 }}>No as-of belief recorded near this point.</p>
        )}
      </div>

      <div style={{ marginTop: SPACE_32 }}>
        <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>PAST INVESTIGATIONS</p>
        {state.investigations.map((inv) => (
          <div key={inv.id} style={{ padding: `${SPACE_8}px 0`, borderBottom: `${BORDER_WIDTH}px solid ${HAIRLINE}` }}>
            <p style={{ ...TYPE_BODY, color: TEXT_PRIMARY, textTransform: 'none', letterSpacing: 'normal' }}>
              Opened by {inv.by} — {inv.touched}
            </p>
            <p style={{ ...TYPE_CAPTION, color: inv.concludedNoAction ? TEXT_DIM : NOMINAL, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
              {inv.outcome} · {inv.durationMinutes} min
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

function ZoomButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  const { focused, handlers } = useFocusRing()
  return (
    <button
      type="button"
      onClick={onClick}
      {...handlers}
      className="pressable"
      style={{
        ...TYPE_CAPTION,
        textTransform: 'none',
        letterSpacing: 'normal',
        color: active ? TEXT_PRIMARY : TEXT_SECONDARY,
        background: active ? HAIRLINE : 'transparent',
        border: `${BORDER_WIDTH}px solid ${active ? TEXT_SECONDARY : HAIRLINE}`,
        borderRadius: RADIUS_INTERACTIVE,
        padding: `${SPACE_8}px ${SPACE_16}px`,
        ...focusRingStyle(focused),
      }}
    >
      {label}
    </button>
  )
}

function CompareToggle({ active, onClick }: { active: boolean; onClick: () => void }) {
  const { focused, handlers } = useFocusRing()
  return (
    <button
      type="button"
      onClick={onClick}
      {...handlers}
      className="pressable"
      style={{
        ...TYPE_CAPTION,
        textTransform: 'none',
        letterSpacing: 'normal',
        color: active ? TEXT_PRIMARY : TEXT_SECONDARY,
        border: `${BORDER_WIDTH}px solid ${active ? NOMINAL : HAIRLINE}`,
        borderRadius: RADIUS_INTERACTIVE,
        padding: `${SPACE_8}px ${SPACE_16}px`,
        ...focusRingStyle(focused),
      }}
    >
      Compare against 3 days ago
    </button>
  )
}

const LAYERS: TimelineLayer[] = ['system', 'external', 'upcoming', 'annotation']

function TimelineStrip({ events, rangeStart, windowMs, label }: { events: TimelineEvent[]; rangeStart: number; windowMs: number; label?: string }) {
  const w = 1100
  const rowH = 40
  const x = (at: string) => Math.max(4, Math.min(w - 4, ((new Date(at).getTime() - rangeStart) / windowMs) * w))

  return (
    <div style={{ marginTop: SPACE_16 }}>
      {label && (
        <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginBottom: SPACE_8 }}>{label}</p>
      )}
      <div style={{ padding: SPACE_16, background: PANEL_RAISED, borderRadius: RADIUS_STATIC, border: `${BORDER_WIDTH}px solid ${HAIRLINE}`, overflowX: 'auto' }}>
        <svg width={w} height={rowH * LAYERS.length + 20} role="img" aria-label="Revision timeline">
          {LAYERS.map((layer, i) => {
            const y = i * rowH + 24
            const layerEvents = events.filter((e) => e.layer === layer)
            return (
              <g key={layer}>
                <text x={0} y={y - 12} fill={TEXT_DIM} fontSize={10}>
                  {LAYER_LABEL[layer]}
                </text>
                <line x1={0} y1={y} x2={w} y2={y} stroke={HAIRLINE} strokeWidth={1} />
                {layerEvents.map((e) => (
                  <g key={e.id}>
                    {e.severity === 'incident' ? (
                      <rect x={x(e.at) - 2} y={y - 12} width={4} height={24} fill={SEVERITY_COLOR[e.severity]} />
                    ) : (
                      <circle cx={x(e.at)} cy={y} r={SEVERITY_SIZE[e.severity]} fill={layer === 'upcoming' ? 'none' : SEVERITY_COLOR[e.severity]} stroke={layer === 'upcoming' ? SEVERITY_COLOR[e.severity] : undefined} strokeWidth={layer === 'upcoming' ? 1.5 : undefined} strokeDasharray={layer === 'upcoming' ? '2 2' : undefined} />
                    )}
                    <title>
                      {e.label} — {e.detail} ({new Date(e.at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })})
                    </title>
                  </g>
                ))}
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}
