'use client'

// S8.8: SEARCH ("a field top-left. Matches name, serial, operator, route,
// origin.") + FILTER CHIPS ("All · Anomalies · Watch · By tier · By
// country. Filtering changes what is drawn, never the dataset."). Both
// write straight to graphStore — every view reads `searchQuery`/`filter`
// off the same snapshot, so search/filter state can't drift between them
// any more than selection can.

import { type CSSProperties, type ReactElement } from 'react'
import { BORDER_WIDTH, CANVAS, HAIRLINE, PANEL, PANEL_RAISED, RADIUS_INTERACTIVE, SPACE_8, SPACE_12, TEXT_DIM, TEXT_PRIMARY, TEXT_SECONDARY, TYPE_CAPTION } from '@/features/ase/tokens'
import { focusRingStyle, useFocusRing } from './focusRing'
import { graphStore } from '../stores/graphStore'
import type { FilterKind, GraphFilter } from '../services/filters'
import type { DomainDataset, EntityTier } from '../types/domain'

const TIER_OPTIONS: EntityTier[] = ['country', 'region', 'route', 'operator', 'climber', 'sensor']

const selectStyle: CSSProperties = {
  ...TYPE_CAPTION,
  textTransform: 'none',
  letterSpacing: 'normal',
  fontSize: 10,
  color: TEXT_SECONDARY,
  background: PANEL,
  border: `${BORDER_WIDTH}px solid ${HAIRLINE}`,
  borderRadius: RADIUS_INTERACTIVE,
  padding: '4px 6px',
}

export function GraphSearchBar({
  dataset,
  filter,
  searchQuery,
  matchCount,
  onEnter,
}: {
  dataset: DomainDataset
  filter: GraphFilter
  searchQuery: string
  matchCount: number | null
  onEnter: () => void
}): ReactElement {
  const { focused, handlers } = useFocusRing()
  const countries = dataset.domainEntities.filter((e) => e.tier === 'country')

  function setKind(kind: FilterKind) {
    graphStore.setFilter({
      kind,
      tier: kind === 'tier' ? (filter.tier ?? 'climber') : null,
      countryId: kind === 'country' ? (filter.countryId ?? countries[0]?.id ?? null) : null,
    })
  }

  return (
    <div className="flex flex-wrap items-center" style={{ gap: SPACE_8 }}>
      <input
        type="text"
        value={searchQuery}
        onChange={(e) => graphStore.setSearchQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onEnter()
        }}
        placeholder="Search name, serial, operator, route, origin…"
        {...handlers}
        style={{
          ...TYPE_CAPTION,
          textTransform: 'none',
          letterSpacing: 'normal',
          fontSize: 11,
          color: TEXT_PRIMARY,
          background: PANEL_RAISED,
          border: `${BORDER_WIDTH}px solid ${HAIRLINE}`,
          borderRadius: RADIUS_INTERACTIVE,
          padding: `${SPACE_8}px ${SPACE_12}px`,
          width: 260,
          ...focusRingStyle(focused),
        }}
      />

      <Chip label="All" active={filter.kind === 'all'} onClick={() => setKind('all')} />
      <Chip label="Anomalies" active={filter.kind === 'anomalies'} onClick={() => setKind('anomalies')} />
      <Chip label="Watch" active={filter.kind === 'watch'} onClick={() => setKind('watch')} />
      <Chip label="By tier" active={filter.kind === 'tier'} onClick={() => setKind('tier')} />
      {filter.kind === 'tier' && (
        <select value={filter.tier ?? 'climber'} onChange={(e) => graphStore.setFilter({ ...filter, tier: e.target.value as EntityTier })} style={selectStyle}>
          {TIER_OPTIONS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      )}
      <Chip label="By country" active={filter.kind === 'country'} onClick={() => setKind('country')} />
      {filter.kind === 'country' && (
        <select value={filter.countryId ?? ''} onChange={(e) => graphStore.setFilter({ ...filter, countryId: e.target.value })} style={selectStyle}>
          {countries.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      )}
      {searchQuery && matchCount !== null && (
        <span className="font-mono" style={{ fontSize: 10, color: TEXT_DIM }}>
          {matchCount} match{matchCount === 1 ? '' : 'es'}
        </span>
      )}
    </div>
  )
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }): ReactElement {
  const { focused, handlers } = useFocusRing()
  return (
    <button
      type="button"
      onClick={onClick}
      {...handlers}
      className="pressable font-mono"
      style={{
        fontSize: 10,
        letterSpacing: '0.05em',
        padding: '5px 10px',
        background: active ? TEXT_PRIMARY : 'transparent',
        color: active ? CANVAS : TEXT_SECONDARY,
        border: `${BORDER_WIDTH}px solid ${HAIRLINE}`,
        borderRadius: RADIUS_INTERACTIVE,
        ...focusRingStyle(focused),
      }}
    >
      {label}
    </button>
  )
}
