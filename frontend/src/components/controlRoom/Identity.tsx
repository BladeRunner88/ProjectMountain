import { useEffect, useState } from 'react'
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
} from '../../ase/tokens'
import { useDataset } from '../../ase/store'
import { useSelection } from '../../ase/selection'
import { focusRingStyle, useFocusRing } from './focusRing'
import { DEFAULT_THRESHOLDS, DEFAULT_WEIGHTS, type DecisionThresholds, type ScoringWeights } from '../../ase/entityResolution'
import { IdentityList } from './IdentityList'
import { IdentitySourceRecords } from './IdentitySourceRecords'
import { IdentityMethod } from './IdentityMethod'
import { IdentityScoringTab } from './IdentityScoringTab'
import { IdentityDecisionTab } from './IdentityDecisionTab'

type SubTab = 'list' | 'source-records' | 'method' | 'scoring' | 'decision'
const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: 'list', label: 'List' },
  { id: 'source-records', label: 'Source records' },
  { id: 'method', label: 'Method' },
  { id: 'scoring', label: 'Scoring' },
  { id: 'decision', label: 'Decision' },
]

// S9.6 (complete rebuild): five tabs — List is the roster and the only
// entry point; Source records, Scoring and Decision are person-scoped and
// need a selection; Method is engine configuration and needs nothing
// selected. `selectedClimberId` is local (not the global Inspector
// selection) because List/the node chart have to keep pointing at the same
// person even if the user clicks an unrelated Metric elsewhere on screen —
// but every person-select here also DOES set the global selection, so the
// Inspector's S9.5b identity record stays in sync with whoever this tab is
// currently looking at.
export function Identity() {
  const [subTab, setSubTab] = useState<SubTab>('list')
  const [selectedClimberId, setSelectedClimberId] = useState<string | null>(null)
  const [weights, setWeights] = useState<ScoringWeights>(DEFAULT_WEIGHTS)
  const [thresholds, setThresholds] = useState<DecisionThresholds>(DEFAULT_THRESHOLDS)
  const { dataset } = useDataset()
  const { select, selection } = useSelection()

  function selectPerson(climberId: string, moveToSourceRecords: boolean) {
    setSelectedClimberId(climberId)
    select({ kind: 'identity', climberId })
    if (moveToSourceRecords) setSubTab('source-records')
  }

  // S9.6b convention #1: "jumping to Identity always lands on whoever was
  // last discussed." PersonBadge (or anything else) sets the global
  // selection to {kind:'identity', climberId} from anywhere in the Control
  // Room; this is the other half of that contract — picking it up on
  // arrival (mount, or a genuine change of person) without clobbering an
  // in-progress Method/Scoring view if the person hasn't actually changed.
  useEffect(() => {
    if (selection?.kind === 'identity' && selection.climberId !== selectedClimberId) {
      setSelectedClimberId(selection.climberId)
      setSubTab('source-records')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection])

  return (
    <div style={{ padding: PAGE_GUTTER }}>
      <SubNav value={subTab} onChange={setSubTab} />
      <div style={{ marginTop: SPACE_32 }} data-identity-panel={subTab}>
        {subTab === 'list' && <IdentityList dataset={dataset} onSelectPerson={(id) => selectPerson(id, true)} />}
        {subTab === 'source-records' &&
          (selectedClimberId ? (
            <IdentitySourceRecords dataset={dataset} climberId={selectedClimberId} onSelectPerson={(id) => selectPerson(id, false)} />
          ) : (
            <SelectSomeoneFirst />
          ))}
        {subTab === 'method' && (
          <IdentityMethod
            data={dataset.entityResolution}
            weights={weights}
            onChangeWeights={setWeights}
            thresholds={thresholds}
            onChangeThresholds={setThresholds}
          />
        )}
        {subTab === 'scoring' &&
          (selectedClimberId ? (
            <IdentityScoringTab dataset={dataset} climberId={selectedClimberId} weights={weights} thresholds={thresholds} />
          ) : (
            <SelectSomeoneFirst />
          ))}
        {subTab === 'decision' &&
          (selectedClimberId ? (
            <IdentityDecisionTab
              dataset={dataset}
              climberId={selectedClimberId}
              weights={weights}
              thresholds={thresholds}
              onSelectPerson={(id) => selectPerson(id, false)}
            />
          ) : (
            <SelectSomeoneFirst />
          ))}
      </div>
    </div>
  )
}

function SelectSomeoneFirst() {
  return <p style={{ ...TYPE_BODY, color: TEXT_DIM }}>Select someone in List first.</p>
}

// Right-aligned and visually distinct from the main Control Room tab bar
// (S9.6) — a bordered, raised pill group, rather than the bare left-aligned
// pills every other tab's own sub-nav uses.
function SubNav({ value, onChange }: { value: SubTab; onChange: (v: SubTab) => void }) {
  return (
    <div className="flex justify-end">
      <div
        className="flex"
        style={{ gap: SPACE_8, padding: SPACE_8, background: PANEL_RAISED, borderRadius: RADIUS_STATIC, border: `${BORDER_WIDTH}px solid ${HAIRLINE}` }}
      >
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
