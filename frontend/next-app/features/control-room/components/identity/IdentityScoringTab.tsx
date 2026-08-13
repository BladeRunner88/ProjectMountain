'use client'

import type { ReactElement } from 'react'
import {
  ANOMALY,
  BORDER_WIDTH,
  HAIRLINE,
  HUMAN,
  NOMINAL,
  PANEL_RAISED,
  RADIUS_STATIC,
  SPACE_16,
  SPACE_24,
  SPACE_32,
  SPACE_8,
  TEXT_DIM,
  TEXT_PRIMARY,
  TYPE_BODY,
  TYPE_CAPTION,
  TYPE_DISPLAY,
} from '@/features/ase/tokens'
import type { Dataset } from '@/features/ase/services/dataset'
import {
  jaroSimilarity,
  type DecisionBand,
  type DecisionThresholds,
  type PairFields,
  type PairwiseComparison,
  type ScoringWeights,
  compositeScore,
  decisionBand,
  percentileAmong,
} from '@/features/ase/services/entityResolution'
import { maskedSerial } from '@/features/ase/services/serial'
import { RatingRing, SegmentedBar } from '@/features/control-room'

const BAND_LABEL: Record<DecisionBand, string> = { 'auto-merge': 'AUTO-MERGED', human: 'AWAITING REVIEW', reject: 'REJECTED' }
const BAND_COLOR: Record<DecisionBand, string> = { 'auto-merge': NOMINAL, human: HUMAN, reject: ANOMALY }

export function IdentityScoringTab({
  dataset,
  climberId,
  weights,
  thresholds,
}: {
  dataset: Dataset
  climberId: string
  weights: ScoringWeights
  thresholds: DecisionThresholds
}): ReactElement {
  const record = dataset.identityRecords.get(climberId)
  const scoring = dataset.personScoring.get(climberId)
  if (!record || !scoring) {
    return <p style={{ ...TYPE_BODY, color: TEXT_DIM }}>No scoring data for this person.</p>
  }

  const overall = compositeScore(scoring.fields, weights)
  const band = decisionBand(overall, thresholds)
  const allScores = Array.from(dataset.personScoring.values()).map((s) => compositeScore(s.fields, weights))
  const pct = percentileAmong(overall, allScores)

  return (
    <div>
      <RatingCard name={record.who.fullLegalName.value} serial={record.serial.value} overall={overall} band={band} />
      <AttributeBars fields={scoring.fields} weights={weights} percentile={pct} />
      <PairwiseBreakdown pairwise={scoring.pairwise} weights={weights} />
      <History history={scoring.history} />
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
  band: DecisionBand
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
          <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>OVERALL</p>
          <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_8 }}>identity confidence</p>
          <p style={{ ...TYPE_CAPTION, color: BAND_COLOR[band], marginTop: SPACE_8 }}>{BAND_LABEL[band]}</p>
        </div>
        <RatingRing pct={overall * 100} color={BAND_COLOR[band]} />
      </div>
    </div>
  )
}

function contribution(fields: PairFields, weights: ScoringWeights, key: keyof ScoringWeights): { value: number; max: number } {
  switch (key) {
    case 'passportExact':
      return { value: fields.passportMatch ? weights.passportExact : 0, max: weights.passportExact }
    case 'nameJaro':
      return { value: jaroSimilarity(fields.nameA, fields.nameB) * weights.nameJaro, max: weights.nameJaro }
    case 'sameOperator':
      return { value: fields.sameOperator ? weights.sameOperator : 0, max: weights.sameOperator }
    case 'dobWithinTwoDays':
      return { value: fields.dobWithinTwoDays ? weights.dobWithinTwoDays : 0, max: weights.dobWithinTwoDays }
  }
}

const ATTRIBUTE_LABELS: { key: keyof ScoringWeights; label: string }[] = [
  { key: 'passportExact', label: 'Passport match' },
  { key: 'nameJaro', label: 'Name similarity' },
  { key: 'sameOperator', label: 'Operator match' },
  { key: 'dobWithinTwoDays', label: 'Date of birth' },
]

function AttributeBars({
  fields,
  weights,
  percentile,
}: {
  fields: PairFields
  weights: ScoringWeights
  percentile: number
}): ReactElement {
  return (
    <div style={{ marginTop: SPACE_32 }}>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>ATTRIBUTE BARS</p>
      <div style={{ marginTop: SPACE_16 }}>
        {ATTRIBUTE_LABELS.map((a) => {
          const { value, max } = contribution(fields, weights, a.key)
          return <AttributeBar key={a.key} label={a.label} value={value} max={max} percentile={percentile} />
        })}
      </div>
    </div>
  )
}

function AttributeBar({
  label,
  value,
  max,
  percentile,
}: {
  label: string
  value: number
  max: number
  percentile: number
}): ReactElement {
  return (
    <SegmentedBar
      label={label}
      value={value}
      max={max}
      valueLabel={`${(value * 100).toFixed(1)}/${(max * 100).toFixed(0)}`}
      percentileLabel={`higher than ${percentile}% of resolved people`}
      filledColor={NOMINAL}
    />
  )
}

function PairwiseBreakdown({
  pairwise,
  weights,
}: {
  pairwise: PairwiseComparison[]
  weights: ScoringWeights
}): ReactElement {
  return (
    <div style={{ marginTop: SPACE_32 }}>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>PAIRWISE BREAKDOWN</p>
      <div style={{ marginTop: SPACE_16 }}>
        {pairwise.length === 0 ? (
          <p style={{ ...TYPE_BODY, color: TEXT_DIM }}>No pairwise comparisons for this person.</p>
        ) : (
          pairwise.map((p) => {
            const score = compositeScore(p.fields, weights)
            return (
              <div
                key={`${p.aLabel}-${p.bLabel}`}
                className="flex items-center justify-between"
                style={{ padding: `${SPACE_8}px 0`, borderBottom: `${BORDER_WIDTH}px solid ${HAIRLINE}` }}
              >
                <span style={{ ...TYPE_BODY, color: TEXT_PRIMARY }}>
                  {p.aLabel} vs {p.bLabel}
                </span>
                <span className="font-mono" style={{ ...TYPE_BODY, color: TEXT_PRIMARY }}>
                  {Math.round(score * 100)}%
                </span>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

function History({ history }: { history: number[] }): ReactElement {
  const w = 280
  const h = 48

  if (history.length === 0) {
    return (
      <div style={{ marginTop: SPACE_32 }}>
        <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>IDENTITY CONFIDENCE OVER TIME</p>
        <p style={{ ...TYPE_BODY, color: TEXT_DIM, marginTop: SPACE_16 }}>No history yet.</p>
      </div>
    )
  }

  const max = Math.max(...history)
  const min = Math.min(...history)
  const range = max - min || 1
  const denom = Math.max(history.length - 1, 1)
  const coords = history.map((v, i) => ({
    x: (i / denom) * w,
    y: h - ((v - min) / range) * h,
  }))
  const last = coords[coords.length - 1]
  const points = coords.map((c) => `${c.x},${c.y}`).join(' ')

  return (
    <div style={{ marginTop: SPACE_32 }}>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>IDENTITY CONFIDENCE OVER TIME</p>
      <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} style={{ marginTop: SPACE_16 }} role="img" aria-label="Identity confidence history sparkline">
        <polyline points={points} fill="none" stroke={TEXT_PRIMARY} strokeWidth={1.5} />
        {last ? <circle cx={last.x} cy={last.y} r={2.5} fill={TEXT_PRIMARY} /> : null}
      </svg>
    </div>
  )
}
