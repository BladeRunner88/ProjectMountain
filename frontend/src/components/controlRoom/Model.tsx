import { useState } from 'react'
import { BORDER_WIDTH, HAIRLINE, PAGE_GUTTER, RADIUS_INTERACTIVE, SPACE_12, SPACE_32, SPACE_8, TEXT_PRIMARY, TEXT_SECONDARY, TYPE_CAPTION } from '../../ase/tokens'
import { useDataset } from '../../ase/store'
import { focusRingStyle, useFocusRing } from './focusRing'
import { ModelQuestions } from './ModelQuestions'
import { ModelSources } from './ModelSources'
import { ModelThings } from './ModelThings'
import { ModelFacts } from './ModelFacts'
import { ModelValidity } from './ModelValidity'
import { ModelRecords } from './ModelRecords'
import { ModelVersions } from './ModelVersions'
import type { ThingKind } from '../../ase/ontology'

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

// S9.5: the Model tab reads the ontology as data (ase/ontology.ts) — every
// number and sentence below comes from `dataset.ontology`, never authored
// in this file. THINGS and FACTS share which kind is selected so clicking a
// kind in one carries over to the other.
export function Model() {
  const [subTab, setSubTab] = useState<SubTab>('questions')
  const [selectedKind, setSelectedKind] = useState<ThingKind>('climber')
  const { dataset } = useDataset()

  return (
    <div style={{ padding: PAGE_GUTTER }}>
      <SubNav value={subTab} onChange={setSubTab} />
      <div style={{ marginTop: SPACE_32 }} data-model-panel={subTab}>
        {subTab === 'questions' && <ModelQuestions ontology={dataset.ontology} />}
        {subTab === 'sources' && <ModelSources ontology={dataset.ontology} />}
        {subTab === 'things' && <ModelThings ontology={dataset.ontology} selectedKind={selectedKind} onSelectKind={setSelectedKind} />}
        {subTab === 'facts' && <ModelFacts ontology={dataset.ontology} selectedKind={selectedKind} onSelectKind={setSelectedKind} />}
        {subTab === 'validity' && <ModelValidity ontology={dataset.ontology} />}
        {subTab === 'records' && <ModelRecords ontology={dataset.ontology} />}
        {subTab === 'versions' && <ModelVersions ontology={dataset.ontology} />}
      </div>
    </div>
  )
}

function SubNav({ value, onChange }: { value: SubTab; onChange: (v: SubTab) => void }) {
  return (
    <div className="flex flex-wrap" style={{ gap: SPACE_8 }}>
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
