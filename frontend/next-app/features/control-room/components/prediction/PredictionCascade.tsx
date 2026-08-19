'use client'

import { useMemo, useState, type ReactElement } from 'react'
import {
  ANOMALY,
  BORDER_WIDTH,
  HAIRLINE,
  PANEL_RAISED,
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
import type { CascadeDecision, CascadeStage, PredictionState } from '@/features/ase/services/prediction'
import { DirectManipulationSlider } from '@/features/control-room'

const DECISION_TAG_COLOR: Record<CascadeDecision['tag'], string> = { expected: TEXT_DIM, elevated: WATCH, critical: ANOMALY }

export function PredictionCascade({ state, machineId }: { state: PredictionState; machineId: string }): ReactElement {
  const p = state.predictions.get(machineId)
  const [vibration, setVibration] = useState(0)
  const [spindleTemp, setSpindleTemp] = useState(0)
  const [effectiveness, setEffectiveness] = useState(0)
  const [pressure, setPressure] = useState(0)

  const projection = useMemo(() => {
    if (!p) return null
    const oxygenSlowdown = Math.max(0, Math.round(vibration * 0.6 + Math.max(0, -spindleTemp) * 0.3))
    const latencyRise = Math.max(0, Math.round(vibration * 0.9 + effectiveness * 0.4))
    const complianceMinutes = Math.max(15, Math.round(180 - vibration * 2.2 - Math.max(0, -pressure) * 3))
    return { oxygenSlowdown, latencyRise, complianceMinutes }
  }, [p, vibration, spindleTemp, effectiveness, pressure])

  if (!p) return <p style={{ ...TYPE_BODY, color: TEXT_DIM }}>No prediction for this person.</p>

  return (
    <div>
      {p.cascade.length === 0 ? (
        <p style={{ ...TYPE_BODY, color: TEXT_DIM }}>No cascade stages for this person.</p>
      ) : (
        <div className="overflow-x-auto">
          <div className="flex" style={{ gap: SPACE_16, minWidth: 1100 }}>
            {p.cascade.map((stage) => (
              <StagePanel key={stage.key} stage={stage} />
            ))}
          </div>
        </div>
      )}

      <div
        style={{
          marginTop: SPACE_32,
          padding: SPACE_16,
          background: PANEL_RAISED,
          borderRadius: RADIUS_STATIC,
          border: `${BORDER_WIDTH}px solid ${HAIRLINE}`,
        }}
      >
        <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>WHAT IF THE WEATHER TURNS</p>
        <div className="grid grid-cols-4" style={{ gap: SPACE_24, marginTop: SPACE_16 }}>
          <SliderField label="Vibration" unit="mm/s" value={vibration} min={0} max={8} onChange={setVibration} />
          <SliderField label="Spindle temp" unit="°C" value={spindleTemp} min={0} max={30} onChange={setSpindleTemp} />
          <SliderField label="Effectiveness" unit="%" value={effectiveness} min={-40} max={0} onChange={setEffectiveness} negateForDisplay />
          <SliderField label="Pressure" unit="bar" value={pressure} min={-3} max={0} onChange={setPressure} />
        </div>
        {projection ? (
          <p style={{ ...TYPE_BODY, color: TEXT_PRIMARY, marginTop: SPACE_24, textTransform: 'none', letterSpacing: 'normal' }}>
            {`Body: oxygen recovery slows a further ${projection.oxygenSlowdown}%. Mind: response latency projected to rise another ${projection.latencyRise} seconds. Decisions: turnaround compliance falls below this operator's own threshold within ${projection.complianceMinutes} minutes.`}
          </p>
        ) : null}
      </div>
    </div>
  )
}

function SliderField({
  label,
  unit,
  value,
  min,
  max,
  onChange,
  negateForDisplay,
}: {
  label: string
  unit: string
  value: number
  min: number
  max: number
  onChange: (v: number) => void
  negateForDisplay?: boolean
}): ReactElement {
  const display = negateForDisplay ? -value : value
  return (
    <div>
      <div className="flex items-center justify-between">
        <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>{label.toUpperCase()}</p>
        <p className="font-mono" style={{ ...TYPE_BODY, color: TEXT_PRIMARY }}>
          {display > 0 ? '+' : ''}
          {display} {unit}
        </p>
      </div>
      <div style={{ marginTop: SPACE_8 }}>
        <DirectManipulationSlider
          value={value}
          min={min}
          max={max}
          step={1}
          onChange={onChange}
          ariaLabel={`${label} what-if delta`}
          accentColor={WATCH}
        />
      </div>
    </div>
  )
}

function StagePanel({ stage }: { stage: CascadeStage }): ReactElement {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 240,
        padding: SPACE_16,
        background: PANEL_RAISED,
        borderRadius: RADIUS_STATIC,
        border: `${BORDER_WIDTH}px solid ${HAIRLINE}`,
      }}
    >
      <p style={{ ...TYPE_DISPLAY, color: TEXT_PRIMARY, fontSize: 16 }}>{stage.label.toUpperCase()}</p>
      <div style={{ marginTop: SPACE_16 }}>
        {stage.metrics.map((m) => (
          <p key={m.label} style={{ ...TYPE_BODY, color: TEXT_SECONDARY, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
            {m.label} <span style={{ color: TEXT_PRIMARY }}>{m.valueText}</span>
            {m.deltaText ? <span style={{ color: TEXT_DIM }}> ({m.deltaText})</span> : null}
          </p>
        ))}
        {stage.decisions.map((d) => (
          <div key={d.label} className="flex items-center justify-between" style={{ marginTop: SPACE_8 }}>
            <span style={{ ...TYPE_BODY, color: TEXT_SECONDARY, textTransform: 'none', letterSpacing: 'normal' }}>{d.label}</span>
            <span style={{ ...TYPE_CAPTION, color: DECISION_TAG_COLOR[d.tag] }}>{d.tag}</span>
          </div>
        ))}
      </div>
      {stage.arrow ? (
        <div style={{ marginTop: SPACE_16, paddingTop: SPACE_16, borderTop: `${BORDER_WIDTH}px solid ${HAIRLINE}` }}>
          <p style={{ ...TYPE_BODY, color: TEXT_PRIMARY, textTransform: 'none', letterSpacing: 'normal' }}>
            {`↓ "${stage.arrow.sentence}"`}
          </p>
          <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
            authority: {stage.arrow.authority} · confidence:{' '}
            {stage.arrow.confidencePct >= 85 ? 'high' : stage.arrow.confidencePct >= 65 ? 'moderate-high' : 'moderate'}
            {stage.arrow.heldOf ? ` · held ${stage.arrow.heldOf.holds} of ${stage.arrow.heldOf.total} times` : ''}
          </p>
        </div>
      ) : null}
    </div>
  )
}
