'use client'

import type { ReactElement } from 'react'
import {
  BORDER_WIDTH,
  FILTER_SEARCH_WIDTH,
  HAIRLINE,
  PANEL_RAISED,
  RADIUS_INTERACTIVE,
  SPACE_8,
  SPACE_12,
  TEXT_DIM,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  TYPE_CAPTION,
} from '@/features/ase/tokens'
import type { EvidenceFilter, EvidenceFilterState } from '@/features/ase/services/meaning'
import { useFocusRing } from '../hooks/useFocusRing'
import { focusRingStyle } from '../services/focusRing'

const STATE_OPTIONS: { value: EvidenceFilterState; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'anomaly', label: 'Anomaly' },
  { value: 'watch', label: 'Watch' },
  { value: 'nominal', label: 'Nominal' },
  { value: 'below-floor', label: 'Below confidence floor' },
  { value: 'awaiting-human', label: 'Awaiting human' },
]

export interface FilterBarProps {
  value: EvidenceFilter
  onChange: (next: EvidenceFilter) => void
}

export function FilterBar({ value, onChange }: FilterBarProps): ReactElement {
  const { focused: searchFocused, handlers: searchHandlers } = useFocusRing()

  return (
    <div className="flex flex-wrap items-center" style={{ gap: SPACE_8 }}>
      <input
        type="text"
        value={value.search}
        onChange={(e) => onChange({ ...value, search: e.target.value })}
        placeholder="Search…"
        {...searchHandlers}
        style={{
          ...TYPE_CAPTION,
          textTransform: 'none',
          letterSpacing: 'normal',
          color: TEXT_PRIMARY,
          background: PANEL_RAISED,
          border: `${BORDER_WIDTH}px solid ${HAIRLINE}`,
          borderRadius: RADIUS_INTERACTIVE,
          padding: `${SPACE_8}px ${SPACE_12}px`,
          width: FILTER_SEARCH_WIDTH,
          ...focusRingStyle(searchFocused),
        }}
      />

      {value.search ? <Chip label={`"${value.search}"`} onRemove={() => onChange({ ...value, search: '' })} /> : null}

      {STATE_OPTIONS.map((opt) => (
        <StateChip
          key={opt.value}
          label={opt.label}
          active={value.state === opt.value}
          onClick={() => onChange({ ...value, state: opt.value === value.state ? 'all' : opt.value })}
        />
      ))}
    </div>
  )
}

function StateChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }): ReactElement {
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

function Chip({ label, onRemove }: { label: string; onRemove: () => void }): ReactElement {
  const { focused, handlers } = useFocusRing()
  return (
    <button
      type="button"
      onClick={onRemove}
      {...handlers}
      className="pressable"
      style={{
        ...TYPE_CAPTION,
        textTransform: 'none',
        letterSpacing: 'normal',
        color: TEXT_DIM,
        border: `${BORDER_WIDTH}px solid ${HAIRLINE}`,
        borderRadius: RADIUS_INTERACTIVE,
        padding: `${SPACE_8}px ${SPACE_12}px`,
        ...focusRingStyle(focused),
      }}
    >
      {label} ×
    </button>
  )
}
