import { useState } from 'react'
import {
  BORDER_WIDTH,
  HAIRLINE,
  PAGE_GUTTER,
  RADIUS_INTERACTIVE,
  SPACE_12,
  SPACE_32,
  SPACE_8,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  TYPE_BODY,
  TYPE_CAPTION,
} from '../../ase/tokens'
import { useDataset } from '../../ase/store'
import type { PipelineStage, StageState } from '../../ase/dataset'
import { FlowDiagram } from './FlowDiagram'
import { EvidenceTable, type EvidenceRow } from './EvidenceTable'
import { focusRingStyle, useFocusRing } from './focusRing'

type SubTab = 'flow' | 'stages' | 'runtime' | 'deploy'
const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: 'flow', label: 'Flow' },
  { id: 'stages', label: 'Stages' },
  { id: 'runtime', label: 'Runtime' },
  { id: 'deploy', label: 'Deploy' },
]

export function Processing() {
  const [subTab, setSubTab] = useState<SubTab>('flow')
  const { dataset } = useDataset()

  return (
    <div style={{ padding: PAGE_GUTTER }}>
      <SubNav value={subTab} onChange={setSubTab} />
      <div style={{ marginTop: SPACE_32 }} data-processing-panel={subTab}>
        {subTab === 'flow' && <FlowDiagram stages={dataset.stages} />}
        {subTab === 'stages' && <StagesTable stages={dataset.stages} />}
        {subTab === 'runtime' && <RuntimePanel />}
        {subTab === 'deploy' && <DeployPanel />}
      </div>
    </div>
  )
}

function SubNav({ value, onChange }: { value: SubTab; onChange: (v: SubTab) => void }) {
  return (
    <div className="flex" style={{ gap: SPACE_8 }}>
      {SUB_TABS.map((t) => (
        <SubNavPill key={t.id} active={t.id === value} label={t.label} onClick={() => onChange(t.id)} />
      ))}
    </div>
  )
}

function SubNavPill({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
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
        border: `${BORDER_WIDTH}px solid ${active ? TEXT_SECONDARY : HAIRLINE}`,
        borderRadius: RADIUS_INTERACTIVE,
        padding: `${SPACE_8}px ${SPACE_12}px`,
        ...focusRingStyle(focused),
      }}
    >
      {label}
    </button>
  )
}

function StagesTable({ stages }: { stages: PipelineStage[] }) {
  const rows: EvidenceRow[] = stages.map((s) => ({
    id: `stage-${s.n}`,
    traced: s.throughput,
    label: s.name,
    claimSortValue: s.n,
    why: `${stateSentence(s.state)} ${s.description}`,
    format: (v) => `${v as number}/s`,
  }))
  return <EvidenceTable rows={rows} />
}

function stateSentence(state: StageState): string {
  if (state === 'running') return 'Running normally.'
  if (state === 'catching_up') return 'Catching up on a backlog.'
  return 'Degraded — throughput is below its normal range.'
}

// Plain-language only (S1f): a sentence with the number embedded, never an
// isolated numeral — these describe the deployment itself, not a fact ASE
// resolved from a source, so they read as prose rather than through Metric.
function RuntimePanel() {
  return (
    <div className="flex flex-col" style={{ gap: SPACE_12 }}>
      <RuntimeLine>If a worker fails, at most 5 minutes of processing replays from where it left off.</RuntimeLine>
      <RuntimeLine>A full recovery from a total outage is targeted to take under 30 minutes.</RuntimeLine>
      <RuntimeLine>Each stage runs on its own worker pool, so a slowdown in one stage doesn't stall the others.</RuntimeLine>
      <RuntimeLine>Retries back off automatically, so a source that comes back online catches up on its own.</RuntimeLine>
    </div>
  )
}

function DeployPanel() {
  return (
    <div className="flex flex-col" style={{ gap: SPACE_12 }}>
      <RuntimeLine>Runs entirely on infrastructure your team controls — nothing about your data leaves your environment.</RuntimeLine>
      <RuntimeLine>Every stage can be upgraded on its own, without stopping the rest of the pipeline.</RuntimeLine>
      <RuntimeLine>Configuration changes are versioned, so any change can be reviewed and rolled back.</RuntimeLine>
    </div>
  )
}

function RuntimeLine({ children }: { children: string }) {
  return <p style={{ ...TYPE_BODY, color: TEXT_SECONDARY }}>{children}</p>
}
