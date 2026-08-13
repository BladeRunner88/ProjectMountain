'use client'

import { useMemo, useState, type ReactElement } from 'react'
import {
  ANOMALY,
  BORDER_WIDTH,
  CONFIDENCE_FLOOR_DEFAULT,
  HAIRLINE,
  PANEL_RAISED,
  RADIUS_INTERACTIVE,
  RADIUS_STATIC,
  SPACE_8,
  SPACE_16,
  SPACE_24,
  SPACE_32,
  TEXT_DIM,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  TYPE_BODY,
  TYPE_CAPTION,
  WATCH,
} from '@/features/ase/tokens'
import { confidence } from '@/features/ase/services/folds'
import { formatElapsed } from '@/features/ase/services/activity'
import type { Dataset } from '@/features/ase/services/dataset'
import {
  descendantNodeIds,
  subjectLabel,
  type Detection,
  type DetectionEngineState,
  type DetectionRule,
  type ResolvedDetection,
  type Severity,
} from '@/features/ase/services/detection'
import {
  PersonBadge,
  RecommendationCard,
  focusRingStyle,
  useFocusRing,
  type Recommendation,
} from '@/features/control-room'

const SEVERITY_COLOR: Record<Severity, string> = { critical: ANOMALY, high: ANOMALY, medium: WATCH, low: TEXT_DIM }
const SEVERITY_LABEL: Record<Severity, string> = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' }
const SEVERITY_RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 }
const TREND_ARROW: Record<Detection['trend'], string> = { rising: '↑', falling: '↓', steady: '→' }
const TREND_WORD: Record<Detection['trend'], string> = { rising: 'rising', falling: 'falling', steady: 'steady' }

function formatValue(rule: DetectionRule, value: number): string {
  const rounded = Math.round(value * 10) / 10
  if (rule.thresholdUnit === '%') return `${rounded}%`
  return `${rounded} ${rule.thresholdUnit}`
}

interface Row {
  detection: Detection
  rule: DetectionRule
}

export function DetectionDetections({
  engine,
  dataset,
  logRevision,
  selectedRuleId,
  selectedSubjectNodeId,
  selectedDetectionId,
  onSelectDetection,
}: {
  engine: DetectionEngineState
  dataset: Dataset
  logRevision: (sentence: string) => void
  selectedRuleId: string | null
  selectedSubjectNodeId: string | null
  selectedDetectionId: string | null
  onSelectDetection: (id: string | null) => void
}): ReactElement {
  const rows = useMemo<Row[]>(() => {
    let list = engine.detections.filter((d) => !d.suppressed)
    if (selectedRuleId) list = list.filter((d) => d.ruleId === selectedRuleId)
    if (selectedSubjectNodeId) {
      const ids = descendantNodeIds(engine.mapNodes, selectedSubjectNodeId)
      list = list.filter((d) => d.subject.kind !== 'system' && ids.has(d.subject.nodeId))
    }
    const out: Row[] = []
    for (const detection of list) {
      const rule = engine.rules.find((r) => r.id === detection.ruleId)
      if (!rule) continue
      out.push({ detection, rule })
    }
    return out.sort(
      (a, b) =>
        SEVERITY_RANK[a.rule.severity] - SEVERITY_RANK[b.rule.severity] ||
        a.detection.detectedAt.localeCompare(b.detection.detectedAt)
    )
  }, [engine, selectedRuleId, selectedSubjectNodeId])

  const selectedRow = selectedDetectionId ? rows.find((r) => r.detection.id === selectedDetectionId) : undefined

  return (
    <div>
      {selectedRuleId || selectedSubjectNodeId ? (
        <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginBottom: SPACE_16, textTransform: 'none', letterSpacing: 'normal' }}>
          Filtered{selectedRuleId ? ` to "${engine.rules.find((r) => r.id === selectedRuleId)?.label ?? selectedRuleId}"` : ' to the selected place'}{' '}
          — {rows.length} of {engine.detections.filter((d) => !d.suppressed).length} active.
        </p>
      ) : null}

      <SeverityTable rows={rows} selectedId={selectedDetectionId} onSelect={onSelectDetection} />

      <div style={{ marginTop: SPACE_24 }}>
        {selectedRow ? (
          <ReasonPanel row={selectedRow} engine={engine} dataset={dataset} logRevision={logRevision} />
        ) : (
          <p style={{ ...TYPE_BODY, color: TEXT_DIM }}>Select a detection above to see why ASE flagged it.</p>
        )}
      </div>

      <ResolvedSection resolved={engine.resolved} rules={engine.rules} />
    </div>
  )
}

function SeverityTable({
  rows,
  selectedId,
  onSelect,
}: {
  rows: Row[]
  selectedId: string | null
  onSelect: (id: string) => void
}): ReactElement {
  if (rows.length === 0) {
    return <p style={{ ...TYPE_BODY, color: TEXT_DIM }}>Nothing is currently firing here.</p>
  }
  return (
    <div>
      <div className="flex" style={{ ...TYPE_CAPTION, color: TEXT_DIM, borderBottom: `${BORDER_WIDTH}px solid ${HAIRLINE}`, paddingBottom: SPACE_8 }}>
        <span style={{ flex: 0.9 }}>SEVERITY</span>
        <span style={{ flex: 2.4 }}>WHO OR WHAT</span>
        <span style={{ flex: 1.6 }}>RULE</span>
        <span style={{ flex: 1 }}>VALUE</span>
        <span style={{ flex: 1 }}>FOR HOW LONG</span>
        <span style={{ flex: 1 }}>CONFIDENCE</span>
        <span style={{ flex: 1 }}>TREND</span>
      </div>
      {rows.map(({ detection, rule }) => (
        <TableRow
          key={detection.id}
          detection={detection}
          rule={rule}
          selected={detection.id === selectedId}
          onSelect={() => onSelect(detection.id)}
        />
      ))}
    </div>
  )
}

function TableRow({
  detection,
  rule,
  selected,
  onSelect,
}: {
  detection: Detection
  rule: DetectionRule
  selected: boolean
  onSelect: () => void
}): ReactElement {
  const { focused, handlers } = useFocusRing()
  const conf = Math.round(confidence(detection.valueTraced) * 100)
  const color = SEVERITY_COLOR[rule.severity]
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect()
        }
      }}
      {...handlers}
      className="pressable-row flex cursor-pointer items-center"
      style={{
        padding: `${SPACE_8}px 0`,
        borderBottom: `${BORDER_WIDTH}px solid ${HAIRLINE}`,
        background: selected ? PANEL_RAISED : `${color}1a`,
        borderLeft: `2px solid ${selected ? color : 'transparent'}`,
        ...focusRingStyle(focused),
      }}
    >
      <span style={{ flex: 0.9, color, paddingLeft: SPACE_8 }}>{SEVERITY_LABEL[rule.severity]}</span>
      <span style={{ flex: 2.4 }}>
        {detection.subject.kind === 'climber' ? (
          <PersonBadge climberId={detection.subject.climberId} name={detection.subject.name} serial={detection.subject.serial} />
        ) : (
          <span style={{ color: TEXT_PRIMARY }}>{subjectLabel(detection.subject)}</span>
        )}
      </span>
      <span style={{ flex: 1.6, color: TEXT_SECONDARY }}>{rule.label}</span>
      <span className="font-mono" style={{ flex: 1, color: TEXT_PRIMARY }}>
        {formatValue(rule, detection.valueTraced.value)}
      </span>
      <span className="font-mono" style={{ flex: 1, color: TEXT_DIM }}>
        {formatElapsed(detection.detectedAt)}
      </span>
      <span className="font-mono" style={{ flex: 1, color: TEXT_PRIMARY }}>
        {conf}%
      </span>
      <span style={{ flex: 1, color: TEXT_SECONDARY }}>
        {TREND_ARROW[detection.trend]} {TREND_WORD[detection.trend]}
      </span>
    </div>
  )
}

function ReasonPanel({
  row,
  engine,
  dataset,
  logRevision,
}: {
  row: Row
  engine: DetectionEngineState
  dataset: Dataset
  logRevision: (s: string) => void
}): ReactElement {
  const { detection, rule } = row
  return (
    <div style={{ padding: SPACE_16, background: PANEL_RAISED, borderRadius: RADIUS_STATIC, border: `${BORDER_WIDTH}px solid ${HAIRLINE}` }}>
      <WhatWasDetected detection={detection} rule={rule} />
      <WhyItWasDetected detection={detection} rule={rule} />
      <WhoItWasDetectedOn detection={detection} engine={engine} dataset={dataset} />
      <WhatItMeans detection={detection} rule={rule} logRevision={logRevision} />
    </div>
  )
}

function WhatWasDetected({ detection, rule }: { detection: Detection; rule: DetectionRule }): ReactElement {
  const oldest = detection.series[0]
  const dir = rule.thresholdDirection === 'below' ? 'fell to' : 'rose to'
  return (
    <div>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>WHAT WAS DETECTED</p>
      <p style={{ ...TYPE_BODY, color: TEXT_PRIMARY, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
        {subjectLabel(detection.subject)} {dir} {formatValue(rule, detection.valueTraced.value)}, {rule.thresholdDirection} the{' '}
        {formatValue(rule, rule.thresholdValue)} threshold, and has stayed there for {formatElapsed(detection.detectedAt)}.
        {oldest ? ` It was ${formatValue(rule, oldest.value)} ${oldest.minutesAgo} minutes ago.` : ''}
      </p>
      <Sparkline detection={detection} rule={rule} />
    </div>
  )
}

function Sparkline({ detection, rule }: { detection: Detection; rule: DetectionRule }): ReactElement | null {
  if (detection.series.length < 2) return null
  const width = 420
  const height = 64
  const values = detection.series.map((p) => p.value)
  const min = Math.min(...values, rule.thresholdValue)
  const max = Math.max(...values, rule.thresholdValue)
  const range = max - min || 1
  const x = (i: number): number => (i / (detection.series.length - 1)) * width
  const y = (v: number): number => height - ((v - min) / range) * height
  const path = detection.series.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(p.value)}`).join(' ')
  const thresholdY = y(rule.thresholdValue)
  return (
    <svg width={width} height={height} style={{ marginTop: SPACE_16, overflow: 'visible' }}>
      <line x1={0} y1={thresholdY} x2={width} y2={thresholdY} stroke={TEXT_DIM} strokeWidth={1} strokeDasharray="3 3" />
      <path d={path} fill="none" stroke={SEVERITY_COLOR[rule.severity]} strokeWidth={1.5} />
    </svg>
  )
}

function WhyItWasDetected({ detection, rule }: { detection: Detection; rule: DetectionRule }): ReactElement {
  const conf = confidence(detection.valueTraced)
  const confPct = Math.round(conf * 100)
  const detectedTime = new Date(detection.detectedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const [nowMs] = useState(() => Date.now())
  const elapsedMin = Math.round((nowMs - new Date(detection.detectedAt).getTime()) / 60000)
  return (
    <div style={{ marginTop: SPACE_24 }}>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>WHY IT WAS DETECTED</p>
      <p style={{ ...TYPE_BODY, color: TEXT_SECONDARY, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
        {rule.label}: {rule.conditionSentence}.
      </p>
      <ConditionLine label="The value crossed the threshold" ok pass={`yes, at ${detectedTime}`} />
      {rule.windowMinutes !== null ? (
        <ConditionLine label="It stayed across for the full window" ok pass={`yes, ${elapsedMin} of ${rule.windowMinutes} minutes required`} />
      ) : (
        <ConditionLine label="The window is live, not dwell-based" ok pass="checked on every reading" />
      )}
      <ConditionLine
        label="The reading came from a source above the confidence floor"
        ok={conf >= CONFIDENCE_FLOOR_DEFAULT}
        pass={`${conf >= CONFIDENCE_FLOOR_DEFAULT ? 'yes' : 'no'}, ${confPct}%`}
      />
      <ConditionLine
        label="No suppression is active for this subject"
        ok={!detection.suppressed}
        pass={detection.suppressed ? 'no — suppressed' : 'correct'}
      />
      <p style={{ ...TYPE_BODY, color: TEXT_SECONDARY, marginTop: SPACE_16, textTransform: 'none', letterSpacing: 'normal' }}>
        Threshold authority: {rule.authority}.
      </p>
      {rule.patternName ? (
        <p style={{ ...TYPE_BODY, color: TEXT_SECONDARY, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
          {`A learned pattern contributed — "${rule.patternName}" — flagging up to ${rule.patternLeadMinutes} minutes ahead of this reading.`}
        </p>
      ) : null}
    </div>
  )
}

function ConditionLine({ label, ok, pass }: { label: string; ok: boolean; pass: string }): ReactElement {
  return (
    <div className="flex items-center justify-between" style={{ marginTop: SPACE_8, gap: SPACE_16 }}>
      <span style={{ ...TYPE_BODY, color: TEXT_SECONDARY, textTransform: 'none', letterSpacing: 'normal' }}>{label}</span>
      <span className="font-mono" style={{ ...TYPE_CAPTION, color: ok ? TEXT_PRIMARY : ANOMALY }}>
        {pass}
      </span>
    </div>
  )
}

function WhoItWasDetectedOn({
  detection,
  engine,
  dataset,
}: {
  detection: Detection
  engine: DetectionEngineState
  dataset: Dataset
}): ReactElement {
  if (detection.subject.kind !== 'climber') {
    return (
      <div style={{ marginTop: SPACE_24 }}>
        <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>WHO OR WHAT IT WAS DETECTED ON</p>
        <p style={{ ...TYPE_BODY, color: TEXT_PRIMARY, marginTop: SPACE_8 }}>{subjectLabel(detection.subject)}</p>
      </div>
    )
  }

  const { climberId } = detection.subject
  const record = dataset.identityRecords.get(climberId)
  const card = dataset.identityCards.get(climberId)
  const ropePartners = card?.associates.filter((a) => a.kind === 'rope_partner') ?? []

  const cluster = engine.detections.filter(
    (d) =>
      d.id !== detection.id &&
      !d.suppressed &&
      d.ruleId === detection.ruleId &&
      d.subject.kind === 'climber' &&
      dataset.identityCards.get(d.subject.climberId)?.routeName.value === card?.routeName.value
  )

  return (
    <div style={{ marginTop: SPACE_24 }}>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>WHO IT WAS DETECTED ON</p>
      <div style={{ marginTop: SPACE_8 }}>
        <PersonBadge climberId={climberId} name={detection.subject.name} serial={detection.subject.serial} />
      </div>
      {record && card ? (
        <p style={{ ...TYPE_BODY, color: TEXT_SECONDARY, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
          {record.contacts.operatorName.value} · {card.routeName.value} · {card.footer.camp.value} · last known position{' '}
          {card.footer.resolvedPlace.value}
        </p>
      ) : null}

      {ropePartners.length > 0 ? (
        <div style={{ marginTop: SPACE_16 }}>
          <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>ROPE PARTNER</p>
          <div className="flex flex-wrap" style={{ gap: SPACE_8, marginTop: SPACE_8 }}>
            {ropePartners.map((p) =>
              p.climberId ? (
                <div key={p.id} className="flex items-center" style={{ gap: SPACE_8 }}>
                  <PersonBadge
                    climberId={p.climberId}
                    name={p.label}
                    serial={dataset.identityRecords.get(p.climberId)?.serial.value ?? ''}
                  />
                  <span style={{ ...TYPE_CAPTION, color: p.status === 'anomaly' ? ANOMALY : p.status === 'watch' ? WATCH : TEXT_DIM }}>
                    {p.status}
                  </span>
                </div>
              ) : (
                <span key={p.id} style={{ ...TYPE_BODY, color: TEXT_SECONDARY }}>
                  {p.label}
                </span>
              )
            )}
          </div>
        </div>
      ) : null}

      {cluster.length > 0 ? (
        <div style={{ marginTop: SPACE_16 }}>
          <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>ALSO FIRING THIS RULE ON THE SAME ROUTE — {cluster.length} MORE</p>
          <div className="flex flex-wrap" style={{ gap: SPACE_8, marginTop: SPACE_8 }}>
            {cluster.map((d) =>
              d.subject.kind === 'climber' ? (
                <PersonBadge key={d.id} climberId={d.subject.climberId} name={d.subject.name} serial={d.subject.serial} />
              ) : null
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function WhatItMeans({
  detection,
  rule,
  logRevision,
}: {
  detection: Detection
  rule: DetectionRule
  logRevision: (s: string) => void
}): ReactElement {
  const who = subjectLabel(detection.subject)
  const consequence =
    rule.severity === 'critical'
      ? `Left unaddressed, ${who} is at real risk of a rapid deterioration.`
      : rule.severity === 'high'
        ? `Left unaddressed, this is likely to escalate to a critical detection.`
        : `Left unaddressed, this will keep costing attention without a clear resolution.`

  const rec: Recommendation = {
    id: detection.id,
    action: rule.severity === 'critical' || rule.severity === 'high' ? `Contact ${who} and confirm status` : `Flag ${who} for the next routine check-in`,
    why: `${rule.label} has been firing for ${formatElapsed(detection.detectedAt)}, at ${Math.round(confidence(detection.valueTraced) * 100)}% confidence.`,
    confidencePct: Math.round(rule.accuracy * 100),
    ifYouDoNothing: consequence,
    onRun: () => logRevision(`${rule.label} on ${who}: contacted, per the recommendation.`),
  }

  return (
    <div style={{ marginTop: SPACE_24 }}>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>WHAT IT MEANS AND WHAT TO DO</p>
      <p style={{ ...TYPE_BODY, color: TEXT_PRIMARY, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
        {consequence}
      </p>
      <div style={{ marginTop: SPACE_16 }}>
        <RecommendationCard rec={rec} />
      </div>
    </div>
  )
}

function ResolvedSection({ resolved, rules }: { resolved: ResolvedDetection[]; rules: DetectionRule[] }): ReactElement {
  return (
    <div style={{ marginTop: SPACE_32 }}>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>RESOLVED — LAST HOUR</p>
      {resolved.length === 0 ? (
        <p style={{ ...TYPE_BODY, color: TEXT_DIM, marginTop: SPACE_16 }}>Nothing has cleared in the last hour.</p>
      ) : (
        <div style={{ marginTop: SPACE_16 }}>
          {resolved.map((r) => {
            const rule = rules.find((rr) => rr.id === r.ruleId)
            if (!rule) return null
            return (
              <div
                key={r.id}
                className="flex items-center justify-between"
                style={{ padding: `${SPACE_8}px 0`, borderBottom: `${BORDER_WIDTH}px solid ${HAIRLINE}` }}
              >
                <span style={{ ...TYPE_BODY, color: TEXT_SECONDARY }}>
                  {rule.label} — {subjectLabel(r.subject)}
                  {r.flapping ? (
                    <span
                      style={{
                        ...TYPE_CAPTION,
                        color: WATCH,
                        marginLeft: SPACE_8,
                        border: `${BORDER_WIDTH}px solid ${WATCH}`,
                        borderRadius: RADIUS_INTERACTIVE,
                        padding: `1px ${SPACE_8}px`,
                      }}
                    >
                      FLAPPING
                    </span>
                  ) : null}
                </span>
                <span style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>
                  {r.clearedBy} · ran {r.ranForMinutes} min · cleared {formatElapsed(r.clearedAt)}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
