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
  SPACE_16,
  SPACE_24,
  SPACE_32,
  SPACE_8,
  TEXT_DIM,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  TYPE_BODY,
  TYPE_CAPTION,
  TYPE_DISPLAY,
  WATCH,
} from '@/features/ase/tokens'
import {
  decisionBandForCapacity,
  RADAR_AXIS_LABEL,
  sumContributions,
  type CognitiveIndicator,
  type PredictionState,
  type RadarAxes,
} from '@/features/ase/services/prediction'
import { maskedSerial } from '@/features/ase/services/serial'
import { RatingRing, SegmentedBar } from '@/features/control-room'

const BAND_COLOR: Record<ReturnType<typeof decisionBandForCapacity>, string> = {
  READY: NOMINAL,
  WATCH: WATCH,
  IMPAIRED: WATCH,
  'REQUIRES DESCENT': ANOMALY,
}

function readinessScore(current: RadarAxes): number {
  const values = Object.values(current)
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length)
}

export function PredictionProfile({
  state,
  climberId,
  onSelectPerson,
}: {
  state: PredictionState
  climberId: string
  onSelectPerson: (climberId: string) => void
}): ReactElement {
  const p = state.predictions.get(climberId)
  if (!p) return <p style={{ ...TYPE_BODY, color: TEXT_DIM }}>No prediction for this person.</p>

  const overall = readinessScore(p.current)
  const band = decisionBandForCapacity(overall)
  const partnerId = p.human.partnerClimberId

  return (
    <div>
      <RatingCard name={p.name} serial={p.serial} overall={overall} band={band} />
      <RadarSection baseline={p.baseline} current={p.current} />
      <AttributeBars baseline={p.baseline} current={p.current} />
      <CognitiveStateTable indicators={p.cognitive.indicators} decisionCapacity={p.cognitive.decisionCapacity} />
      {partnerId ? (
        <button
          type="button"
          onClick={() => onSelectPerson(partnerId)}
          className="pressable"
          style={{ ...TYPE_CAPTION, color: TEXT_DIM, textDecoration: 'underline', marginTop: SPACE_16 }}
        >
          {`View ${p.human.partnerName}'s profile`}
        </button>
      ) : null}
    </div>
  )
}

function RatingCard({
  name,
  serial,
  overall,
  band,
}: {
  name: string
  serial: string
  overall: number
  band: ReturnType<typeof decisionBandForCapacity>
}): ReactElement {
  return (
    <div
      className="flex items-center justify-between"
      style={{
        padding: SPACE_24,
        background: PANEL_RAISED,
        borderRadius: RADIUS_STATIC,
        border: `${BORDER_WIDTH}px solid ${HAIRLINE}`,
      }}
    >
      <div>
        <p style={{ ...TYPE_DISPLAY, color: TEXT_PRIMARY }}>{name}</p>
        <p className="font-mono" style={{ ...TYPE_BODY, color: TEXT_DIM, marginTop: SPACE_8 }}>
          {maskedSerial(serial)}
        </p>
      </div>
      <div className="flex items-center" style={{ gap: SPACE_16 }}>
        <div style={{ textAlign: 'right' }}>
          <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>READINESS</p>
          <p style={{ ...TYPE_CAPTION, color: BAND_COLOR[band], marginTop: SPACE_8 }}>{band}</p>
        </div>
        <RatingRing pct={overall} color={BAND_COLOR[band]} />
      </div>
    </div>
  )
}

const RADAR_KEYS: (keyof RadarAxes)[] = [
  'acclimatisation',
  'cardiacReserve',
  'oxygenEfficiency',
  'ascentDiscipline',
  'cognitiveState',
  'exposureLoad',
]

function polarPoint(cx: number, cy: number, radius: number, index: number, total: number): [number, number] {
  const angle = (index / total) * Math.PI * 2 - Math.PI / 2
  return [cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius]
}

function RadarSection({ baseline, current }: { baseline: RadarAxes; current: RadarAxes }): ReactElement {
  const cx = 140
  const cy = 140
  const maxR = 105

  function polygon(axes: RadarAxes): string {
    return RADAR_KEYS.map((k, i) => {
      const frac = Math.min(1, axes[k] / 100)
      const [x, y] = polarPoint(cx, cy, frac * maxR, i, RADAR_KEYS.length)
      return `${x},${y}`
    }).join(' ')
  }

  return (
    <div style={{ marginTop: SPACE_32 }}>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>PHYSIOLOGICAL AND COGNITIVE PROFILE</p>
      <div
        style={{
          padding: SPACE_16,
          background: PANEL_RAISED,
          borderRadius: RADIUS_STATIC,
          border: `${BORDER_WIDTH}px solid ${HAIRLINE}`,
          marginTop: SPACE_16,
        }}
      >
        <svg viewBox="0 0 280 300" width="100%" height={320} role="img" aria-label="Physiological and cognitive radar, current against own baseline">
          {[0.25, 0.5, 0.75, 1].map((frac) => (
            <polygon
              key={frac}
              points={RADAR_KEYS.map((_, i) => polarPoint(cx, cy, frac * maxR, i, RADAR_KEYS.length).join(',')).join(' ')}
              fill="none"
              stroke={HAIRLINE}
              strokeWidth={1}
            />
          ))}
          {RADAR_KEYS.map((k, i) => {
            const [x, y] = polarPoint(cx, cy, maxR, i, RADAR_KEYS.length)
            return <line key={k} x1={cx} y1={cy} x2={x} y2={y} stroke={HAIRLINE} strokeWidth={1} />
          })}
          {RADAR_KEYS.map((k, i) => {
            const [x, y] = polarPoint(cx, cy, maxR + 18, i, RADAR_KEYS.length)
            return (
              <text key={k} x={x} y={y} textAnchor="middle" fill={TEXT_DIM} fontSize={10}>
                {RADAR_AXIS_LABEL[k]}
              </text>
            )
          })}
          <polygon points={polygon(baseline)} fill={TEXT_DIM} fillOpacity={0.08} stroke={TEXT_DIM} strokeWidth={1.5} strokeDasharray="4 3" />
          <polygon points={polygon(current)} fill={NOMINAL} fillOpacity={0.14} stroke={NOMINAL} strokeWidth={2} />
        </svg>
        <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
          The shaded area is where you were at Camp II. The solid line is now.
        </p>
      </div>
    </div>
  )
}

function AttributeBars({ baseline, current }: { baseline: RadarAxes; current: RadarAxes }): ReactElement {
  return (
    <div style={{ marginTop: SPACE_32 }}>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>ATTRIBUTE BARS</p>
      <div style={{ marginTop: SPACE_16 }}>
        {RADAR_KEYS.map((k) => {
          const delta = current[k] - baseline[k]
          const deltaLabel =
            delta === 0
              ? 'no change from your Camp II reading'
              : `${delta > 0 ? delta : -delta} ${delta > 0 ? 'above' : 'below'} your Camp II reading`
          return (
            <SegmentedBar
              key={k}
              label={RADAR_AXIS_LABEL[k]}
              value={current[k]}
              max={100}
              valueLabel={`${current[k]}%`}
              percentileLabel={deltaLabel}
              filledColor={delta < -10 ? WATCH : NOMINAL}
            />
          )
        })}
      </div>
    </div>
  )
}

function CognitiveStateTable({
  indicators,
  decisionCapacity,
}: {
  indicators: CognitiveIndicator[]
  decisionCapacity: number
}): ReactElement {
  const [openTooltip, setOpenTooltip] = useState<string | null>(null)
  const total = sumContributions(indicators)
  const deficit = 100 - decisionCapacity

  return (
    <div style={{ marginTop: SPACE_32 }}>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>COGNITIVE STATE</p>
      <p style={{ ...TYPE_BODY, color: TEXT_SECONDARY, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
        Inferred from observable behaviour, not brain activity.
      </p>
      {indicators.length === 0 ? (
        <p style={{ ...TYPE_BODY, color: TEXT_DIM, marginTop: SPACE_16 }}>No cognitive indicators for this person.</p>
      ) : (
        <div style={{ marginTop: SPACE_16, overflowX: 'auto' }}>
          <div style={{ minWidth: 720 }}>
            <div
              className="flex items-center"
              style={{ ...TYPE_CAPTION, color: TEXT_DIM, borderBottom: `${BORDER_WIDTH}px solid ${HAIRLINE}`, paddingBottom: SPACE_8 }}
            >
              <span style={{ flex: 2.2 }}>INDICATOR</span>
              <span style={{ flex: 1 }}>CURRENT</span>
              <span style={{ flex: 1 }}>VS BASELINE</span>
              <span style={{ flex: 1 }}>CONTRIBUTION</span>
            </div>
            {indicators.map((ind) => (
              <div
                key={ind.key}
                className="relative flex items-center"
                onMouseEnter={() => setOpenTooltip(ind.key)}
                onMouseLeave={() => setOpenTooltip((k) => (k === ind.key ? null : k))}
                style={{ padding: `${SPACE_8}px 0`, borderBottom: `${BORDER_WIDTH}px solid ${HAIRLINE}` }}
              >
                <span style={{ flex: 2.2, ...TYPE_BODY, color: TEXT_PRIMARY }}>{ind.label}</span>
                <span className="font-mono" style={{ flex: 1, ...TYPE_BODY, color: TEXT_SECONDARY }}>
                  {ind.current}
                </span>
                <span className="font-mono" style={{ flex: 1, ...TYPE_BODY, color: TEXT_DIM }}>
                  {ind.vsBaseline}
                </span>
                <span className="font-mono" style={{ flex: 1, ...TYPE_BODY, color: WATCH }}>
                  +{ind.contributionPts}%
                </span>
                {openTooltip === ind.key ? (
                  <div
                    className="absolute"
                    style={{
                      left: 0,
                      top: '100%',
                      marginTop: 2,
                      zIndex: 10,
                      background: PANEL_RAISED,
                      border: `${BORDER_WIDTH}px solid ${HAIRLINE}`,
                      borderRadius: RADIUS_INTERACTIVE,
                      padding: SPACE_8,
                      maxWidth: 420,
                    }}
                  >
                    <p style={{ ...TYPE_CAPTION, color: TEXT_SECONDARY, textTransform: 'none', letterSpacing: 'normal' }}>
                      {ind.tooltip}
                    </p>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      )}
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
        Contributions total {total} of {deficit} points below a 100-point baseline — computed, not authored.
      </p>
    </div>
  )
}
