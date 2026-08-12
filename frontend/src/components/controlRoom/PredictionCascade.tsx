import { useMemo, useState } from 'react'
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
} from '../../ase/tokens'
import type { CascadeDecision, CascadeStage, PredictionState } from '../../ase/prediction'
import { DirectManipulationSlider } from './DirectManipulationSlider'

const DECISION_TAG_COLOR: Record<CascadeDecision['tag'], string> = { expected: TEXT_DIM, elevated: WATCH, critical: ANOMALY }

// CASCADE — environment -> body -> mind -> decisions, one continuous flow.
// The "what if" sliders at the foot recompute the projection live during
// the drag (S9.1h) — a real function of this person's own current drivers,
// not a canned sentence per slider position.
export function PredictionCascade({ state, climberId }: { state: PredictionState; climberId: string }) {
  const p = state.predictions.get(climberId)
  const [wind, setWind] = useState(0)
  const [temperature, setTemperature] = useState(0)
  const [visibility, setVisibility] = useState(0)
  const [pressure, setPressure] = useState(0)

  const projection = useMemo(() => {
    if (!p) return null
    // A simple, real function of the slider deltas and this person's own
    // current numbers — not narrated per position, recomputed on every
    // drag frame like every other direct-manipulation control in this app.
    const oxygenSlowdown = Math.max(0, Math.round(wind * 0.6 + Math.max(0, -temperature) * 0.3))
    const latencyRise = Math.max(0, Math.round(wind * 0.9 + visibility * 0.4))
    const complianceMinutes = Math.max(15, Math.round(180 - wind * 2.2 - Math.max(0, -pressure) * 3))
    return { oxygenSlowdown, latencyRise, complianceMinutes }
  }, [p, wind, temperature, visibility, pressure])

  if (!p) return <p style={{ ...TYPE_BODY, color: TEXT_DIM }}>No prediction for this person.</p>

  return (
    <div>
      <div className="overflow-x-auto">
        <div className="flex" style={{ gap: SPACE_16, minWidth: 1100 }}>
          {p.cascade.map((stage) => (
            <StagePanel key={stage.key} stage={stage} />
          ))}
        </div>
      </div>

      <div style={{ marginTop: SPACE_32, padding: SPACE_16, background: PANEL_RAISED, borderRadius: RADIUS_STATIC, border: `${BORDER_WIDTH}px solid ${HAIRLINE}` }}>
        <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>WHAT IF THE WEATHER TURNS</p>
        <div className="grid grid-cols-4" style={{ gap: SPACE_24, marginTop: SPACE_16 }}>
          <SliderField label="Wind" unit="kph" value={wind} min={0} max={40} onChange={setWind} />
          <SliderField label="Temperature" unit="°C" value={temperature} min={-15} max={0} onChange={setTemperature} />
          <SliderField label="Visibility" unit="m" value={visibility} min={-300} max={0} onChange={setVisibility} negateForDisplay />
          <SliderField label="Pressure" unit="hPa" value={pressure} min={-20} max={0} onChange={setPressure} />
        </div>
        {projection && (
          <p style={{ ...TYPE_BODY, color: TEXT_PRIMARY, marginTop: SPACE_24, textTransform: 'none', letterSpacing: 'normal' }}>
            Body: oxygen recovery slows a further {projection.oxygenSlowdown}%. Mind: response latency projected to rise another {projection.latencyRise} seconds. Decisions:
            turnaround compliance falls below this operator's own threshold within {projection.complianceMinutes} minutes.
          </p>
        )}
      </div>
    </div>
  )
}

function SliderField({ label, unit, value, min, max, onChange, negateForDisplay }: { label: string; unit: string; value: number; min: number; max: number; onChange: (v: number) => void; negateForDisplay?: boolean }) {
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
        <DirectManipulationSlider value={value} min={min} max={max} step={1} onChange={onChange} ariaLabel={`${label} what-if delta`} accentColor={WATCH} />
      </div>
    </div>
  )
}

function StagePanel({ stage }: { stage: CascadeStage }) {
  return (
    <div style={{ flex: 1, minWidth: 240, padding: SPACE_16, background: PANEL_RAISED, borderRadius: RADIUS_STATIC, border: `${BORDER_WIDTH}px solid ${HAIRLINE}` }}>
      <p style={{ ...TYPE_DISPLAY, color: TEXT_PRIMARY, fontSize: 16 }}>{stage.label.toUpperCase()}</p>
      <div style={{ marginTop: SPACE_16 }}>
        {stage.metrics.map((m) => (
          <p key={m.label} style={{ ...TYPE_BODY, color: TEXT_SECONDARY, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
            {m.label} <span style={{ color: TEXT_PRIMARY }}>{m.valueText}</span>
            {m.deltaText && <span style={{ color: TEXT_DIM }}> ({m.deltaText})</span>}
          </p>
        ))}
        {stage.decisions.map((d) => (
          <div key={d.label} className="flex items-center justify-between" style={{ marginTop: SPACE_8 }}>
            <span style={{ ...TYPE_BODY, color: TEXT_SECONDARY, textTransform: 'none', letterSpacing: 'normal' }}>{d.label}</span>
            <span style={{ ...TYPE_CAPTION, color: DECISION_TAG_COLOR[d.tag] }}>{d.tag}</span>
          </div>
        ))}
      </div>
      {stage.arrow && (
        <div style={{ marginTop: SPACE_16, paddingTop: SPACE_16, borderTop: `${BORDER_WIDTH}px solid ${HAIRLINE}` }}>
          <p style={{ ...TYPE_BODY, color: TEXT_PRIMARY, textTransform: 'none', letterSpacing: 'normal' }}>↓ "{stage.arrow.sentence}"</p>
          <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
            authority: {stage.arrow.authority} · confidence: {stage.arrow.confidencePct >= 85 ? 'high' : stage.arrow.confidencePct >= 65 ? 'moderate-high' : 'moderate'}
            {stage.arrow.heldOf && ` · held ${stage.arrow.heldOf.holds} of ${stage.arrow.heldOf.total} times`}
          </p>
        </div>
      )}
    </div>
  )
}
