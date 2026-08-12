import {
  ANOMALY,
  BORDER_WIDTH,
  HAIRLINE,
  NOMINAL,
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
} from '../../ase/tokens'
import { PREDICTED_LABEL, type PredictionState } from '../../ase/prediction'

// CALIBRATION — "build this or the tab is worthless." Misses render
// unfiltered, right beside the hits; the reliability diagram is the
// diagonal a real calibrated model actually earns; the limit is printed,
// not buried.
export function PredictionCalibration({ state }: { state: PredictionState }) {
  const { calibration, patternLibrary } = state

  return (
    <div>
      <ReliabilityDiagram reliability={calibration.reliability} totalResolvedCases={calibration.totalResolvedCases} />
      <ResolvedTable resolved={calibration.resolved} />
      <ByDriverTable byDriver={calibration.byDriver} />

      <p style={{ ...TYPE_BODY, color: TEXT_PRIMARY, marginTop: SPACE_32, padding: SPACE_16, background: PANEL_RAISED, borderRadius: RADIUS_STATIC, border: `${BORDER_WIDTH}px solid ${HAIRLINE}`, textTransform: 'none', letterSpacing: 'normal' }}>
        Trained on {calibration.totalResolvedCases} resolved cases. Accuracy improves with volume. Below 200 cases, treat these as advisory.
      </p>

      <PatternLibrarySection patternLibrary={patternLibrary} />
    </div>
  )
}

function ReliabilityDiagram({ reliability, totalResolvedCases }: { reliability: PredictionState['calibration']['reliability']; totalResolvedCases: number }) {
  const w = 320
  const h = 320
  const pad = 30
  const x = (pct: number) => pad + (pct / 100) * (w - pad * 2)
  const y = (pct: number) => h - pad - (pct / 100) * (h - pad * 2)
  const path = reliability.map((b, i) => `${i === 0 ? 'M' : 'L'} ${x(b.predictedPct)} ${y(b.observedPct)}`).join(' ')

  const near70 = reliability.reduce((best, b) => (Math.abs(b.predictedPct - 70) < Math.abs(best.predictedPct - 70) ? b : best), reliability[0])

  return (
    <div style={{ marginTop: SPACE_16 }}>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>RELIABILITY DIAGRAM</p>
      <div style={{ padding: SPACE_16, background: PANEL_RAISED, borderRadius: RADIUS_STATIC, border: `${BORDER_WIDTH}px solid ${HAIRLINE}`, marginTop: SPACE_16 }}>
        <svg width={w} height={h} role="img" aria-label="Reliability diagram — predicted probability against observed frequency">
          <line x1={pad} y1={h - pad} x2={w - pad} y2={pad} stroke={TEXT_DIM} strokeWidth={1} strokeDasharray="3 3" />
          <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke={HAIRLINE} strokeWidth={1} />
          <line x1={pad} y1={pad} x2={pad} y2={h - pad} stroke={HAIRLINE} strokeWidth={1} />
          <path d={path} fill="none" stroke={NOMINAL} strokeWidth={2} />
          {reliability.map((b) => (
            <circle key={b.predictedPct} cx={x(b.predictedPct)} cy={y(b.observedPct)} r={Math.max(2, Math.min(6, b.n / 4))} fill={NOMINAL} />
          ))}
          <text x={pad} y={h - 10} fill={TEXT_DIM} fontSize={10}>
            predicted %
          </text>
          <text x={4} y={pad} fill={TEXT_DIM} fontSize={10} transform={`rotate(-90 4 ${pad})`}>
            observed %
          </text>
        </svg>
        <p style={{ ...TYPE_BODY, color: TEXT_SECONDARY, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
          When ASE says 70%, it has been right {near70.observedPct}% of the time across {totalResolvedCases} resolved predictions.
        </p>
      </div>
    </div>
  )
}

function ResolvedTable({ resolved }: { resolved: PredictionState['calibration']['resolved'] }) {
  return (
    <div style={{ marginTop: SPACE_32 }}>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>RESOLVED PREDICTIONS</p>
      <div style={{ marginTop: SPACE_16, overflowX: 'auto' }}>
        <div style={{ minWidth: 1000 }}>
          <div className="flex items-center" style={{ ...TYPE_CAPTION, color: TEXT_DIM, borderBottom: `${BORDER_WIDTH}px solid ${HAIRLINE}`, paddingBottom: SPACE_8 }}>
            <span style={{ flex: 0.9 }}>DATE</span>
            <span style={{ flex: 1.4 }}>WHO</span>
            <span style={{ flex: 1.4 }}>PREDICTED</span>
            <span style={{ flex: 0.7 }}>WITHIN</span>
            <span style={{ flex: 0.8 }}>LIKELIHOOD</span>
            <span style={{ flex: 2.6 }}>WHAT HAPPENED</span>
            <span style={{ flex: 0.7 }}>CORRECT</span>
            <span style={{ flex: 2.2 }}>NOTES</span>
          </div>
          {resolved.map((r) => (
            <div key={r.id} className="flex items-center" style={{ padding: `${SPACE_8}px 0`, borderBottom: `${BORDER_WIDTH}px solid ${HAIRLINE}` }}>
              <span className="font-mono" style={{ flex: 0.9, ...TYPE_CAPTION, color: TEXT_DIM }}>
                {r.date}
              </span>
              <span style={{ flex: 1.4, ...TYPE_BODY, color: TEXT_PRIMARY }}>
                {r.who} <span className="font-mono" style={{ color: TEXT_DIM }}>{r.serial}</span>
              </span>
              <span style={{ flex: 1.4, ...TYPE_CAPTION, color: TEXT_SECONDARY, textTransform: 'none', letterSpacing: 'normal' }}>{PREDICTED_LABEL[r.predicted]}</span>
              <span className="font-mono" style={{ flex: 0.7, ...TYPE_BODY, color: TEXT_SECONDARY }}>
                {r.withinHours}h
              </span>
              <span className="font-mono" style={{ flex: 0.8, ...TYPE_BODY, color: TEXT_SECONDARY }}>
                {r.likelihoodPct}%
              </span>
              <span style={{ flex: 2.6, ...TYPE_BODY, color: TEXT_SECONDARY, textTransform: 'none', letterSpacing: 'normal' }}>{r.whatHappened}</span>
              <span style={{ flex: 0.7, ...TYPE_CAPTION, color: r.correct ? NOMINAL : ANOMALY }}>{r.correct ? 'YES' : 'NO'}</span>
              <span style={{ flex: 2.2, ...TYPE_CAPTION, color: TEXT_DIM, textTransform: 'none', letterSpacing: 'normal' }}>{r.notes}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function ByDriverTable({ byDriver }: { byDriver: PredictionState['calibration']['byDriver'] }) {
  return (
    <div style={{ marginTop: SPACE_32 }}>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>BY DRIVER</p>
      <div style={{ marginTop: SPACE_16 }}>
        {byDriver.map((d) => (
          <div key={d.driver} className="flex items-center justify-between" style={{ padding: `${SPACE_8}px 0`, borderBottom: `${BORDER_WIDTH}px solid ${HAIRLINE}` }}>
            <span style={{ flex: 2, ...TYPE_BODY, color: TEXT_PRIMARY, textTransform: 'none', letterSpacing: 'normal' }}>{d.driver}</span>
            <span className="font-mono" style={{ flex: 0.6, ...TYPE_BODY, color: TEXT_PRIMARY }}>
              {d.accuracyPct}%
            </span>
            <span className="font-mono" style={{ flex: 0.5, ...TYPE_CAPTION, color: TEXT_DIM }}>
              n={d.n}
            </span>
            <span style={{ flex: 2, ...TYPE_CAPTION, color: TEXT_DIM, textTransform: 'none', letterSpacing: 'normal' }}>{d.note}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function PatternLibrarySection({ patternLibrary }: { patternLibrary: PredictionState['patternLibrary'] }) {
  return (
    <div style={{ marginTop: SPACE_32 }}>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>PATTERN LIBRARY</p>
      <div className="grid grid-cols-2" style={{ gap: SPACE_16, marginTop: SPACE_16 }}>
        {patternLibrary.map((entry) => (
          <div key={entry.key} style={{ padding: SPACE_16, background: PANEL_RAISED, borderRadius: RADIUS_STATIC, border: `${BORDER_WIDTH}px solid ${HAIRLINE}` }}>
            <p style={{ ...TYPE_BODY, color: TEXT_PRIMARY, fontWeight: 600 }}>{entry.name}</p>
            <p style={{ ...TYPE_BODY, color: TEXT_SECONDARY, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>{entry.description}</p>
            <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>triggers: {entry.triggers.join(', ')}</p>
            <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>markers: {entry.observableMarkers.join(', ')}</p>
            <div className="flex items-center" style={{ gap: SPACE_24, marginTop: SPACE_8 }}>
              <span style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>freq {entry.frequencyPct}%</span>
              <span style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>accuracy {entry.accuracyWhenPredictedPct}%</span>
            </div>
            <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>typically appears: {entry.typicalTimeToAppear}</p>
            <p style={{ ...TYPE_BODY, color: NOMINAL, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>mitigation: {entry.mitigation}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
