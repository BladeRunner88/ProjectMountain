'use client'

import { useMemo, useState, type ReactElement } from 'react'
import {
  BORDER_WIDTH,
  HAIRLINE,
  NOMINAL,
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
  TYPE_DISPLAY,
  WATCH,
} from '@/features/ase/tokens'
import { instant } from '@/features/ase/services/traced'
import {
  needsTuning,
  simulateThreshold,
  subjectLabel,
  type DetectionEngineState,
  type DetectionRule,
  type Suppression,
  type TuningPopulationMember,
} from '@/features/ase/services/detection'
import {
  DirectManipulationSlider,
  PersonBadge,
  RecommendedSection,
  focusRingStyle,
  useFocusRing,
  type Recommendation,
} from '@/features/control-room'

function formatValue(rule: DetectionRule, value: number): string {
  const rounded = Math.round(value * 10) / 10
  return rule.thresholdUnit === '%' ? `${rounded}%` : `${rounded} ${rule.thresholdUnit}`
}

export function DetectionTuning({
  engine,
  rule,
  onSuppress,
  onApplyThreshold,
}: {
  engine: DetectionEngineState
  rule: DetectionRule
  onSuppress: (s: Suppression) => void
  onApplyThreshold: (ruleId: string, newThreshold: number) => void
}): ReactElement {
  const population = useMemo(() => engine.tuningPopulations.get(rule.id) ?? [], [engine.tuningPopulations, rule])
  const range = useMemo(() => thresholdRange(rule), [rule])
  const [candidate, setCandidate] = useState(rule.thresholdValue)

  const liveResult = simulateThreshold(population, rule.thresholdDirection, rule.thresholdValue, candidate)
  const alertsPerDay =
    population.length === 0
      ? 0
      : Math.round((liveResult.firingCount / population.length) * ((24 * 60) / Math.max(rule.windowMinutes ?? 15, 5)))

  const operatorCount = useMemo(() => {
    if (rule.watches !== 'climbers') return null
    const ids = new Set<string>()
    for (const m of population) {
      const subject = m.subject
      if (subject.kind !== 'climber') continue
      const node = engine.mapNodes.find((n) => n.id === subject.nodeId)
      if (node?.parentId) ids.add(node.parentId)
    }
    return ids.size > 0 ? ids.size : null
  }, [population, engine.mapNodes, rule.watches])
  const alertsPerOperatorPerDay = operatorCount ? alertsPerDay / operatorCount : null

  const curve = useMemo(() => {
    const steps = 24
    return Array.from({ length: steps + 1 }, (_, i) => {
      const t = range.min + (i / steps) * (range.max - range.min)
      const r = simulateThreshold(population, rule.thresholdDirection, rule.thresholdValue, t)
      return { threshold: t, accuracyPct: r.accuracyPct, missed: r.missed.length }
    })
  }, [population, rule, range])

  const activeSuppressions = engine.suppressions.filter((s) => s.ruleId === rule.id)

  const retuneRecommendation: Recommendation[] = useMemo(() => {
    if (!needsTuning(rule)) return []
    const first = curve[0]
    if (!first) return []
    const atCurrent = simulateThreshold(population, rule.thresholdDirection, rule.thresholdValue, rule.thresholdValue)
    const best = curve.reduce((b, p) => (p.accuracyPct > b.accuracyPct ? p : b), first)
    const atBest = simulateThreshold(population, rule.thresholdDirection, rule.thresholdValue, best.threshold)
    return [
      {
        id: `retune-${rule.id}`,
        action: `Retune to ${formatValue(rule, best.threshold)}`,
        why: `${rule.label} is right only ${Math.round(rule.accuracy * 100)}% of the time at its current threshold — below the 60% bar ASE treats as reliable enough to trust unattended.`,
        confidencePct: best.accuracyPct,
        ifYouDoNothing: `Firing stays at ${atCurrent.firingCount} a day, right ${atCurrent.accuracyPct}% of the time. Moving to ${formatValue(rule, best.threshold)} would change that to ${atBest.firingCount} ${atBest.firingCount === 1 ? 'firing' : 'firings'} a day, right ${atBest.accuracyPct}% of the time.`,
        doneLabel: 'DONE — THRESHOLD APPLIED',
        onRun: (): void => {
          setCandidate(best.threshold)
          onApplyThreshold(rule.id, best.threshold)
        },
      },
    ]
  }, [rule, population, curve, onApplyThreshold])

  return (
    <div>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>
        {rule.watches.toUpperCase()} · {rule.label.toUpperCase()}
      </p>
      <p style={{ ...TYPE_BODY, color: TEXT_SECONDARY, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
        {rule.conditionSentence}, checked {rule.window === 'live' ? 'continuously' : `over a ${rule.window} window`}.
      </p>

      {retuneRecommendation.length > 0 ? (
        <div style={{ marginTop: SPACE_16 }}>
          <RecommendedSection recommendations={retuneRecommendation} emptyMessage="" />
        </div>
      ) : null}

      <ThresholdSlider
        rule={rule}
        range={range}
        candidate={candidate}
        onChange={setCandidate}
        onApply={() => onApplyThreshold(rule.id, candidate)}
      />

      <div className="grid grid-cols-3" style={{ gap: SPACE_16, marginTop: SPACE_24 }}>
        <Stat label="FIRING AT THIS THRESHOLD" value={String(liveResult.firingCount)} />
        <Stat label="HOW OFTEN RIGHT" value={`${liveResult.accuracyPct}%`} />
        {alertsPerOperatorPerDay !== null ? (
          <Stat label="ALERT LOAD, PER OPERATOR PER DAY (EXTRAPOLATED)" value={alertsPerOperatorPerDay.toFixed(1)} />
        ) : (
          <Stat label="ALERT LOAD, PER DAY (EXTRAPOLATED)" value={String(alertsPerDay)} />
        )}
      </div>

      <WhoChanges result={liveResult} />

      <TradeOffCurve curve={curve} current={rule.thresholdValue} candidate={candidate} />

      <PlainWordsLine rule={rule} candidate={candidate} liveResult={liveResult} />

      <SuppressionPanel
        rule={rule}
        population={population}
        activeSuppressions={activeSuppressions}
        onSuppress={onSuppress}
      />
    </div>
  )
}

function thresholdRange(rule: DetectionRule): { min: number; max: number } {
  const span = Math.max(rule.thresholdValue * 0.6, 10)
  return { min: Math.max(0, rule.thresholdValue - span), max: rule.thresholdValue + span }
}

function ThresholdSlider({
  rule,
  range,
  candidate,
  onChange,
  onApply,
}: {
  rule: DetectionRule
  range: { min: number; max: number }
  candidate: number
  onChange: (v: number) => void
  onApply: () => void
}): ReactElement {
  const changed = candidate !== rule.thresholdValue
  const { focused, handlers } = useFocusRing()
  return (
    <div style={{ marginTop: SPACE_24 }}>
      <div className="flex items-center justify-between">
        <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>THRESHOLD</p>
        <p className="font-mono" style={{ ...TYPE_DISPLAY, color: TEXT_PRIMARY }}>
          {formatValue(rule, candidate)}
        </p>
      </div>
      <div style={{ marginTop: SPACE_16 }}>
        <DirectManipulationSlider
          value={candidate}
          min={range.min}
          max={range.max}
          step={Math.max((range.max - range.min) / 200, 0.1)}
          onChange={onChange}
          ariaLabel={`${rule.label} threshold`}
          accentColor={WATCH}
        />
      </div>
      <div className="flex items-center justify-between">
        <span style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>{formatValue(rule, range.min)}</span>
        {changed ? (
          <span className="flex items-center" style={{ gap: SPACE_8 }}>
            <span style={{ ...TYPE_CAPTION, color: TEXT_SECONDARY, textTransform: 'none', letterSpacing: 'normal' }}>
              currently live at {formatValue(rule, rule.thresholdValue)}
            </span>
            <button
              type="button"
              onClick={onApply}
              {...handlers}
              className="pressable"
              style={{
                ...TYPE_CAPTION,
                textTransform: 'none',
                letterSpacing: 'normal',
                color: NOMINAL,
                border: `${BORDER_WIDTH}px solid ${NOMINAL}`,
                borderRadius: RADIUS_INTERACTIVE,
                padding: `1px ${SPACE_8}px`,
                ...focusRingStyle(focused),
              }}
            >
              APPLY
            </button>
          </span>
        ) : null}
        <span style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>{formatValue(rule, range.max)}</span>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div style={{ padding: SPACE_16, background: PANEL_RAISED, borderRadius: RADIUS_STATIC, border: `${BORDER_WIDTH}px solid ${HAIRLINE}` }}>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>{label}</p>
      <p className="font-mono" style={{ ...TYPE_BODY, color: TEXT_PRIMARY, marginTop: SPACE_8, fontSize: 20 }}>
        {value}
      </p>
    </div>
  )
}

function WhoChanges({ result }: { result: ReturnType<typeof simulateThreshold> }): ReactElement | null {
  if (result.newlyCleared.length === 0 && result.newlyFlagged.length === 0) return null
  return (
    <div style={{ marginTop: SPACE_16 }}>
      {result.newlyCleared.length > 0 ? (
        <div>
          <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>WOULD NO LONGER BE FLAGGED</p>
          <MemberList members={result.newlyCleared} />
        </div>
      ) : null}
      {result.newlyFlagged.length > 0 ? (
        <div style={{ marginTop: SPACE_16 }}>
          <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>WOULD BE NEWLY FLAGGED</p>
          <MemberList members={result.newlyFlagged} />
        </div>
      ) : null}
    </div>
  )
}

function MemberList({ members }: { members: TuningPopulationMember[] }): ReactElement {
  return (
    <div className="flex flex-wrap" style={{ gap: SPACE_8, marginTop: SPACE_8 }}>
      {members.map((m, i) =>
        m.subject.kind === 'climber' ? (
          <PersonBadge key={i} climberId={m.subject.climberId} name={m.subject.name} serial={m.subject.serial} />
        ) : (
          <span key={i} style={{ ...TYPE_BODY, color: TEXT_SECONDARY }}>
            {subjectLabel(m.subject)}
          </span>
        )
      )}
    </div>
  )
}

function TradeOffCurve({
  curve,
  current,
  candidate,
}: {
  curve: { threshold: number; accuracyPct: number; missed: number }[]
  current: number
  candidate: number
}): ReactElement | null {
  const first = curve[0]
  if (!first) {
    return (
      <div style={{ marginTop: SPACE_24 }}>
        <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>ACCURACY AGAINST WHAT GETS MISSED</p>
        <p style={{ ...TYPE_BODY, color: TEXT_DIM, marginTop: SPACE_8 }}>No tuning population for this rule.</p>
      </div>
    )
  }
  const width = 480
  const height = 140
  const maxMissed = Math.max(...curve.map((p) => p.missed), 1)
  const x = (missed: number): number => (missed / maxMissed) * (width - 20) + 10
  const y = (acc: number): number => height - 10 - (acc / 100) * (height - 20)
  const sorted = [...curve].sort((a, b) => a.missed - b.missed)
  const path = sorted.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.missed)} ${y(p.accuracyPct)}`).join(' ')

  function nearest(threshold: number): { threshold: number; accuracyPct: number; missed: number } {
    return curve.reduce((best, p) => (Math.abs(p.threshold - threshold) < Math.abs(best.threshold - threshold) ? p : best), first)
  }
  const currentPoint = nearest(current)
  const candidatePoint = nearest(candidate)

  return (
    <div style={{ marginTop: SPACE_24 }}>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>ACCURACY AGAINST WHAT GETS MISSED</p>
      <svg width={width} height={height} style={{ marginTop: SPACE_8, overflow: 'visible' }}>
        <path d={path} fill="none" stroke={TEXT_DIM} strokeWidth={1.5} />
        <circle cx={x(currentPoint.missed)} cy={y(currentPoint.accuracyPct)} r={4} fill={NOMINAL} />
        {candidate !== current ? (
          <circle cx={x(candidatePoint.missed)} cy={y(candidatePoint.accuracyPct)} r={4} fill={WATCH} />
        ) : null}
      </svg>
      <div className="flex items-center" style={{ gap: SPACE_16, marginTop: SPACE_8 }}>
        <span className="flex items-center" style={{ gap: SPACE_8, ...TYPE_CAPTION, color: TEXT_DIM }}>
          <Dot color={NOMINAL} /> current
        </span>
        {candidate !== current ? (
          <span className="flex items-center" style={{ gap: SPACE_8, ...TYPE_CAPTION, color: TEXT_DIM }}>
            <Dot color={WATCH} /> dragged position
          </span>
        ) : null}
      </div>
    </div>
  )
}

function Dot({ color }: { color: string }): ReactElement {
  return <span aria-hidden style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />
}

function PlainWordsLine({
  rule,
  candidate,
  liveResult,
}: {
  rule: DetectionRule
  candidate: number
  liveResult: ReturnType<typeof simulateThreshold>
}): ReactElement {
  let sentence: string
  if (liveResult.newlyCleared.length > 0) {
    const critical = liveResult.newlyCleared.filter((m) => m.actuallyDeteriorated).length
    sentence = `Tightening this to ${formatValue(rule, candidate)} would stop flagging ${liveResult.newlyCleared.length} ${liveResult.newlyCleared.length === 1 ? 'person' : 'people'}${
      critical > 0 ? `, ${critical} of whom later needed real attention` : ''
    }.`
  } else if (liveResult.newlyFlagged.length > 0) {
    sentence = `Loosening this to ${formatValue(rule, candidate)} would newly flag ${liveResult.newlyFlagged.length} more ${liveResult.newlyFlagged.length === 1 ? 'entity' : 'entities'}.`
  } else {
    sentence = `No change at ${formatValue(rule, candidate)} — the same ${liveResult.firingCount} would still be flagged.`
  }
  return (
    <p style={{ ...TYPE_BODY, color: TEXT_PRIMARY, marginTop: SPACE_16, textTransform: 'none', letterSpacing: 'normal' }}>
      {sentence}
    </p>
  )
}

function SuppressionPanel({
  rule,
  population,
  activeSuppressions,
  onSuppress,
}: {
  rule: DetectionRule
  population: TuningPopulationMember[]
  activeSuppressions: Suppression[]
  onSuppress: (s: Suppression) => void
}): ReactElement {
  const [subjectIdx, setSubjectIdx] = useState('')
  const [reason, setReason] = useState('')
  const { focused: selectFocused, handlers: selectHandlers } = useFocusRing()
  const { focused: reasonFocused, handlers: reasonHandlers } = useFocusRing()
  const { focused: buttonFocused, handlers: buttonHandlers } = useFocusRing()

  const canSubmit = subjectIdx !== '' && reason.trim().length > 0

  function submit(): void {
    const member = population[Number(subjectIdx)]
    if (!member) return
    const now = new Date()
    onSuppress({
      id: `suppression-${rule.id}-${now.getTime()}`,
      ruleId: rule.id,
      subject: member.subject,
      reason: reason.trim(),
      setBy: 'You',
      setAt: instant(now.toISOString()),
      expiresAt: instant(new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString()),
    })
    setSubjectIdx('')
    setReason('')
  }

  return (
    <div style={{ marginTop: SPACE_32 }}>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>SUPPRESSION</p>
      <p style={{ ...TYPE_BODY, color: TEXT_SECONDARY, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
        Suppress this rule for one person or sensor, with a reason. Expires in 24 hours.
      </p>
      {population.length === 0 ? (
        <p style={{ ...TYPE_BODY, color: TEXT_DIM, marginTop: SPACE_16 }}>{`No subjects in this rule's population.`}</p>
      ) : (
        <div className="flex items-center flex-wrap" style={{ gap: SPACE_8, marginTop: SPACE_16 }}>
          <select
            value={subjectIdx}
            onChange={(e) => setSubjectIdx(e.target.value)}
            aria-label="Suppress for"
            {...selectHandlers}
            style={{
              ...TYPE_CAPTION,
              textTransform: 'none',
              letterSpacing: 'normal',
              color: subjectIdx ? TEXT_PRIMARY : TEXT_SECONDARY,
              background: PANEL_RAISED,
              border: `${BORDER_WIDTH}px solid ${HAIRLINE}`,
              borderRadius: RADIUS_INTERACTIVE,
              padding: SPACE_8,
              ...focusRingStyle(selectFocused),
            }}
          >
            <option value="">Who…</option>
            {population.map((m, i) => (
              <option key={i} value={i}>
                {subjectLabel(m.subject)}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason"
            aria-label="Suppression reason"
            {...reasonHandlers}
            style={{
              ...TYPE_CAPTION,
              textTransform: 'none',
              letterSpacing: 'normal',
              color: TEXT_PRIMARY,
              background: PANEL_RAISED,
              border: `${BORDER_WIDTH}px solid ${HAIRLINE}`,
              borderRadius: RADIUS_INTERACTIVE,
              padding: SPACE_8,
              flex: 1,
              ...focusRingStyle(reasonFocused),
            }}
          />
          <button
            type="button"
            disabled={!canSubmit}
            onClick={submit}
            {...buttonHandlers}
            className="pressable"
            style={{
              ...TYPE_CAPTION,
              textTransform: 'none',
              letterSpacing: 'normal',
              color: canSubmit ? TEXT_PRIMARY : TEXT_DIM,
              border: `${BORDER_WIDTH}px solid ${canSubmit ? TEXT_SECONDARY : HAIRLINE}`,
              borderRadius: RADIUS_INTERACTIVE,
              padding: `${SPACE_8}px ${SPACE_16}px`,
              cursor: canSubmit ? 'pointer' : 'not-allowed',
              ...focusRingStyle(buttonFocused),
            }}
          >
            SUPPRESS
          </button>
        </div>
      )}

      {activeSuppressions.length > 0 ? (
        <div style={{ marginTop: SPACE_16 }}>
          <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>ACTIVE SUPPRESSIONS</p>
          {activeSuppressions.map((s) => (
            <div key={s.id} style={{ padding: `${SPACE_8}px 0`, borderBottom: `${BORDER_WIDTH}px solid ${HAIRLINE}` }}>
              <p style={{ ...TYPE_BODY, color: TEXT_PRIMARY }}>
                {subjectLabel(s.subject)} — {s.reason}
              </p>
              <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
                set by {s.setBy} · expires{' '}
                {new Date(s.expiresAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
