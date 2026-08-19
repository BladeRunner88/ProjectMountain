'use client'

import { useEffect, useRef, useState, type ReactElement } from 'react'
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
import { useDataset, useSelection } from '@/features/ase/client'
import {
  DEFAULT_THRESHOLDS,
  DEFAULT_WEIGHTS,
  type DecisionThresholds,
  type ScoringWeights,
} from '@/features/ase/services/entityResolution'
import { focusRingStyle, useFocusRing } from '@/features/control-room'
import { IDENTITY_SUB_TABS, useIdentitySubnav, type IdentitySubTab } from '../../hooks/useIdentitySubnav'
import { IdentityList } from './IdentityList'
import { IdentitySourceRecords } from './IdentitySourceRecords'
import { IdentityMethod } from './IdentityMethod'
import { IdentityScoringTab } from './IdentityScoringTab'
import { IdentityDecisionTab } from './IdentityDecisionTab'

export function Identity(): ReactElement {
  const { sub, machineId, setSub, setPerson } = useIdentitySubnav()
  const [weights, setWeights] = useState<ScoringWeights>(DEFAULT_WEIGHTS)
  const [thresholds, setThresholds] = useState<DecisionThresholds>(DEFAULT_THRESHOLDS)
  const skipSelectionSyncRef = useRef<string | null>(null)
  const { dataset } = useDataset()
  const { select, selection } = useSelection()

  const selectedMachineId = machineId && dataset.identityRecords.has(machineId) ? machineId : null
  const machineMissing = Boolean(machineId && !selectedMachineId)

  function selectPerson(id: string, moveToSourceRecords: boolean): void {
    skipSelectionSyncRef.current = id
    select({ kind: 'identity', machineId: id })
    setPerson(id, moveToSourceRecords)
  }

  useEffect(() => {
    if (selectedMachineId === null) return
    skipSelectionSyncRef.current = selectedMachineId
    select({ kind: 'identity', machineId: selectedMachineId })
  }, [selectedMachineId, select])

  useEffect(() => {
    if (selection?.kind !== 'identity') return
    if (!dataset.identityRecords.has(selection.machineId)) return
    if (skipSelectionSyncRef.current === selection.machineId) {
      skipSelectionSyncRef.current = null
      return
    }
    if (selection.machineId === selectedMachineId) return
    setPerson(selection.machineId, true)
  }, [dataset.identityRecords, selectedMachineId, selection, setPerson])

  return (
    <div style={{ padding: PAGE_GUTTER }}>
      <SubNav value={sub} onChange={setSub} />
      <div style={{ marginTop: SPACE_32 }} data-identity-panel={sub}>
        {sub === 'list' ? <IdentityList dataset={dataset} onSelectPerson={(id) => selectPerson(id, true)} /> : null}
        {sub === 'source-records' ? (
          selectedMachineId ? (
            <IdentitySourceRecords
              dataset={dataset}
              machineId={selectedMachineId}
              onSelectPerson={(id) => selectPerson(id, false)}
            />
          ) : (
            <PersonRequired missing={machineMissing} />
          )
        ) : null}
        {sub === 'method' ? (
          <IdentityMethod
            data={dataset.entityResolution}
            weights={weights}
            onChangeWeights={setWeights}
            thresholds={thresholds}
            onChangeThresholds={setThresholds}
          />
        ) : null}
        {sub === 'scoring' ? (
          selectedMachineId ? (
            <IdentityScoringTab dataset={dataset} machineId={selectedMachineId} weights={weights} thresholds={thresholds} />
          ) : (
            <PersonRequired missing={machineMissing} />
          )
        ) : null}
        {sub === 'decision' ? (
          selectedMachineId ? (
            <IdentityDecisionTab
              dataset={dataset}
              machineId={selectedMachineId}
              weights={weights}
              thresholds={thresholds}
              onSelectPerson={(id) => selectPerson(id, false)}
            />
          ) : (
            <PersonRequired missing={machineMissing} />
          )
        ) : null}
      </div>
    </div>
  )
}

function PersonRequired({ missing }: { missing: boolean }): ReactElement {
  return (
    <p style={{ ...TYPE_BODY, color: TEXT_DIM }}>
      {missing ? 'No identity record for this machine.' : 'Select someone in List first.'}
    </p>
  )
}

function SubNav({ value, onChange }: { value: IdentitySubTab; onChange: (v: IdentitySubTab) => void }): ReactElement {
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
        {IDENTITY_SUB_TABS.map((t) => (
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
