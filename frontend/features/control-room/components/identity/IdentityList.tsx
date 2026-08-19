'use client'

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactElement } from 'react'
import {
  ANOMALY,
  BORDER_WIDTH,
  FILTER_SEARCH_WIDTH,
  HAIRLINE,
  NOMINAL,
  PANEL_PADDING,
  PANEL_RAISED,
  RADIUS_INTERACTIVE,
  ROW_HEIGHT_DEFAULT,
  SPACE_8,
  SPACE_12,
  SPACE_16,
  STATUS_DOT_SIZE,
  TEXT_DIM,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  TYPE_BODY,
  TYPE_CAPTION,
  WATCH,
} from '@/features/ase/tokens'
import { Metric } from '@/features/ase/client'
import type { Dataset } from '@/features/ase/services/dataset'
import { statusFromAnomalyState, type PersonStatus } from '@/features/ase/services/identityCard'
import { formatElapsed } from '@/features/ase/services/activity'
import { maskedSerial } from '@/features/ase/services/serial'
import type { IdentityRecord } from '@/features/ase/services/identityRecord'
import type { TracedValue } from '@/features/ase/services/traced'
import { compareValues, computeVisibleRange, focusRingStyle, useFocusRing } from '@/features/control-room'

type SortColumn = 'status' | 'serial' | 'name' | 'operator' | 'line' | 'station' | 'confidence' | 'updated'
type SortDirection = 'asc' | 'desc'
type StateFilter = 'all' | 'anomaly' | 'watch' | 'awaiting-review'

interface ListRow {
  id: string
  status: PersonStatus
  serialTv: TracedValue<string>
  serialFull: string
  nameTv: TracedValue<string>
  name: string
  operatorTv: TracedValue<string>
  operator: string
  lineTv: TracedValue<string>
  line: string
  stationTv: TracedValue<string>
  station: string
  confidenceTv: TracedValue<number>
  confidencePct: number
  updatedTv: IdentityRecord['responder']['lastKnownPosition']
  updatedAt: string
  awaitingReview: boolean
}

const ROW_HEIGHT = ROW_HEIGHT_DEFAULT
const OVERSCAN = 8
const STATUS_RANK: Record<PersonStatus, number> = { anomaly: 0, watch: 1, nominal: 2 }
const STATE_OPTIONS: { value: StateFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'anomaly', label: 'Anomaly' },
  { value: 'watch', label: 'Watch' },
  { value: 'awaiting-review', label: 'Awaiting review' },
]

export function IdentityList({
  dataset,
  onSelectPerson,
}: {
  dataset: Dataset
  onSelectPerson: (machineId: string) => void
}): ReactElement {
  const [search, setSearch] = useState('')
  const [stateFilter, setStateFilter] = useState<StateFilter>('all')
  const [operatorFilter, setOperatorFilter] = useState('')
  const [lineFilter, setLineFilter] = useState('')
  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const { focused: searchFocused, handlers: searchHandlers } = useFocusRing()

  const rows = useMemo<ListRow[]>(() => {
    const out: ListRow[] = []
    for (const [id, record] of dataset.identityRecords) {
      const card = dataset.identityCards.get(id)
      if (!card) continue
      const status = statusFromAnomalyState(record.derived.anomalyState.value)
      const scoring = dataset.personScoring.get(id)
      out.push({
        id,
        status,
        serialTv: record.serial,
        serialFull: record.serial.value,
        nameTv: record.who.fullLegalName,
        name: record.who.fullLegalName.value,
        operatorTv: record.contacts.operatorName,
        operator: record.contacts.operatorName.value,
        lineTv: card.lineName,
        line: card.lineName.value,
        stationTv: card.footer.station,
        station: card.footer.station.value,
        confidenceTv: card.confidencePct,
        confidencePct: record.derived.identityConfidencePct,
        updatedTv: record.responder.lastKnownPosition,
        updatedAt: record.responder.lastKnownPosition.recordedAt,
        awaitingReview: scoring?.band === 'human',
      })
    }
    return out
  }, [dataset])

  const operators = useMemo(() => Array.from(new Set(rows.map((r) => r.operator))).sort(), [rows])
  const lines = useMemo(() => Array.from(new Set(rows.map((r) => r.line))).sort(), [rows])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (q && !r.name.toLowerCase().includes(q) && !r.serialFull.toLowerCase().includes(q)) return false
      if (stateFilter === 'anomaly' && r.status !== 'anomaly') return false
      if (stateFilter === 'watch' && r.status !== 'watch') return false
      if (stateFilter === 'awaiting-review' && !r.awaitingReview) return false
      if (operatorFilter && r.operator !== operatorFilter) return false
      if (lineFilter && r.line !== lineFilter) return false
      return true
    })
  }, [rows, search, stateFilter, operatorFilter, lineFilter])

  const sorted = useMemo(() => {
    const copy = [...filtered]
    if (sortColumn === null) {
      copy.sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || a.confidencePct - b.confidencePct)
      return copy
    }
    const dir = sortDirection === 'asc' ? 1 : -1
    copy.sort((a, b) => {
      switch (sortColumn) {
        case 'status':
          return (STATUS_RANK[a.status] - STATUS_RANK[b.status]) * dir
        case 'serial':
          return compareValues(a.serialFull, b.serialFull) * dir
        case 'name':
          return compareValues(a.name, b.name) * dir
        case 'operator':
          return compareValues(a.operator, b.operator) * dir
        case 'line':
          return compareValues(a.line, b.line) * dir
        case 'station':
          return compareValues(a.station, b.station) * dir
        case 'confidence':
          return (a.confidencePct - b.confidencePct) * dir
        case 'updated':
          return compareValues(a.updatedAt, b.updatedAt) * dir
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
    return <p style={{ ...TYPE_BODY, color: TEXT_DIM }}>No identity records.</p>
  }

  return (
    <div>
      <div className="flex flex-wrap items-center" style={{ gap: SPACE_8 }}>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name or serial…"
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
        {STATE_OPTIONS.map((opt) => (
          <StateChip
            key={opt.value}
            label={opt.label}
            active={stateFilter === opt.value}
            onClick={() => setStateFilter(opt.value === stateFilter ? 'all' : opt.value)}
          />
        ))}
        {operatorFilter ? <RemovableChip label={`Operator: ${operatorFilter}`} onRemove={() => setOperatorFilter('')} /> : null}
        {lineFilter ? <RemovableChip label={`Line: ${lineFilter}`} onRemove={() => setLineFilter('')} /> : null}
        <FilterSelect label="By operator" value={operatorFilter} options={operators} onChange={setOperatorFilter} />
        <FilterSelect label="By line" value={lineFilter} options={lines} onChange={setLineFilter} />
      </div>

      <div style={{ marginTop: SPACE_16 }}>
        <HeaderRow sortColumn={sortColumn} sortDirection={sortDirection} onSort={toggleSort} />
        {sorted.length === 0 ? (
          <p style={{ ...TYPE_BODY, color: TEXT_DIM, padding: PANEL_PADDING }}>No people match these filters.</p>
        ) : (
          <TableBody rows={sorted} onSelectPerson={onSelectPerson} />
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

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: string[]
  onChange: (v: string) => void
}): ReactElement {
  const { focused, handlers } = useFocusRing()
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      {...handlers}
      style={{
        ...TYPE_CAPTION,
        textTransform: 'none',
        letterSpacing: 'normal',
        color: value ? TEXT_PRIMARY : TEXT_SECONDARY,
        background: PANEL_RAISED,
        border: `${BORDER_WIDTH}px solid ${HAIRLINE}`,
        borderRadius: RADIUS_INTERACTIVE,
        padding: `${SPACE_8}px ${SPACE_12}px`,
        ...focusRingStyle(focused),
      }}
    >
      <option value="">{label}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  )
}

const COLUMNS: { id: SortColumn; label: string; flex: number }[] = [
  { id: 'status', label: '', flex: 0.4 },
  { id: 'serial', label: 'Serial', flex: 1 },
  { id: 'name', label: 'Name', flex: 2 },
  { id: 'operator', label: 'Operator', flex: 1.6 },
  { id: 'line', label: 'Line', flex: 1.6 },
  { id: 'station', label: 'Station', flex: 1.2 },
  { id: 'confidence', label: 'Confidence', flex: 1 },
  { id: 'updated', label: 'Updated', flex: 1 },
]

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
      {COLUMNS.map((col) => (
        <HeaderCell
          key={col.id}
          column={col.id}
          label={col.label}
          flex={col.flex}
          active={sortColumn === col.id}
          direction={sortDirection}
          onSort={onSort}
        />
      ))}
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
      aria-label={label || 'Sort by status'}
      {...handlers}
      className="pressable"
      style={{ ...TYPE_CAPTION, flex, textAlign: 'left', color: active ? TEXT_PRIMARY : TEXT_DIM, ...focusRingStyle(focused) }}
    >
      {label.toUpperCase()}
      {active ? (direction === 'asc' ? ' ↑' : ' ↓') : ''}
    </button>
  )
}

const STATUS_COLOR: Record<PersonStatus, string> = { nominal: NOMINAL, watch: WATCH, anomaly: ANOMALY }

function TableBody({ rows, onSelectPerson }: { rows: ListRow[]; onSelectPerson: (id: string) => void }): ReactElement {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(0)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return undefined
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      setViewportHeight(entry.contentRect.height)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const { start, end } = computeVisibleRange(scrollTop, viewportHeight, ROW_HEIGHT, rows.length, OVERSCAN)
  const visible = rows.slice(start, end)

  return (
    <div
      ref={containerRef}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      className="overflow-y-auto"
      style={{ height: ROW_HEIGHT * 14 }}
    >
      <div style={{ height: rows.length * ROW_HEIGHT, position: 'relative' }}>
        {visible.map((row, i) => (
          <Row key={row.id} row={row} top={(start + i) * ROW_HEIGHT} onSelect={() => onSelectPerson(row.id)} />
        ))}
      </div>
    </div>
  )
}

function Row({ row, top, onSelect }: { row: ListRow; top: number; onSelect: () => void }): ReactElement {
  const [hovered, setHovered] = useState(false)
  const { focused, handlers } = useFocusRing()

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
      <span style={{ flex: 0.4 }}>
        <span
          aria-hidden
          title={row.status}
          style={{
            width: STATUS_DOT_SIZE,
            height: STATUS_DOT_SIZE,
            borderRadius: '50%',
            background: STATUS_COLOR[row.status],
            display: 'inline-block',
          }}
        />
      </span>
      <span className="font-mono" title={row.serialFull} style={{ flex: 1, color: TEXT_DIM }}>
        <Metric traced={row.serialTv} label={`${row.name}'s serial`} format={(v) => maskedSerial(v)} />
      </span>
      <span style={{ flex: 2 }}>
        <Metric traced={row.nameTv} label="Name" />
      </span>
      <span style={{ flex: 1.6, color: TEXT_SECONDARY }}>
        <Metric traced={row.operatorTv} label={`${row.name}'s operator`} />
      </span>
      <span style={{ flex: 1.6, color: TEXT_SECONDARY }}>
        <Metric traced={row.lineTv} label={`${row.name}'s line`} />
      </span>
      <span style={{ flex: 1.2, color: TEXT_SECONDARY }}>
        <Metric traced={row.stationTv} label={`${row.name}'s station`} />
      </span>
      <span className="font-mono" style={{ flex: 1 }}>
        <Metric traced={row.confidenceTv} label={`${row.name}'s identity confidence`} format={(v) => `${v}%`} />
      </span>
      <span style={{ flex: 1, color: TEXT_DIM }}>
        <Metric traced={row.updatedTv} label={`${row.name}'s last update`} format={() => formatElapsed(row.updatedTv.recordedAt)} />
      </span>
      <span style={{ ...TYPE_CAPTION, color: TEXT_PRIMARY, opacity: hovered ? 1 : 0, width: 48, textAlign: 'right' }}>OPEN</span>
    </div>
  )
}
