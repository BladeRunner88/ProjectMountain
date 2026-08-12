import { useMemo, useState } from 'react'
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
import { ROLE_LABEL, type Role } from './revisionPermissions'
import { RevisionQueue } from './RevisionQueue'
import { RevisionImpact } from './RevisionImpact'
import { RevisionRecord } from './RevisionRecord'
import { RevisionLearning } from './RevisionLearning'
import { RevisionTimeline } from './RevisionTimeline'
import { focusRingStyle, useFocusRing } from './focusRing'

type SubTab = 'queue' | 'impact' | 'record' | 'learning' | 'timeline'
const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: 'queue', label: 'Queue' },
  { id: 'impact', label: 'Impact' },
  { id: 'record', label: 'Record' },
  { id: 'learning', label: 'Learning' },
  { id: 'timeline', label: 'Timeline' },
]
const ROLES: Role[] = ['coordinator', 'medic', 'guide', 'observer']

// S9.11 (complete rebuild): five tabs — Queue is the entry point; Impact is
// scoped to whichever queue item was last selected; Record, Learning and
// Timeline are global, like Method on Identity and Calibration on
// Prediction. Role governs every action button across all five (S9.11
// cross-cutting) — a role selector lives here, once, rather than each
// subtab reinventing it.
export function Revision() {
  const { dataset, extraQueueItems } = useDataset()
  const [subTab, setSubTab] = useState<SubTab>('queue')
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [role, setRole] = useState<Role>('coordinator')

  // S9.13: "Trust feeds Revision" — a challenged decision, a security
  // finding, a coverage drop or a budget violation genuinely lands in this
  // SAME queue, merged here rather than a second list RevisionQueue/
  // RevisionImpact would have to know about separately.
  const state = useMemo(() => (extraQueueItems.length === 0 ? dataset.revision : { ...dataset.revision, queue: [...dataset.revision.queue, ...extraQueueItems] }), [dataset.revision, extraQueueItems])

  function selectItem(itemId: string, moveToImpact: boolean) {
    setSelectedItemId(itemId)
    if (moveToImpact) setSubTab('impact')
  }

  return (
    <div style={{ padding: PAGE_GUTTER }}>
      <div className="flex items-center justify-between">
        <RoleSelector role={role} onChange={setRole} />
        <SubNav value={subTab} onChange={setSubTab} />
      </div>
      <div style={{ marginTop: SPACE_32 }} data-revision-panel={subTab}>
        {subTab === 'queue' && <RevisionQueue state={state} role={role} onSelectItem={(id) => selectItem(id, true)} />}
        {subTab === 'impact' &&
          (selectedItemId ? (
            <RevisionImpact state={state} itemId={selectedItemId} role={role} reliability={dataset.predictions.calibration.reliability} />
          ) : (
            <SelectAnItemFirst />
          ))}
        {subTab === 'record' && <RevisionRecord role={role} />}
        {subTab === 'learning' && <RevisionLearning state={dataset.revision} role={role} />}
        {subTab === 'timeline' && <RevisionTimeline state={dataset.revision} />}
      </div>
    </div>
  )
}

function SelectAnItemFirst() {
  return <p style={{ ...TYPE_BODY, color: TEXT_DIM }}>Select an item in Queue first.</p>
}

function RoleSelector({ role, onChange }: { role: Role; onChange: (r: Role) => void }) {
  return (
    <div className="flex items-center" style={{ gap: SPACE_8 }}>
      <span style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>ROLE</span>
      <select
        value={role}
        onChange={(e) => onChange(e.target.value as Role)}
        aria-label="Current role"
        style={{
          ...TYPE_CAPTION,
          textTransform: 'none',
          letterSpacing: 'normal',
          color: TEXT_PRIMARY,
          background: PANEL_RAISED,
          border: `${BORDER_WIDTH}px solid ${HAIRLINE}`,
          borderRadius: RADIUS_INTERACTIVE,
          padding: SPACE_8,
        }}
      >
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABEL[r]}
          </option>
        ))}
      </select>
    </div>
  )
}

function SubNav({ value, onChange }: { value: SubTab; onChange: (v: SubTab) => void }) {
  return (
    <div
      className="flex"
      style={{ gap: SPACE_8, padding: SPACE_8, background: PANEL_RAISED, borderRadius: RADIUS_STATIC, border: `${BORDER_WIDTH}px solid ${HAIRLINE}` }}
    >
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
