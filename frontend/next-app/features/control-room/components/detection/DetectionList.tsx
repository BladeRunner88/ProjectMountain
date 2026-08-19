'use client'

import { useMemo, type ReactElement } from 'react'
import {
  ANOMALY,
  BORDER_WIDTH,
  HAIRLINE,
  PANEL_PADDING,
  PANEL_RAISED,
  RADIUS_INTERACTIVE,
  ROW_HEIGHT_DEFAULT,
  SPACE_8,
  STATUS_DOT_SIZE,
  TEXT_DIM,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  TYPE_BODY,
  TYPE_CAPTION,
  WATCH,
} from '@/features/ase/tokens'
import { useSelection } from '@/features/ase/client'
import {
  firingCount,
  needsTuning,
  subjectLabel,
  type DetectionEngineState,
  type DetectionRule,
} from '@/features/ase/services/detection'
import { focusRingStyle, useFocusRing } from '@/features/control-room'

const ROW_HEIGHT = ROW_HEIGHT_DEFAULT

export function DetectionList({
  engine,
  selectedRuleId,
  onSelectRule,
}: {
  engine: DetectionEngineState
  selectedRuleId: string | null
  onSelectRule: (ruleId: string) => void
}): ReactElement {
  const { select } = useSelection()

  const rows = useMemo(() => {
    return engine.rules
      .map((rule) => ({ rule, firing: firingCount(engine, rule.id) }))
      .sort((a, b) => (b.firing > 0 ? 1 : 0) - (a.firing > 0 ? 1 : 0) || b.firing - a.firing)
  }, [engine])

  function activate(rule: DetectionRule): void {
    onSelectRule(rule.id)
    const entities = engine.detections
      .filter((d) => d.ruleId === rule.id && !d.suppressed)
      .map((d) =>
        d.subject.kind === 'machine'
          ? { machineId: d.subject.machineId, label: d.subject.name, serial: d.subject.serial }
          : { label: subjectLabel(d.subject) }
      )
    select({ kind: 'ruleFiring', ruleLabel: rule.label, entities })
  }

  if (rows.length === 0) {
    return <p style={{ ...TYPE_BODY, color: TEXT_DIM }}>No detection rules to show.</p>
  }

  return (
    <div>
      <HeaderRow />
      {rows.map(({ rule, firing }) => (
        <Row
          key={rule.id}
          rule={rule}
          firing={firing}
          selected={rule.id === selectedRuleId}
          onSelect={() => activate(rule)}
        />
      ))}
    </div>
  )
}

function HeaderRow(): ReactElement {
  return (
    <div
      className="flex shrink-0 items-center"
      style={{ borderBottom: `${BORDER_WIDTH}px solid ${HAIRLINE}`, padding: `${SPACE_8}px ${PANEL_PADDING}px` }}
    >
      <span style={{ ...TYPE_CAPTION, color: TEXT_DIM, flex: 0.4 }} />
      <span style={{ ...TYPE_CAPTION, color: TEXT_DIM, flex: 2 }}>RULE</span>
      <span style={{ ...TYPE_CAPTION, color: TEXT_DIM, flex: 1 }}>WATCHES</span>
      <span style={{ ...TYPE_CAPTION, color: TEXT_DIM, flex: 2.4 }}>CONDITION</span>
      <span style={{ ...TYPE_CAPTION, color: TEXT_DIM, flex: 0.8 }}>WINDOW</span>
      <span style={{ ...TYPE_CAPTION, color: TEXT_DIM, flex: 0.9 }}>SEVERITY</span>
      <span style={{ ...TYPE_CAPTION, color: TEXT_DIM, flex: 1 }}>FIRING NOW</span>
      <span style={{ ...TYPE_CAPTION, color: TEXT_DIM, flex: 1.1 }}>HOW OFTEN RIGHT</span>
    </div>
  )
}

const SEVERITY_LABEL: Record<DetectionRule['severity'], string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}

function Row({
  rule,
  firing,
  selected,
  onSelect,
}: {
  rule: DetectionRule
  firing: number
  selected: boolean
  onSelect: () => void
}): ReactElement {
  const { focused, handlers } = useFocusRing()
  const tuning = needsTuning(rule)
  const isFiring = firing > 0
  const dotColor = isFiring ? ANOMALY : tuning ? WATCH : TEXT_DIM

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
        padding: `${SPACE_8}px ${PANEL_PADDING}px`,
        borderBottom: `${BORDER_WIDTH}px solid ${HAIRLINE}`,
        background: selected ? PANEL_RAISED : 'transparent',
        minHeight: ROW_HEIGHT,
        ...focusRingStyle(focused),
      }}
    >
      <span style={{ flex: 0.4 }}>
        <span
          aria-hidden
          style={{
            width: STATUS_DOT_SIZE,
            height: STATUS_DOT_SIZE,
            borderRadius: '50%',
            background: dotColor,
            display: 'inline-block',
          }}
        />
      </span>
      <span style={{ color: isFiring ? ANOMALY : TEXT_PRIMARY, flex: 2 }}>{rule.label}</span>
      <span style={{ color: TEXT_SECONDARY, flex: 1, textTransform: 'capitalize' }}>{rule.watches}</span>
      <span style={{ color: TEXT_SECONDARY, flex: 2.4 }}>{rule.conditionSentence}</span>
      <span className="font-mono" style={{ color: TEXT_DIM, flex: 0.8 }}>
        {rule.window}
      </span>
      <span style={{ color: TEXT_SECONDARY, flex: 0.9 }}>{SEVERITY_LABEL[rule.severity]}</span>
      <span className="font-mono" style={{ color: isFiring ? ANOMALY : TEXT_DIM, flex: 1 }}>
        {firing}
      </span>
      <span className="flex items-center" style={{ flex: 1.1, gap: SPACE_8 }}>
        <span className="font-mono" style={{ color: tuning ? WATCH : TEXT_PRIMARY }}>
          {Math.round(rule.accuracy * 100)}%
        </span>
        {tuning ? (
          <span
            style={{
              ...TYPE_CAPTION,
              color: WATCH,
              border: `${BORDER_WIDTH}px solid ${WATCH}`,
              borderRadius: RADIUS_INTERACTIVE,
              padding: `1px ${SPACE_8}px`,
            }}
          >
            NEEDS TUNING
          </span>
        ) : null}
      </span>
    </div>
  )
}
