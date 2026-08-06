import { useState } from 'react'
import { BORDER_WIDTH, HAIRLINE, PAGE_GUTTER, PANEL_RAISED, RADIUS_INTERACTIVE, RADIUS_STATIC, SPACE_8, SPACE_12, SPACE_32, TEXT_DIM, TEXT_PRIMARY, TEXT_SECONDARY, TYPE_BODY, TYPE_CAPTION } from '../../ase/tokens'
import { useDataset } from '../../ase/store'
import { addHumanRule, type ContextEngineState, type EntityType } from '../../ase/contextEngine'
import { focusRingStyle, useFocusRing } from './focusRing'
import { MeaningList } from './MeaningList'
import { MeaningReading } from './MeaningReading'
import { MeaningRules } from './MeaningRules'
import { MeaningCoverage } from './MeaningCoverage'
import { MeaningImpact } from './MeaningImpact'

type SubTab = 'list' | 'reading' | 'rules' | 'coverage' | 'impact'
const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: 'list', label: 'List' },
  { id: 'reading', label: 'Reading' },
  { id: 'rules', label: 'Rules' },
  { id: 'coverage', label: 'Coverage' },
  { id: 'impact', label: 'Impact' },
]

// S9.7 (complete rebuild): five tabs, same shape as Identity (S9.6) — List
// is the roster and the only entry point that needs nothing selected;
// Reading and Impact are reading-scoped and show "Select a reading in List
// first" until one is; Rules and Coverage are the engine behind everything
// and need no selection.
//
// THE RULE THAT FIXES THE WHOLE TAB: raw field names are never the primary
// label — see ase/contextEngine.ts's own header comment. Every subtab below
// enforces this the same way: a rule's `meaningStatement` or a bound fact's
// own sentence leads; `fieldKey` (the raw name) is secondary, dim, mono.
export function Meaning() {
  const { dataset, logRevision } = useDataset()
  const [subTab, setSubTab] = useState<SubTab>('list')
  const [selectedReadingId, setSelectedReadingId] = useState<string | null>(null)
  const [engine, setEngine] = useState<ContextEngineState>(dataset.contextEngine)
  const [addRulePrefillField, setAddRulePrefillField] = useState<string | null>(null)

  function selectReading(readingId: string) {
    setSelectedReadingId(readingId)
    setSubTab('reading')
  }

  function handleAddRule(fieldKey: string, meaning: string, entityType: EntityType, authority: string) {
    const next = addHumanRule(engine, fieldKey, meaning, entityType, authority)
    setEngine(next)
    logRevision(`Added a rule binding ${fieldKey} to "${meaning}".`)
    setAddRulePrefillField(null)
  }

  function bindThisField(fieldKey: string) {
    setAddRulePrefillField(fieldKey)
    setSubTab('rules')
  }

  const selectedReading = selectedReadingId ? engine.readings.find((r) => r.id === selectedReadingId) ?? null : null

  return (
    <div style={{ padding: PAGE_GUTTER }}>
      <SubNav value={subTab} onChange={setSubTab} />
      <div style={{ marginTop: SPACE_32 }} data-meaning-panel={subTab}>
        {subTab === 'list' && <MeaningList engine={engine} onSelectReading={selectReading} />}
        {subTab === 'reading' && (selectedReading ? <MeaningReading reading={selectedReading} onBindField={bindThisField} /> : <SelectAReadingFirst />)}
        {subTab === 'rules' && <MeaningRules engine={engine} onAddRule={handleAddRule} prefillField={addRulePrefillField} />}
        {subTab === 'coverage' && <MeaningCoverage engine={engine} selectedReading={selectedReading} />}
        {subTab === 'impact' && (selectedReading ? <MeaningImpact reading={selectedReading} dataset={dataset} /> : <SelectAReadingFirst />)}
      </div>
    </div>
  )
}

function SelectAReadingFirst() {
  return <p style={{ ...TYPE_BODY, color: TEXT_DIM }}>Select a reading in List first.</p>
}

function SubNav({ value, onChange }: { value: SubTab; onChange: (v: SubTab) => void }) {
  return (
    <div className="flex justify-end">
      <div className="flex" style={{ gap: SPACE_8, padding: SPACE_8, background: PANEL_RAISED, borderRadius: RADIUS_STATIC, border: `${BORDER_WIDTH}px solid ${HAIRLINE}` }}>
        {SUB_TABS.map((t) => (
          <SubNavPill key={t.id} active={t.id === value} label={t.label} onClick={() => onChange(t.id)} />
        ))}
      </div>
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
