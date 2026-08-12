import { useState } from 'react'
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
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  TYPE_CAPTION,
} from '../../ase/tokens'
import { useDataset } from '../../ase/store'
import { ROLE_LABEL, type Role } from './exposurePermissions'
import { ExposureHealth } from './ExposureHealth'
import { ExposureMatrix } from './ExposureMatrix'
import { ExposureFragility } from './ExposureFragility'
import { ExposureStaleness } from './ExposureStaleness'
import { ExposureSimulation } from './ExposureSimulation'
import { ExposureActivity } from './ExposureActivity'
import { focusRingStyle, useFocusRing } from './focusRing'

type SubTab = 'health' | 'matrix' | 'fragility' | 'staleness' | 'simulation' | 'activity'
const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: 'health', label: 'Health' },
  { id: 'matrix', label: 'Matrix' },
  { id: 'fragility', label: 'Fragility' },
  { id: 'staleness', label: 'Staleness' },
  { id: 'simulation', label: 'Simulation' },
  { id: 'activity', label: 'Activity' },
]
const ROLES: Role[] = ['coordinator', 'medic', 'guide', 'observer']

// S9.12 (complete rebuild): six named source feeds, five panels — Health,
// Matrix, Fragility, Staleness, Simulation — plus Activity, a FILTERED view
// of Revision's own real audit chain (never a second one, see
// ExposureActivity.tsx). Role governs every action button per-panel
// (S9.12's own permission model differs from Revision's uniform one — see
// exposurePermissions.ts) via the same single role selector convention
// Revision established.
export function Exposure() {
  const { dataset } = useDataset()
  const [subTab, setSubTab] = useState<SubTab>('health')
  const [role, setRole] = useState<Role>('coordinator')

  return (
    <div style={{ padding: PAGE_GUTTER }}>
      <div className="flex items-center justify-between">
        <RoleSelector role={role} onChange={setRole} />
        <SubNav value={subTab} onChange={setSubTab} />
      </div>
      <div style={{ marginTop: SPACE_32 }} data-exposure-panel={subTab}>
        {subTab === 'health' && <ExposureHealth state={dataset.exposure} role={role} />}
        {subTab === 'matrix' && <ExposureMatrix state={dataset.exposure} role={role} />}
        {subTab === 'fragility' && <ExposureFragility state={dataset.exposure} role={role} />}
        {subTab === 'staleness' && <ExposureStaleness state={dataset.exposure} role={role} />}
        {subTab === 'simulation' && <ExposureSimulation state={dataset.exposure} role={role} />}
        {subTab === 'activity' && <ExposureActivity />}
      </div>
    </div>
  )
}

function RoleSelector({ role, onChange }: { role: Role; onChange: (r: Role) => void }) {
  return (
    <div className="flex items-center" style={{ gap: SPACE_8 }}>
      <span style={{ ...TYPE_CAPTION, color: TEXT_SECONDARY }}>ROLE</span>
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
