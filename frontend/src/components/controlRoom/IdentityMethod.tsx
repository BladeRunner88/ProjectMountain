import { useMemo, useState } from 'react'
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
  VERIFIED,
  WATCH,
} from '../../ase/tokens'
import { focusRingStyle, useFocusRing } from './focusRing'
import { DirectManipulationSlider } from './DirectManipulationSlider'
import { maskedSerial } from '../../ase/serial'
import {
  compositeScore,
  confusionMatrix,
  DEFAULT_THRESHOLDS,
  DEFAULT_WEIGHTS,
  decisionBand,
  precision,
  recall,
  type BlockingKeyStats,
  type DecisionThresholds,
  type EntityResolutionData,
  type ScoringWeights,
} from '../../ase/entityResolution'

const WEIGHT_CARDS: { key: keyof ScoringWeights; label: string; whatItTests: string }[] = [
  { key: 'passportExact', label: 'Passport matches exactly', whatItTests: 'The two records carry the same hashed passport number.' },
  { key: 'nameJaro', label: 'Name similarity', whatItTests: 'Jaro similarity between the two recorded names.' },
  { key: 'sameOperator', label: 'Same operator', whatItTests: 'Both records list the same guiding operator.' },
  { key: 'dobWithinTwoDays', label: 'DOB within two days', whatItTests: 'The two recorded dates of birth fall within two days of each other.' },
]
const RADAR_MAX = 0.8

export function IdentityMethod({
  data,
  weights,
  onChangeWeights,
  thresholds,
  onChangeThresholds,
}: {
  data: EntityResolutionData
  weights: ScoringWeights
  onChangeWeights: (w: ScoringWeights) => void
  thresholds: DecisionThresholds
  onChangeThresholds: (t: DecisionThresholds) => void
}) {
  return (
    <div>
      <p style={{ ...TYPE_BODY, color: TEXT_SECONDARY }}>
        How ASE matches records — global, not about any one person selected in List.
      </p>

      <WorkedExampleSection data={data} />
      <MatchRuleCards weights={weights} onChangeWeights={onChangeWeights} thresholds={thresholds} groundTruth={data.groundTruthPairs} />
      <BlockingSection data={data} />
      <ThresholdsSection data={data} weights={weights} thresholds={thresholds} onChangeThresholds={onChangeThresholds} />
    </div>
  )
}

// -- WORKED EXAMPLE ------------------------------------------------------------

/** S9.5b: what the identity record's "source records merged" figure actually counts — the cluster that produced one real ASE serial, not a narrated total. */
function WorkedExampleSection({ data }: { data: EntityResolutionData }) {
  const { worked } = data
  return (
    <div style={{ marginTop: SPACE_32 }}>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>WORKED EXAMPLE — {worked.label.toUpperCase()}</p>
      <div style={{ marginTop: SPACE_16, padding: SPACE_16, background: PANEL_RAISED, borderRadius: RADIUS_STATIC }}>
        <p style={{ ...TYPE_BODY, color: TEXT_SECONDARY }}>
          {worked.records.length} source records, three different spellings of the same name, merged into one identity.
        </p>
        <div className="grid grid-cols-3" style={{ gap: SPACE_16, marginTop: SPACE_16 }}>
          {worked.records.map((r) => (
            <div key={r.id} style={{ padding: SPACE_16, border: `${BORDER_WIDTH}px solid ${HAIRLINE}`, borderRadius: RADIUS_STATIC }}>
              <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>{r.source.toUpperCase()}</p>
              <p className="font-mono" style={{ ...TYPE_BODY, color: TEXT_PRIMARY, marginTop: SPACE_8 }}>
                {r.name.value}
              </p>
              <p style={{ ...TYPE_BODY, color: TEXT_SECONDARY, marginTop: SPACE_8 }}>
                DOB {r.dobIso} · {r.operatorName}
              </p>
            </div>
          ))}
        </div>
        <div style={{ marginTop: SPACE_16 }}>
          {worked.pairwiseScores.map((p) => (
            <p key={`${p.aLabel}-${p.bLabel}`} style={{ ...TYPE_BODY, color: TEXT_SECONDARY }}>
              {p.aLabel} ↔ {p.bLabel}: {Math.round(p.score * 100)}% match
            </p>
          ))}
        </div>
        <p style={{ ...TYPE_BODY, color: TEXT_PRIMARY, marginTop: SPACE_16 }}>
          Merged as <span className="font-mono">{worked.merged.value}</span>
          {worked.serial ? (
            <>
              {' '}
              — issued serial <span className="font-mono">{maskedSerial(worked.serial.value)}</span>
            </>
          ) : (
            ' — no serial issued yet.'
          )}
        </p>
      </div>
    </div>
  )
}

// -- MATCH RULE CARDS + RADAR -------------------------------------------------

function MatchRuleCards({
  weights,
  onChangeWeights,
  thresholds,
  groundTruth,
}: {
  weights: ScoringWeights
  onChangeWeights: (w: ScoringWeights) => void
  thresholds: DecisionThresholds
  groundTruth: EntityResolutionData['groundTruthPairs']
}) {
  const flipped = useMemo(() => {
    let count = 0
    for (const p of groundTruth) {
      const defaultBand = decisionBand(compositeScore(p.fields, DEFAULT_WEIGHTS), thresholds)
      const currentBand = decisionBand(compositeScore(p.fields, weights), thresholds)
      if (defaultBand !== currentBand) count++
    }
    return count
  }, [groundTruth, weights, thresholds])

  return (
    <div style={{ marginTop: SPACE_24 }}>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>MATCH RULE CARDS</p>
      <div className="grid grid-cols-2" style={{ gap: SPACE_16, marginTop: SPACE_16 }}>
        <div className="grid grid-cols-2" style={{ gap: SPACE_16 }}>
          {WEIGHT_CARDS.map((w) => (
            <WeightCard
              key={w.key}
              label={w.label}
              whatItTests={w.whatItTests}
              value={weights[w.key]}
              onChange={(v) => onChangeWeights({ ...weights, [w.key]: v })}
            />
          ))}
        </div>
        <RadarChart weights={weights} />
      </div>

      <div style={{ marginTop: SPACE_16, padding: SPACE_16, background: PANEL_RAISED, borderRadius: RADIUS_STATIC }}>
        <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>DECISIONS FLIPPED VS. DEFAULT WEIGHTS</p>
        <p className="font-mono" style={{ ...TYPE_DISPLAY, color: flipped > 0 ? WATCH : TEXT_PRIMARY, marginTop: SPACE_8 }}>
          {flipped}
        </p>
        <p style={{ ...TYPE_BODY, color: TEXT_SECONDARY, marginTop: SPACE_8 }}>
          of {groundTruth.length} known pairs, at the current DECISION thresholds ({Math.round(thresholds.autoMerge * 100)}% /{' '}
          {Math.round(thresholds.reject * 100)}%).
        </p>
      </div>
    </div>
  )
}

function WeightCard({ label, whatItTests, value, onChange }: { label: string; whatItTests: string; value: number; onChange: (v: number) => void }) {
  const pct = Math.round(value * 100)
  return (
    <div style={{ padding: SPACE_16, background: PANEL_RAISED, borderRadius: RADIUS_STATIC, border: `${BORDER_WIDTH}px solid ${HAIRLINE}` }}>
      <p style={{ ...TYPE_BODY, color: TEXT_PRIMARY }}>{label}</p>
      <p className="font-mono" style={{ ...TYPE_DISPLAY, color: TEXT_PRIMARY, marginTop: SPACE_8 }}>
        +{pct.toFixed(1)}%
      </p>
      <div style={{ marginTop: SPACE_16 }}>
        <DirectManipulationSlider
          value={pct}
          min={0}
          max={80}
          step={1}
          onChange={(v) => onChange(v / 100)}
          ariaLabel={`${label} weight`}
          accentColor={VERIFIED}
        />
      </div>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>{whatItTests}</p>
    </div>
  )
}

function polarPoint(cx: number, cy: number, radius: number, index: number, total: number): [number, number] {
  const angle = (index / total) * Math.PI * 2 - Math.PI / 2
  return [cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius]
}

function RadarChart({ weights }: { weights: ScoringWeights }) {
  const cx = 130
  const cy = 130
  const maxR = 100
  const axes = WEIGHT_CARDS.map((w) => w.key)

  function polygon(values: ScoringWeights): string {
    return axes
      .map((key, i) => {
        const frac = Math.min(1, values[key] / RADAR_MAX)
        const [x, y] = polarPoint(cx, cy, frac * maxR, i, axes.length)
        return `${x},${y}`
      })
      .join(' ')
  }

  return (
    <div style={{ padding: SPACE_16, background: PANEL_RAISED, borderRadius: RADIUS_STATIC, border: `${BORDER_WIDTH}px solid ${HAIRLINE}` }}>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>WEIGHT PROFILE</p>
      <svg viewBox="0 0 260 260" width="100%" height={220} role="img" aria-label="Weight profile radar chart">
        {[0.25, 0.5, 0.75, 1].map((frac) => (
          <polygon
            key={frac}
            points={axes.map((_, i) => polarPoint(cx, cy, frac * maxR, i, axes.length).join(',')).join(' ')}
            fill="none"
            stroke={HAIRLINE}
            strokeWidth={1}
          />
        ))}
        {axes.map((_, i) => {
          const [x, y] = polarPoint(cx, cy, maxR, i, axes.length)
          return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke={HAIRLINE} strokeWidth={1} />
        })}
        <polygon points={polygon(DEFAULT_WEIGHTS)} fill="none" stroke={TEXT_DIM} strokeWidth={1.5} strokeDasharray="4 3" />
        {/* S9.1h: never `transition: all` — only `points` actually changes here (a drag recomputing the polygon shape live). */}
        <polygon points={polygon(weights)} fill={VERIFIED} fillOpacity={0.12} stroke={VERIFIED} strokeWidth={2} style={{ transition: 'points 120ms var(--cr-ease-out)' }} />
      </svg>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
        Solid — current weights. Dim outline — default.
      </p>
    </div>
  )
}

// -- BLOCKING -----------------------------------------------------------------

function BlockingSection({ data }: { data: EntityResolutionData }) {
  const [selectedKey, setSelectedKey] = useState<'tight' | 'loose'>('tight')
  const active = data.blockingKeys.find((k) => k.key === selectedKey)!
  const eliminated = data.possiblePairs - active.comparisons
  const eliminatedPct = Math.round((eliminated / data.possiblePairs) * 100)

  return (
    <div style={{ marginTop: SPACE_32 }}>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>BLOCKING KEY</p>
      <div className="flex" style={{ gap: SPACE_8, marginTop: SPACE_16 }}>
        {data.blockingKeys.map((k) => (
          <KeyPill key={k.key} stats={k} active={k.key === selectedKey} onClick={() => setSelectedKey(k.key)} />
        ))}
      </div>

      <div style={{ marginTop: SPACE_16, padding: SPACE_16, background: PANEL_RAISED, borderRadius: RADIUS_STATIC }}>
        <p style={{ ...TYPE_BODY, color: TEXT_PRIMARY }}>
          {data.possiblePairs.toLocaleString()} possible pairs reduced to {active.comparisons.toLocaleString()} comparisons — {eliminatedPct}%
          eliminated before scoring.
        </p>
        <p style={{ ...TYPE_BODY, color: TEXT_SECONDARY, marginTop: SPACE_8 }}>{active.description}</p>
      </div>

      <div className="grid grid-cols-2" style={{ gap: SPACE_16, marginTop: SPACE_16 }}>
        {data.blockingKeys.map((k) => (
          <div key={k.key} style={{ padding: SPACE_16, background: PANEL_RAISED, borderRadius: RADIUS_STATIC }}>
            <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>
              {k.key === 'tight' ? 'TIGHT — ' : 'LOOSE — '}
              {k.label.toUpperCase()}
            </p>
            <p className="font-mono" style={{ ...TYPE_DISPLAY, color: TEXT_PRIMARY, marginTop: SPACE_8 }}>
              {k.comparisons.toLocaleString()}
            </p>
            <p style={{ ...TYPE_BODY, color: TEXT_SECONDARY, marginTop: SPACE_8 }}>comparisons, {k.recallPct}% recall against the 60 known pairs</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function KeyPill({ stats, active, onClick }: { stats: BlockingKeyStats; active: boolean; onClick: () => void }) {
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
        border: `${BORDER_WIDTH}px solid ${active ? VERIFIED : HAIRLINE}`,
        borderRadius: RADIUS_INTERACTIVE,
        padding: `${SPACE_8}px ${SPACE_16}px`,
        ...focusRingStyle(focused),
      }}
    >
      {stats.label}
    </button>
  )
}

// -- THRESHOLDS + CONFUSION MATRIX --------------------------------------------

function ThresholdsSection({
  data,
  weights,
  thresholds,
  onChangeThresholds,
}: {
  data: EntityResolutionData
  weights: ScoringWeights
  thresholds: DecisionThresholds
  onChangeThresholds: (t: DecisionThresholds) => void
}) {
  const scoredPairs = useMemo(
    () => data.groundTruthPairs.map((p) => ({ id: p.id, score: compositeScore(p.fields, weights), isTrueMatch: p.isTrueMatch })),
    [data.groundTruthPairs, weights]
  )
  const matrix = useMemo(() => confusionMatrix(scoredPairs, thresholds.autoMerge), [scoredPairs, thresholds.autoMerge])
  const defaultMatrix = useMemo(() => confusionMatrix(scoredPairs, DEFAULT_THRESHOLDS.autoMerge), [scoredPairs])
  const currentPrecision = Math.round(precision(matrix) * 100)
  const currentRecall = Math.round(recall(matrix) * 100)
  const defaultPrecision = Math.round(precision(defaultMatrix) * 100)
  const currentAutoCount = matrix.truePositive + matrix.falsePositive
  const defaultAutoCount = defaultMatrix.truePositive + defaultMatrix.falsePositive
  const affected = currentAutoCount - defaultAutoCount
  const reviewCount = scoredPairs.filter((p) => decisionBand(p.score, thresholds) === 'human').length

  return (
    <div style={{ marginTop: SPACE_32 }}>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>THRESHOLDS</p>
      <div style={{ marginTop: SPACE_16 }}>
        <ThresholdSlider
          label="Auto-merge at or above"
          value={thresholds.autoMerge}
          min={thresholds.reject}
          max={0.98}
          onChange={(v) => onChangeThresholds({ ...thresholds, autoMerge: v })}
        />
        <ThresholdSlider
          label="Reject below"
          value={thresholds.reject}
          min={0.5}
          max={thresholds.autoMerge}
          onChange={(v) => onChangeThresholds({ ...thresholds, reject: v })}
        />
      </div>

      <p style={{ ...TYPE_BODY, color: TEXT_SECONDARY, marginTop: SPACE_16 }}>
        ≥{Math.round(thresholds.autoMerge * 100)}% auto-merge · {Math.round(thresholds.reject * 100)}–{Math.round(thresholds.autoMerge * 100)}%
        human · &lt;{Math.round(thresholds.reject * 100)}% reject. {reviewCount} of {scoredPairs.length} known pairs currently await review.
      </p>

      <div className="grid grid-cols-2" style={{ gap: SPACE_16, marginTop: SPACE_24 }}>
        <MetricCard label="Precision" value={`${currentPrecision}%`} sub={`${matrix.truePositive} correct of ${currentAutoCount} auto-merged`} />
        <MetricCard label="Recall" value={`${currentRecall}%`} sub={`${matrix.truePositive} of ${matrix.truePositive + matrix.falseNegative} true matches found`} />
      </div>

      {affected !== 0 && (
        <p style={{ ...TYPE_BODY, color: WATCH, marginTop: SPACE_16 }}>
          {Math.abs(affected)} {Math.abs(affected) === 1 ? 'person' : 'people'} moved {affected > 0 ? 'into' : 'out of'} auto-merge versus the
          default {Math.round(DEFAULT_THRESHOLDS.autoMerge * 100)}% threshold — precision {affected > 0 ? 'fell' : 'rose'} from {defaultPrecision}%
          to {currentPrecision}%.
        </p>
      )}

      <div style={{ marginTop: SPACE_32 }}>
        <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>CONFUSION MATRIX</p>
        <div className="grid grid-cols-2" style={{ gap: SPACE_8, marginTop: SPACE_16 }}>
          <ConfusionCell label="True positive" value={matrix.truePositive} color={NOMINAL} />
          <ConfusionCell label="False positive" value={matrix.falsePositive} color={ANOMALY} />
          <ConfusionCell label="False negative" value={matrix.falseNegative} color={WATCH} />
          <ConfusionCell label="True negative" value={matrix.trueNegative} color={NOMINAL} />
        </div>
      </div>
    </div>
  )
}

function ThresholdSlider({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div style={{ marginBottom: SPACE_16 }}>
      <div className="flex items-center justify-between">
        <span style={{ ...TYPE_BODY, color: TEXT_PRIMARY }}>{label}</span>
        <span className="font-mono" style={{ ...TYPE_BODY, color: TEXT_SECONDARY }}>
          {Math.round(value * 100)}%
        </span>
      </div>
      <div style={{ marginTop: SPACE_16 }}>
        <DirectManipulationSlider
          value={Math.round(value * 100)}
          min={Math.round(min * 100)}
          max={Math.round(max * 100)}
          step={1}
          onChange={(v) => onChange(v / 100)}
          ariaLabel={label}
        />
      </div>
    </div>
  )
}

function MetricCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div style={{ padding: SPACE_16, background: PANEL_RAISED, borderRadius: RADIUS_STATIC }}>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>{label.toUpperCase()}</p>
      <p className="font-mono" style={{ ...TYPE_DISPLAY, color: TEXT_PRIMARY, marginTop: SPACE_8 }}>
        {value}
      </p>
      <p style={{ ...TYPE_BODY, color: TEXT_SECONDARY, marginTop: SPACE_8 }}>{sub}</p>
    </div>
  )
}

function ConfusionCell({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ padding: SPACE_16, background: PANEL_RAISED, borderRadius: RADIUS_STATIC }}>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>{label.toUpperCase()}</p>
      <p className="font-mono" style={{ ...TYPE_DISPLAY, color, marginTop: SPACE_8 }}>
        {value}
      </p>
    </div>
  )
}
