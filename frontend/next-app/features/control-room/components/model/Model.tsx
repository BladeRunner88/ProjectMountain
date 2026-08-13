'use client'

import { useState, type ReactElement } from 'react'
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
  TYPE_CAPTION,
} from '@/features/ase/tokens'
import { useDataset } from '@/features/ase/client'
import type { ThingKind } from '@/features/ase/services/ontology'
import { useFocusRing, focusRingStyle } from '@/features/control-room'
import { ModelQuestions } from './ModelQuestions'
import { ModelSources } from './ModelSources'
import { ModelThings } from './ModelThings'
import { ModelFacts } from './ModelFacts'
import { ModelValidity } from './ModelValidity'
import { ModelRecords } from './ModelRecords'
import { ModelVersions } from './ModelVersions'

type SubTab = 'questions' | 'sources' | 'things' | 'facts' | 'validity' | 'records' | 'versions'
const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: 'questions', label: 'Questions' },
  { id: 'sources', label: 'Sources' },
  { id: 'things', label: 'Things' },
  { id: 'facts', label: 'Facts' },
  { id: 'validity', label: 'Validity' },
  { id: 'records', label: 'Records' },
  { id: 'versions', label: 'Versions' },
]

export function Model(): ReactElement {
  const [subTab, setSubTab] = useState<SubTab>('questions')
  const [selectedKind, setSelectedKind] = useState<ThingKind>('climber')
  const { dataset } = useDataset()
  const ontology = dataset.ontology

  return (
    <div style={{ padding: PAGE_GUTTER }}>
      <SubNav value={subTab} onChange={setSubTab} />
      <div style={{ marginTop: SPACE_32 }} data-model-panel={subTab}>
        {subTab === 'questions' ? <ModelQuestions ontology={ontology} /> : null}
        {subTab === 'sources' ? <ModelSources ontology={ontology} /> : null}
        {subTab === 'things' ? (
          <ModelThings ontology={ontology} selectedKind={selectedKind} onSelectKind={setSelectedKind} />
        ) : null}
        {subTab === 'facts' ? (
          <ModelFacts ontology={ontology} selectedKind={selectedKind} onSelectKind={setSelectedKind} />
        ) : null}
        {subTab === 'validity' ? <ModelValidity ontology={ontology} /> : null}
        {subTab === 'records' ? <ModelRecords ontology={ontology} /> : null}
        {subTab === 'versions' ? <ModelVersions ontology={ontology} /> : null}
      </div>
    </div>
  )
}

function SubNav({ value, onChange }: { value: SubTab; onChange: (v: SubTab) => void }): ReactElement {
  return (
    <div className="flex flex-wrap" style={{ gap: SPACE_8 }}>
      {SUB_TABS.map((t) => (
        <SubNavPill key={t.id} active={t.id === value} label={t.label} onClick={() => onChange(t.id)} />
      ))}
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
