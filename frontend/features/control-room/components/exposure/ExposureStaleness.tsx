'use client'

import { useState, type ReactElement } from 'react'
import {
  ANOMALY,
  BORDER_WIDTH,
  HAIRLINE,
  NOMINAL,
  PANEL_RAISED,
  RADIUS_INTERACTIVE,
  RADIUS_STATIC,
  SPACE_8,
  SPACE_16,
  SPACE_24,
  TEXT_DIM,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  TYPE_BODY,
  TYPE_CAPTION,
  WATCH,
} from '@/features/ase/tokens'
import { projectedRefreshRangeSec, type ConfidenceFloor, type ExposureState, type StalenessRow } from '@/features/ase/services/exposure'
import { canDoOnPanel, disabledReasonOnPanel, type ExposureRole as Role } from '@/features/control-room'
import { focusRingStyle, useFocusRing } from '@/features/control-room'

function formatSec(sec: number): string {
  if (sec < 120) return `${sec}s`
  return `${Math.round(sec / 60)}m`
}

// STALENESS — a per-source age dashboard, "simulate refresh" as a real
// projected RANGE (never a fake instant 0s), and per-class confidence
// floors with a live impact preview computed from real per-marker
// confidences before anything is confirmed.
export function ExposureStaleness({ state, role }: { state: ExposureState; role: Role }): ReactElement {
  return (
    <div>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>SOURCE STALENESS</p>
      <div style={{ marginTop: SPACE_8 }}>
        {state.staleness.map((row) => (
          <StalenessRowView key={row.sourceId} row={row} />
        ))}
      </div>

      <div style={{ marginTop: SPACE_24 }}>
        <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>CONFIDENCE FLOORS</p>
        <div className="grid grid-cols-2" style={{ gap: SPACE_16, marginTop: SPACE_8 }}>
          {state.confidenceFloors.map((f) => (
            <FloorCard key={f.className} floor={f} role={role} />
          ))}
        </div>
      </div>
    </div>
  )
}

function StalenessRowView({ row }: { row: StalenessRow }) {
  const [range, setRange] = useState<{ lowSec: number; highSec: number } | null>(null)
  return (
    <div
      className="flex items-center justify-between"
      style={{ padding: SPACE_16, marginBottom: SPACE_8, background: PANEL_RAISED, borderRadius: RADIUS_STATIC, border: `${BORDER_WIDTH}px solid ${row.isStale ? WATCH : HAIRLINE}` }}
    >
      <div>
        <p style={{ ...TYPE_BODY, color: TEXT_PRIMARY }}>{row.sourceName}</p>
        <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
          Current age {formatSec(row.currentAgeSec)} · useful window {formatSec(row.usefulWindowSec)} · {row.affectedConclusionsCount} conclusion
          {row.affectedConclusionsCount === 1 ? '' : 's'} affected
        </p>
        {range && (
          <p style={{ ...TYPE_CAPTION, color: NOMINAL, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
            Projected refresh latency: {formatSec(range.lowSec)}–{formatSec(range.highSec)} — a range, not a point estimate.
          </p>
        )}
      </div>
      <div className="flex items-center" style={{ gap: SPACE_16 }}>
        {row.isStale && <span style={{ ...TYPE_CAPTION, color: WATCH }}>STALE</span>}
        <SimulateButton onClick={() => setRange(projectedRefreshRangeSec(row.sourceName))} />
      </div>
    </div>
  )
}

function SimulateButton({ onClick }: { onClick: () => void }) {
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
        color: NOMINAL,
        border: `${BORDER_WIDTH}px solid ${NOMINAL}`,
        borderRadius: RADIUS_INTERACTIVE,
        padding: `${SPACE_8}px ${SPACE_16}px`,
        ...focusRingStyle(focused),
      }}
    >
      SIMULATE REFRESH
    </button>
  )
}

function FloorCard({ floor, role }: { floor: ConfidenceFloor; role: Role }) {
  const [draftPct, setDraftPct] = useState(floor.currentFloorPct)
  const [confirmed, setConfirmed] = useState(false)
  const allowed = canDoOnPanel('staleness', role, 'change-confidence-floor')
  const previewBelowCount = floor.classConfidencesPct.filter((c) => c < draftPct).length
  const changed = draftPct !== floor.currentFloorPct

  return (
    <div style={{ padding: SPACE_16, background: PANEL_RAISED, borderRadius: RADIUS_STATIC, border: `${BORDER_WIDTH}px solid ${HAIRLINE}` }}>
      <p style={{ ...TYPE_BODY, color: TEXT_PRIMARY }}>{floor.className}</p>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
        Default {floor.defaultFloorPct}% · currently {floor.belowFloorCount} below floor · only {floor.whoMayChange} may change this.
      </p>
      <div className="flex items-center" style={{ gap: SPACE_8, marginTop: SPACE_16 }}>
        <input
          type="range"
          min={40}
          max={95}
          value={draftPct}
          onChange={(e) => {
            setDraftPct(Number(e.target.value))
            setConfirmed(false)
          }}
          disabled={!allowed}
          aria-label={`${floor.className} confidence floor`}
          style={{ flex: 1 }}
        />
        <span className="font-mono" style={{ ...TYPE_BODY, color: TEXT_SECONDARY, width: 40 }}>
          {draftPct}%
        </span>
      </div>
      {changed && (
        <p style={{ ...TYPE_CAPTION, color: previewBelowCount > floor.belowFloorCount ? ANOMALY : NOMINAL, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
          IMPACT PREVIEW: at {draftPct}%, {previewBelowCount} conclusion{previewBelowCount === 1 ? '' : 's'} would fall below the floor (currently{' '}
          {floor.belowFloorCount}).
        </p>
      )}
      <button
        type="button"
        disabled={!allowed || !changed || confirmed}
        title={!allowed ? disabledReasonOnPanel('staleness', role, 'change-confidence-floor') : undefined}
        onClick={() => setConfirmed(true)}
        className="pressable"
        style={{
          ...TYPE_CAPTION,
          textTransform: 'none',
          letterSpacing: 'normal',
          color: allowed && changed && !confirmed ? NOMINAL : TEXT_DIM,
          border: `${BORDER_WIDTH}px solid ${allowed && changed && !confirmed ? NOMINAL : HAIRLINE}`,
          borderRadius: RADIUS_INTERACTIVE,
          padding: `${SPACE_8}px ${SPACE_16}px`,
          marginTop: SPACE_16,
          cursor: allowed && changed && !confirmed ? 'pointer' : 'not-allowed',
        }}
      >
        {confirmed ? 'DONE — FLOOR CHANGED' : 'CONFIRM FLOOR CHANGE'}
      </button>
    </div>
  )
}
