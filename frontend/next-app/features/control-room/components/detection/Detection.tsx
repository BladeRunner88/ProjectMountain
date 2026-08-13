'use client'

import { useState, type ReactElement } from 'react'
import {
  BORDER_WIDTH,
  HAIRLINE,
  PAGE_GUTTER,
  PANEL_RAISED,
  RADIUS_INTERACTIVE,
  RADIUS_STATIC,
  SPACE_8,
  SPACE_12,
  SPACE_32,
  TEXT_DIM,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  TYPE_BODY,
  TYPE_CAPTION,
} from '@/features/ase/tokens'
import { useDataset } from '@/features/ase/client'
import {
  applySuppression,
  applyThresholdChange,
  type DetectionEngineState,
  type Suppression,
} from '@/features/ase/services/detection'
import { focusRingStyle, useFocusRing } from '@/features/control-room'
import { DetectionList } from './DetectionList'
import { DetectionMap } from './DetectionMap'
import { DetectionDetections } from './DetectionDetections'
import { DetectionTuning } from './DetectionTuning'

type SubTab = 'list' | 'map' | 'detections' | 'tuning'
const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: 'list', label: 'List' },
  { id: 'map', label: 'Map' },
  { id: 'detections', label: 'Detections' },
  { id: 'tuning', label: 'Tuning' },
]

export function Detection(): ReactElement {
  const { dataset, logRevision } = useDataset()
  const [subTab, setSubTab] = useState<SubTab>('list')
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null)
  const [selectedSubjectNodeId, setSelectedSubjectNodeId] = useState<string | null>(null)
  const [selectedDetectionId, setSelectedDetectionId] = useState<string | null>(null)
  const [engine, setEngine] = useState<DetectionEngineState>(dataset.detectionEngine)

  function selectRule(ruleId: string): void {
    setSelectedRuleId(ruleId)
    setSelectedSubjectNodeId(null)
  }
  function selectSubjectAndGoToDetections(nodeId: string): void {
    setSelectedSubjectNodeId(nodeId)
    setSelectedRuleId(null)
    setSubTab('detections')
  }
  function selectDetection(detectionId: string | null): void {
    setSelectedDetectionId(detectionId)
  }
  function handleSuppress(suppression: Suppression): void {
    const next = applySuppression(engine, suppression)
    setEngine(next)
    const ruleLabel = engine.rules.find((r) => r.id === suppression.ruleId)?.label ?? suppression.ruleId
    const who = suppression.subject.kind === 'climber' ? suppression.subject.name : suppression.subject.label
    logRevision(`Suppressed "${ruleLabel}" for ${who} — ${suppression.reason}`)
  }
  function handleApplyThreshold(ruleId: string, newThreshold: number): void {
    const rule = engine.rules.find((r) => r.id === ruleId)
    const from = rule?.thresholdValue
    setEngine(applyThresholdChange(engine, ruleId, newThreshold))
    logRevision(
      `"${rule?.label ?? ruleId}" threshold changed from ${from}${rule?.thresholdUnit ?? ''} to ${newThreshold}${rule?.thresholdUnit ?? ''}, by you.`
    )
  }

  const selectedRule = selectedRuleId ? (engine.rules.find((r) => r.id === selectedRuleId) ?? null) : null

  return (
    <div style={{ padding: PAGE_GUTTER }}>
      <SubNav value={subTab} onChange={setSubTab} />
      <div style={{ marginTop: SPACE_32 }} data-detection-panel={subTab}>
        <div style={{ display: subTab === 'list' ? 'block' : 'none' }}>
          <DetectionList engine={engine} selectedRuleId={selectedRuleId} onSelectRule={selectRule} />
        </div>
        <div style={{ display: subTab === 'map' ? 'block' : 'none' }}>
          <DetectionMap engine={engine} selectedRuleId={selectedRuleId} onSelectSubject={selectSubjectAndGoToDetections} />
        </div>
        <div style={{ display: subTab === 'detections' ? 'block' : 'none' }}>
          <DetectionDetections
            engine={engine}
            dataset={dataset}
            logRevision={logRevision}
            selectedRuleId={selectedRuleId}
            selectedSubjectNodeId={selectedSubjectNodeId}
            selectedDetectionId={selectedDetectionId}
            onSelectDetection={selectDetection}
          />
        </div>
        <div style={{ display: subTab === 'tuning' ? 'block' : 'none' }}>
          {selectedRule ? (
            <DetectionTuning
              engine={engine}
              rule={selectedRule}
              onSuppress={handleSuppress}
              onApplyThreshold={handleApplyThreshold}
            />
          ) : (
            <SelectARuleFirst />
          )}
        </div>
      </div>
    </div>
  )
}

function SelectARuleFirst(): ReactElement {
  return <p style={{ ...TYPE_BODY, color: TEXT_DIM }}>Select a rule in List first.</p>
}

function SubNav({ value, onChange }: { value: SubTab; onChange: (v: SubTab) => void }): ReactElement {
  return (
    <div className="flex justify-end">
      <div
        className="flex"
        style={{
          gap: SPACE_8,
          padding: SPACE_8,
          background: PANEL_RAISED,
          borderRadius: RADIUS_STATIC,
          border: `${BORDER_WIDTH}px solid ${HAIRLINE}`,
        }}
      >
        {SUB_TABS.map((t) => (
          <SubNavPill key={t.id} active={t.id === value} label={t.label} onClick={() => onChange(t.id)} />
        ))}
      </div>
    </div>
  )
}

function SubNavPill({
  active,
  label,
  onClick,
}: {
  active: boolean
  label: string
  onClick: () => void
}): ReactElement {
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
        background: active ? HAIRLINE : 'transparent',
        border: `${BORDER_WIDTH}px solid ${active ? TEXT_SECONDARY : 'transparent'}`,
        borderRadius: RADIUS_INTERACTIVE,
        padding: `${SPACE_8}px ${SPACE_12}px`,
        ...focusRingStyle(focused),
      }}
    >
      {label}
    </button>
  )
}
