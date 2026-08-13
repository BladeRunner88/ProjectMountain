'use client'

import type { ReactElement } from 'react'
import {
  ANOMALY,
  BORDER_WIDTH,
  HAIRLINE,
  NOMINAL,
  PANEL_RAISED,
  RADIUS_STATIC,
  SPACE_16,
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
import { useDataset } from '@/features/ase/client'
import { formatElapsed } from '@/features/ase/services/activity'
import {
  PREDICTED_LABEL,
  type Band,
  type ClusterMember,
  type DecisionPatternInstance,
  type Driver,
  type LoadLevel,
  type PredictionState,
  type RiskLevel,
  type TimelinePoint,
} from '@/features/ase/services/prediction'
import { nodeVisual, type NodeStatus } from '@/features/ase/services/nodeLanguage'
import { RecommendationCard, type Recommendation } from '@/features/control-room'

const LOAD_COLOR: Record<LoadLevel, string> = { low: NOMINAL, moderate: WATCH, high: ANOMALY }
const BAND_LABEL: Record<Band, string> = { likely: 'LIKELY', possible: 'POSSIBLE', unlikely: 'UNLIKELY' }
const BAND_COLOR: Record<Band, string> = { likely: ANOMALY, possible: WATCH, unlikely: TEXT_DIM }
const RISK_TO_STATUS: Record<RiskLevel, NodeStatus> = { critical: 'anomaly', elevated: 'watch', watch: 'nominal' }

export function PredictionForecast({
  state,
  climberId,
  onSelectPerson,
}: {
  state: PredictionState
  climberId: string
  onSelectPerson: (climberId: string) => void
}): ReactElement {
  const { logRevision } = useDataset()
  const p = state.predictions.get(climberId)
  if (!p) return <p style={{ ...TYPE_BODY, color: TEXT_DIM }}>No prediction for this person.</p>
  if (p.drivers.length === 0) return <p style={{ ...TYPE_BODY, color: TEXT_DIM }}>No traceable drivers — this prediction does not render.</p>

  const totalContribution = p.drivers.reduce((sum, d) => sum + d.contributionPct, 0)

  const rec: Recommendation = {
    id: `forecast-${p.climberId}`,
    action: p.recommendedAction.action,
    why: p.recommendedAction.why,
    confidencePct: p.recommendedAction.confidencePct,
    ifYouDoNothing: p.recommendedAction.ifNothing,
    doneLabel: 'DONE — DESCENT PROTOCOL INITIATED',
    onRun: () => logRevision(`${p.name}: ${p.recommendedAction.action}`),
  }

  return (
    <div>
      <div style={{ padding: SPACE_16, background: PANEL_RAISED, borderRadius: RADIUS_STATIC, border: `${BORDER_WIDTH}px solid ${HAIRLINE}` }}>
        <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>THE PREDICTION</p>
        <p style={{ ...TYPE_DISPLAY, color: TEXT_PRIMARY, marginTop: SPACE_8 }}>{PREDICTED_LABEL[p.predicted]}</p>
        <p style={{ ...TYPE_BODY, color: TEXT_SECONDARY, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
          WITHIN {p.withinHours} hours · LIKELIHOOD {p.likelihoodPct}% · ISSUED {formatElapsed(p.issuedAt)} · RESOLVES{' '}
          {new Date(p.resolvesAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>

      <DriversSection drivers={p.drivers} totalContribution={totalContribution} />
      <DecisionCapacitySection cognitive={p.cognitive} />
      <PatternsSection patterns={p.patterns} />
      <TimelineSection timeline={p.timeline} />

      <div style={{ marginTop: SPACE_32 }}>
        <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>RECOMMENDED ACTION</p>
        <p style={{ ...TYPE_BODY, color: TEXT_SECONDARY, marginTop: SPACE_8, marginBottom: SPACE_16, textTransform: 'none', letterSpacing: 'normal' }}>
          {`"${p.likelihoodPct}% likely to need descent" is an observation. The action is the product.`}
        </p>
        <RecommendationCard rec={rec} />
      </div>

      <ClusterSection cluster={p.cluster} onSelectPerson={onSelectPerson} />
    </div>
  )
}

function DriversSection({ drivers, totalContribution }: { drivers: Driver[]; totalContribution: number }): ReactElement {
  return (
    <div style={{ marginTop: SPACE_32 }}>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>DRIVERS</p>
      <div style={{ marginTop: SPACE_16 }}>
        {drivers.map((d) => (
          <div key={d.id} style={{ padding: `${SPACE_8}px 0`, borderBottom: `${BORDER_WIDTH}px solid ${HAIRLINE}` }}>
            <div className="flex items-center justify-between">
              <span style={{ ...TYPE_BODY, color: TEXT_PRIMARY, textTransform: 'none', letterSpacing: 'normal' }}>{d.label}</span>
              <span className="font-mono" style={{ ...TYPE_BODY, color: TEXT_PRIMARY }}>
                +{d.contributionPct}%
              </span>
            </div>
            <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
              evidence: {d.evidence}
              {d.heldOf ? ` (held in ${d.heldOf.holds} of ${d.heldOf.total} similar cases)` : ''}
            </p>
          </div>
        ))}
        <div className="flex items-center justify-between" style={{ padding: `${SPACE_8}px 0` }}>
          <span style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>TOTAL</span>
          <span className="font-mono" style={{ ...TYPE_BODY, color: TEXT_PRIMARY }}>
            {totalContribution}%
          </span>
        </div>
      </div>
    </div>
  )
}

function DecisionCapacitySection({
  cognitive,
}: {
  cognitive: {
    decisionCapacity: number
    environmentalLoad: LoadLevel
    physiologicalLoad: LoadLevel
    workingMemory: 'normal' | 'reduced' | 'impaired'
  }
}): ReactElement {
  return (
    <div style={{ marginTop: SPACE_32 }}>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>DECISION CAPACITY</p>
      <p style={{ ...TYPE_BODY, color: TEXT_SECONDARY, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
        {"How the mountain is shaping this person's judgement."}
      </p>
      <div className="grid grid-cols-4" style={{ gap: SPACE_16, marginTop: SPACE_16 }}>
        <LoadCard
          label="ENVIRONMENTAL LOAD"
          value={cognitive.environmentalLoad.toUpperCase()}
          color={LOAD_COLOR[cognitive.environmentalLoad]}
          note="wind noise, cold pain, visibility stress"
        />
        <LoadCard
          label="PHYSIOLOGICAL LOAD"
          value={cognitive.physiologicalLoad.toUpperCase()}
          color={LOAD_COLOR[cognitive.physiologicalLoad]}
          note="hypoxia, fatigue, cold"
        />
        <LoadCard
          label="DECISION CAPACITY"
          value={`${cognitive.decisionCapacity} / 100`}
          color={cognitive.decisionCapacity < 50 ? ANOMALY : cognitive.decisionCapacity < 70 ? WATCH : NOMINAL}
          note="inferred from the eight behavioural indicators in Profile"
        />
        <LoadCard
          label="WORKING MEMORY"
          value={cognitive.workingMemory.toUpperCase()}
          color={cognitive.workingMemory === 'impaired' ? ANOMALY : cognitive.workingMemory === 'reduced' ? WATCH : NOMINAL}
          note="inferred from radio response completeness"
        />
      </div>
    </div>
  )
}

function LoadCard({ label, value, color, note }: { label: string; value: string; color: string; note: string }): ReactElement {
  return (
    <div style={{ padding: SPACE_16, background: PANEL_RAISED, borderRadius: RADIUS_STATIC, border: `${BORDER_WIDTH}px solid ${HAIRLINE}` }}>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>{label}</p>
      <p className="font-mono" style={{ ...TYPE_BODY, color, marginTop: SPACE_8, fontSize: 18 }}>
        {value}
      </p>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>{note}</p>
    </div>
  )
}

function PatternsSection({ patterns }: { patterns: DecisionPatternInstance[] }): ReactElement {
  return (
    <div style={{ marginTop: SPACE_32 }}>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>PREDICTED DECISION PATTERNS</p>
      <p style={{ ...TYPE_BODY, color: TEXT_SECONDARY, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
        When decision capacity falls below 50, this person has historically shown these patterns.
      </p>
      {patterns.length === 0 ? (
        <p style={{ ...TYPE_BODY, color: TEXT_DIM, marginTop: SPACE_16 }}>No predicted decision patterns for this person.</p>
      ) : (
        <div className="grid grid-cols-2" style={{ gap: SPACE_16, marginTop: SPACE_16 }}>
          {patterns.map((pat) => (
            <div
              key={pat.key}
              style={{ padding: SPACE_16, background: PANEL_RAISED, borderRadius: RADIUS_STATIC, border: `${BORDER_WIDTH}px solid ${HAIRLINE}` }}
            >
              <div className="flex items-center justify-between">
                <p style={{ ...TYPE_BODY, color: TEXT_PRIMARY, fontWeight: 600 }}>{pat.name.toUpperCase()}</p>
                <span
                  style={{
                    ...TYPE_CAPTION,
                    color: BAND_COLOR[pat.likelihoodBand],
                    border: `${BORDER_WIDTH}px solid ${BAND_COLOR[pat.likelihoodBand]}`,
                    borderRadius: 4,
                    padding: '1px 8px',
                  }}
                >
                  {BAND_LABEL[pat.likelihoodBand]}
                </span>
              </div>
              <p style={{ ...TYPE_BODY, color: TEXT_SECONDARY, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
                {pat.description}
              </p>
              <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
                triggers: {pat.triggers.join(', ')}
              </p>
              <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
                watch for: {pat.observableSigns.join(', ')}
              </p>
              <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
                seen in this person:{' '}
                {pat.seenInThisPersonCount === 0
                  ? 'not yet observed'
                  : `${pat.seenInThisPersonCount} time${pat.seenInThisPersonCount === 1 ? '' : 's'}${pat.seenInThisPersonMostRecent ? `, most recently ${pat.seenInThisPersonMostRecent}` : ''}`}
              </p>
              <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
                seen in {pat.sampleSize} comparable cases
              </p>
              <p style={{ ...TYPE_BODY, color: NOMINAL, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
                mitigation: {pat.mitigation}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function TimelineSection({ timeline }: { timeline: TimelinePoint[] }): ReactElement {
  const points = timeline
  if (points.length < 2) {
    return (
      <div style={{ marginTop: SPACE_32 }}>
        <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>DECISION CAPACITY TIMELINE</p>
        <p style={{ ...TYPE_BODY, color: TEXT_DIM, marginTop: SPACE_16 }}>Not enough timeline points to plot.</p>
      </div>
    )
  }
  const w = 640
  const h = 140
  const x = (i: number): number => (i / (points.length - 1)) * (w - 20) + 10
  const y = (cap: number): number => h - 10 - (cap / 100) * (h - 20)
  const observedPath = points
    .filter((pt) => pt.observed)
    .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${x(points.indexOf(pt))} ${y(pt.capacity)}`)
    .join(' ')
  const lastObservedIdx = points.findIndex((pt) => !pt.observed) - 1
  const projectedPoints = points.slice(Math.max(0, lastObservedIdx))
  const projectedPath = projectedPoints
    .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${x(points.indexOf(pt))} ${y(pt.capacity)}`)
    .join(' ')

  const markerLabel: Record<string, string> = {
    turnaround: 'TURNAROUND DECISION POINT',
    'critical-threshold': 'CRITICAL THRESHOLD',
    'partner-separation': 'PARTNER SEPARATION RISK',
  }

  return (
    <div style={{ marginTop: SPACE_32 }}>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>DECISION CAPACITY TIMELINE</p>
      <div
        style={{
          padding: SPACE_16,
          background: PANEL_RAISED,
          borderRadius: RADIUS_STATIC,
          border: `${BORDER_WIDTH}px solid ${HAIRLINE}`,
          marginTop: SPACE_16,
        }}
      >
        <svg width={w} height={h} style={{ overflow: 'visible' }}>
          <line x1={10} y1={y(40)} x2={w - 10} y2={y(40)} stroke={ANOMALY} strokeWidth={1} strokeDasharray="2 3" opacity={0.5} />
          <path d={observedPath} fill="none" stroke={TEXT_PRIMARY} strokeWidth={2} />
          <path d={projectedPath} fill="none" stroke={TEXT_PRIMARY} strokeWidth={2} strokeDasharray="4 4" opacity={0.6} />
          {points.map((pt, i) => (
            <circle
              key={pt.hourLabel}
              cx={x(i)}
              cy={y(pt.capacity)}
              r={3}
              fill={pt.observed ? TEXT_PRIMARY : 'none'}
              stroke={TEXT_PRIMARY}
              strokeWidth={1.5}
            />
          ))}
          {points.map((pt, i) =>
            pt.marker ? (
              <g key={`marker-${pt.hourLabel}`}>
                <line x1={x(i)} y1={10} x2={x(i)} y2={h - 10} stroke={WATCH} strokeWidth={1} strokeDasharray="1 3" opacity={0.5} />
              </g>
            ) : null
          )}
        </svg>
        <div className="flex" style={{ gap: SPACE_16, marginTop: SPACE_8 }}>
          {points.map((pt, i) => (
            <span
              key={pt.hourLabel}
              style={{
                ...TYPE_CAPTION,
                color: TEXT_DIM,
                flex: 1,
                textAlign: i === 0 ? 'left' : i === points.length - 1 ? 'right' : 'center',
              }}
            >
              {pt.hourLabel}
              {i === 0 ? ' baseline' : ''}
              {i === 1 ? ' current' : ''}
            </span>
          ))}
        </div>
        <div style={{ marginTop: SPACE_8 }}>
          {points
            .filter((pt) => pt.marker)
            .map((pt) => (
              <p key={pt.hourLabel} style={{ ...TYPE_CAPTION, color: WATCH, textTransform: 'none', letterSpacing: 'normal' }}>
                {pt.hourLabel} — {pt.marker ? markerLabel[pt.marker] ?? pt.marker : ''}
              </p>
            ))}
        </div>
      </div>
    </div>
  )
}

function ClusterSection({
  cluster,
  onSelectPerson,
}: {
  cluster: ClusterMember[]
  onSelectPerson: (climberId: string) => void
}): ReactElement {
  const members = cluster
  return (
    <div style={{ marginTop: SPACE_32 }}>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>ALSO AFFECTED — CLUSTER</p>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
        {"Cluster predictions recompute together — if one person descends, the others' profiles update."}
      </p>
      {members.length === 0 ? (
        <p style={{ ...TYPE_BODY, color: TEXT_DIM, marginTop: SPACE_16 }}>No linked predictions.</p>
      ) : (
        <svg width="100%" height={Math.max(140, members.length * 56)} style={{ marginTop: SPACE_16 }} role="img" aria-label="Cluster of linked predictions">
          {members.map((m, i) => {
            const status = RISK_TO_STATUS[m.risk]
            const visual = nodeVisual(status)
            const y = 30 + i * 56
            return (
              <g key={m.climberId} onClick={() => onSelectPerson(m.climberId)} style={{ cursor: 'pointer' }}>
                {i > 0 ? <line x1={20} y1={30} x2={20} y2={y} stroke={visual.fill} strokeWidth={1.5} opacity={0.5} /> : null}
                {visual.ring ? <circle cx={20} cy={y} r={10} fill="none" stroke={visual.ring} strokeWidth={2} /> : null}
                <circle cx={20} cy={y} r={7} fill={visual.fill} />
                <text x={40} y={y - 6} fill={TEXT_PRIMARY} fontSize={13}>
                  {m.name} {m.relation !== 'self' ? `(${m.relation})` : ''}
                </text>
                <text x={40} y={y + 12} fill={TEXT_DIM} fontSize={11}>
                  {PREDICTED_LABEL[m.predicted]} · {m.withinHours}h · {m.likelihoodPct}%
                </text>
              </g>
            )
          })}
        </svg>
      )}
    </div>
  )
}
