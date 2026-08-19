'use client'

import { useMemo, useState, type KeyboardEvent, type ReactElement } from 'react'
import {
  BORDER_WIDTH,
  FILTER_SEARCH_WIDTH,
  HAIRLINE,
  PANEL_PADDING,
  PANEL_RAISED,
  RADIUS_INTERACTIVE,
  ROW_HEIGHT_DEFAULT,
  SPACE_8,
  SPACE_12,
  SPACE_16,
  TEXT_DIM,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  TYPE_BODY,
  TYPE_CAPTION,
} from '@/features/ase/tokens'
import { confidence } from '@/features/ase/services/folds'
import { readingCoverage, type ContextEngineState, type Reading } from '@/features/ase/services/contextEngine'
import { maskedSerial } from '@/features/ase/services/serial'
import { formatElapsed } from '@/features/ase/services/activity'
import type { TracedValue } from '@/features/ase/services/traced'
import {
  compareValues,
  computeVisibleRange,
  focusRingStyle,
  PersonBadge,
  useFocusRing,
} from '@/features/control-room'

type SortColumn = 'arrived' | 'source' | 'about' | 'understood' | 'confidence'
type SortDirection = 'asc' | 'desc'
type SourceFilter = 'all' | string

interface ListRow {
  reading: Reading
  aboutLabel: string
  confidencePct: number
  boundCount: number
  totalCount: number
  partlyUnderstood: boolean
}

const ROW_HEIGHT = ROW_HEIGHT_DEFAULT
const OVERSCAN = 8

export function MeaningList({
  engine,
  onSelectReading,
}: {
  engine: ContextEngineState
  onSelectReading: (readingId: string) => void
}): ReactElement {
  const [search, setSearch] = useState('')
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all')
  const [partlyOnly, setPartlyOnly] = useState(false)
  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const { focused: searchFocused, handlers: searchHandlers } = useFocusRing()

  const rows = useMemo<ListRow[]>(() => {
    return engine.readings.map((reading) => {
      const cov = readingCoverage(reading)
      const headlineBound = reading.bound.find((b) => b.fieldKey === reading.headlineFieldKey)
      const aboutLabel =
        reading.about.kind === 'machine' ? `${reading.about.label} · ${maskedSerial(reading.about.serial)}` : reading.about.label
      return {
        reading,
        aboutLabel,
        confidencePct: headlineBound ? Math.round(confidence(headlineBound.traced as TracedValue<unknown>) * 100) : 0,
        boundCount: cov.boundFields,
        totalCount: cov.totalFields,
        partlyUnderstood: cov.boundFields < cov.totalFields,
      }
    })
  }, [engine])

  const sources = useMemo(() => Array.from(new Set(rows.map((r) => r.reading.source))), [rows])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (q && !r.aboutLabel.toLowerCase().includes(q) && !r.reading.headline.toLowerCase().includes(q)) return false
      if (sourceFilter !== 'all' && r.reading.source !== sourceFilter) return false
      if (partlyOnly && !r.partlyUnderstood) return false
      return true
    })
  }, [rows, search, sourceFilter, partlyOnly])

  const sorted = useMemo(() => {
    const copy = [...filtered]
    if (sortColumn === null) {
      copy.sort((a, b) => compareValues(b.reading.arrivedAt, a.reading.arrivedAt))
      return copy
    }
    const dir = sortDirection === 'asc' ? 1 : -1
    copy.sort((a, b) => {
      switch (sortColumn) {
        case 'arrived':
          return compareValues(a.reading.arrivedAt, b.reading.arrivedAt) * dir
        case 'source':
          return compareValues(a.reading.source, b.reading.source) * dir
        case 'about':
          return compareValues(a.aboutLabel, b.aboutLabel) * dir
        case 'understood': {
          const aRatio = a.totalCount === 0 ? 0 : a.boundCount / a.totalCount
          const bRatio = b.totalCount === 0 ? 0 : b.boundCount / b.totalCount
          return (aRatio - bRatio) * dir
        }
        case 'confidence':
          return (a.confidencePct - b.confidencePct) * dir
      }
    })
    return copy
  }, [filtered, sortColumn, sortDirection])

  function toggleSort(column: SortColumn): void {
    if (column === sortColumn) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortColumn(column)
      setSortDirection('asc')
    }
  }

  if (rows.length === 0) {
    return <p style={{ ...TYPE_BODY, color: TEXT_DIM }}>No readings.</p>
  }

  return (
    <div>
      <div className="flex flex-wrap items-center" style={{ gap: SPACE_8 }}>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search who or what it says…"
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
        {search ? <RemovableChip label={`"${search}"`} onRemove={() => setSearch('')} /> : null}
        <FilterChip label="All" active={sourceFilter === 'all'} onClick={() => setSourceFilter('all')} />
        {sources.map((s) => (
          <FilterChip key={s} label={s} active={sourceFilter === s} onClick={() => setSourceFilter(sourceFilter === s ? 'all' : s)} />
        ))}
        <FilterChip label="Partly understood" active={partlyOnly} onClick={() => setPartlyOnly((v) => !v)} />
      </div>

      <div style={{ marginTop: SPACE_16 }}>
        <HeaderRow sortColumn={sortColumn} sortDirection={sortDirection} onSort={toggleSort} />
        {sorted.length === 0 ? (
          <p style={{ ...TYPE_BODY, color: TEXT_DIM, padding: PANEL_PADDING }}>No readings match these filters.</p>
        ) : (
          <TableBody rows={sorted} onSelect={onSelectReading} />
        )}
      </div>
    </div>
  )
}

function RemovableChip({ label, onRemove }: { label: string; onRemove: () => void }): ReactElement {
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

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }): ReactElement {
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

const SAYS_FLEX = 2.4

function HeaderRow({
  sortColumn,
  sortDirection,
  onSort,
}: {
  sortColumn: SortColumn | null
  sortDirection: SortDirection
  onSort: (c: SortColumn) => void
}): ReactElement {
  return (
    <div
      className="flex shrink-0 items-center"
      style={{ borderBottom: `${BORDER_WIDTH}px solid ${HAIRLINE}`, padding: `${SPACE_8}px ${PANEL_PADDING}px` }}
    >
      <HeaderCell column="arrived" label="Arrived" flex={1} active={sortColumn === 'arrived'} direction={sortDirection} onSort={onSort} />
      <HeaderCell column="source" label="Source" flex={1.3} active={sortColumn === 'source'} direction={sortDirection} onSort={onSort} />
      <HeaderCell column="about" label="About" flex={2.2} active={sortColumn === 'about'} direction={sortDirection} onSort={onSort} />
      <span style={{ ...TYPE_CAPTION, flex: SAYS_FLEX, color: TEXT_DIM }}>WHAT IT SAYS</span>
      <HeaderCell
        column="understood"
        label="Understood"
        flex={0.9}
        active={sortColumn === 'understood'}
        direction={sortDirection}
        onSort={onSort}
      />
      <HeaderCell
        column="confidence"
        label="Confidence"
        flex={0.9}
        active={sortColumn === 'confidence'}
        direction={sortDirection}
        onSort={onSort}
      />
    </div>
  )
}

function HeaderCell({
  column,
  label,
  flex,
  active,
  direction,
  onSort,
}: {
  column: SortColumn
  label: string
  flex: number
  active: boolean
  direction: SortDirection
  onSort: (c: SortColumn) => void
}): ReactElement {
  const { focused, handlers } = useFocusRing()
  return (
    <button
      type="button"
      onClick={() => onSort(column)}
      {...handlers}
      className="pressable"
      style={{ ...TYPE_CAPTION, flex, textAlign: 'left', color: active ? TEXT_PRIMARY : TEXT_DIM, ...focusRingStyle(focused) }}
    >
      {label.toUpperCase()}
      {active ? (direction === 'asc' ? ' ↑' : ' ↓') : ''}
    </button>
  )
}

function TableBody({ rows, onSelect }: { rows: ListRow[]; onSelect: (readingId: string) => void }): ReactElement {
  const { start, end } = computeVisibleRange(0, ROW_HEIGHT * rows.length, ROW_HEIGHT, rows.length, OVERSCAN)
  const visible = rows.slice(start, end)
  return (
    <div style={{ height: rows.length * ROW_HEIGHT, position: 'relative' }}>
      {visible.map((row, i) => (
        <Row key={row.reading.id} row={row} top={(start + i) * ROW_HEIGHT} onSelect={() => onSelect(row.reading.id)} />
      ))}
    </div>
  )
}

function Row({ row, top, onSelect }: { row: ListRow; top: number; onSelect: () => void }): ReactElement {
  const [hovered, setHovered] = useState(false)
  const { focused, handlers } = useFocusRing()
  const { reading } = row

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>): void {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect()
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={onKeyDown}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      {...handlers}
      className="pressable-row flex cursor-pointer items-center"
      style={{
        position: 'absolute',
        top,
        left: 0,
        right: 0,
        height: ROW_HEIGHT,
        padding: `0 ${PANEL_PADDING}px`,
        borderBottom: `${BORDER_WIDTH}px solid ${HAIRLINE}`,
        background: hovered ? PANEL_RAISED : 'transparent',
        ...focusRingStyle(focused),
      }}
    >
      <span className="font-mono" style={{ flex: 1, color: TEXT_DIM }}>
        {formatElapsed(reading.arrivedAt)}
      </span>
      <span style={{ flex: 1.3, color: TEXT_SECONDARY }}>{reading.source}</span>
      <span style={{ flex: 2.2 }}>
        {reading.about.kind === 'machine' ? (
          <PersonBadge machineId={reading.about.machineId} name={reading.about.label} serial={reading.about.serial} />
        ) : (
          <span style={{ color: TEXT_SECONDARY }}>{row.aboutLabel}</span>
        )}
      </span>
      <span style={{ flex: SAYS_FLEX, color: TEXT_SECONDARY }} className="truncate">
        {reading.headline}
      </span>
      <span className="font-mono" style={{ flex: 0.9, color: row.partlyUnderstood ? TEXT_SECONDARY : TEXT_DIM }}>
        {row.boundCount}/{row.totalCount}
      </span>
      <span className="font-mono" style={{ flex: 0.9, color: TEXT_PRIMARY }}>
        {row.confidencePct}%
      </span>
    </div>
  )
}
