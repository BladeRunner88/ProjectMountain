'use client'

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactElement } from 'react'
import Link from 'next/link'
import {
  ACCENT_INDICATOR_WIDTH,
  BORDER_WIDTH,
  CONFIDENCE_FLOOR_DEFAULT,
  HAIRLINE,
  PANEL_PADDING,
  RADIUS_STATIC,
  ROW_HEIGHT_COMPACT,
  ROW_HEIGHT_DEFAULT,
  SPACE_8,
  SPACE_16,
  TEXT_DIM,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  TYPE_BODY,
  TYPE_CAPTION,
  VERIFIED,
  WATCH,
} from '@/features/ase/tokens'
import { confidence, dependents } from '@/features/ase/services/folds'
import { Metric, useSelection } from '@/features/ase/client'
import type { TracedValue } from '@/features/ase/services/traced'
import { compareValues, computeVisibleRange, hasRenderableWhy } from '../services/evidenceTableLogic'
import { useDensity } from '../hooks/useDensity'
import type { Density } from '../types/density'
import { useFocusRing } from '../hooks/useFocusRing'
import { focusRingStyle } from '../services/focusRing'

export interface EvidenceRow {
  id: string
  traced: TracedValue<unknown>
  label: string
  whatThisIs?: string
  claimSortValue: string | number
  why: string | null
  format?: (value: unknown) => string
  graphHref?: string
}

type SortColumn = 'claim' | 'confidence' | 'why' | 'depends'
type SortDirection = 'asc' | 'desc'

interface EnrichedRow {
  row: EvidenceRow
  conf: number
  dependents: number
}

const VIRTUALIZE_THRESHOLD = 100
const OVERSCAN = 6

export function EvidenceTable({ rows }: { rows: EvidenceRow[] }): ReactElement {
  const [density] = useDensity()
  const [sortColumn, setSortColumn] = useState<SortColumn>('confidence')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const { selection, select } = useSelection()

  const renderable = useMemo(() => rows.filter((r) => hasRenderableWhy(r.why)), [rows])

  const enriched = useMemo<EnrichedRow[]>(
    () =>
      renderable.map((row) => ({
        row,
        conf: confidence(row.traced),
        dependents: dependents(row.traced.id).length,
      })),
    [renderable]
  )

  const sorted = useMemo<EnrichedRow[]>(() => {
    const dir = sortDirection === 'asc' ? 1 : -1
    const copy = [...enriched]
    copy.sort((a, b) => {
      switch (sortColumn) {
        case 'claim':
          return compareValues(a.row.claimSortValue, b.row.claimSortValue) * dir
        case 'confidence':
          return (a.conf - b.conf) * dir
        case 'why':
          return compareValues(a.row.why ?? '', b.row.why ?? '') * dir
        case 'depends':
          return (a.dependents - b.dependents) * dir
      }
    })
    return copy
  }, [enriched, sortColumn, sortDirection])

  function toggleSort(column: SortColumn): void {
    if (column === sortColumn) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortColumn(column)
      setSortDirection('asc')
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col" style={{ borderRadius: RADIUS_STATIC }}>
      <HeaderRow sortColumn={sortColumn} sortDirection={sortDirection} onSort={toggleSort} />
      {sorted.length === 0 ? (
        <p style={{ ...TYPE_BODY, color: TEXT_DIM, padding: PANEL_PADDING }}>No evidence to show.</p>
      ) : (
        <TableBody
          entries={sorted}
          density={density}
          selectedId={selection?.kind === 'value' ? selection.traced.id : undefined}
          onSelectRow={(row) => select({ kind: 'value', traced: row.traced, label: row.label, whatThisIs: row.whatThisIs })}
        />
      )}
    </div>
  )
}

const COLUMN_LABEL: Record<SortColumn, string> = {
  claim: 'The claim',
  confidence: 'Confidence',
  why: 'Why',
  depends: 'Depends on',
}

function HeaderRow({
  sortColumn,
  sortDirection,
  onSort,
}: {
  sortColumn: SortColumn
  sortDirection: SortDirection
  onSort: (column: SortColumn) => void
}): ReactElement {
  return (
    <div
      className="flex shrink-0 items-center"
      style={{ borderBottom: `${BORDER_WIDTH}px solid ${HAIRLINE}`, padding: `${SPACE_8}px ${PANEL_PADDING}px` }}
    >
      <HeaderCell column="claim" flex={2} sortColumn={sortColumn} sortDirection={sortDirection} onSort={onSort} />
      <HeaderCell column="confidence" flex={1} sortColumn={sortColumn} sortDirection={sortDirection} onSort={onSort} />
      <HeaderCell column="why" flex={3} sortColumn={sortColumn} sortDirection={sortDirection} onSort={onSort} />
      <HeaderCell column="depends" flex={1} sortColumn={sortColumn} sortDirection={sortDirection} onSort={onSort} />
    </div>
  )
}

function HeaderCell({
  column,
  flex,
  sortColumn,
  sortDirection,
  onSort,
}: {
  column: SortColumn
  flex: number
  sortColumn: SortColumn
  sortDirection: SortDirection
  onSort: (column: SortColumn) => void
}): ReactElement {
  const { focused, handlers } = useFocusRing()
  const active = column === sortColumn
  return (
    <button
      type="button"
      onClick={() => onSort(column)}
      {...handlers}
      className="pressable"
      style={{
        ...TYPE_CAPTION,
        flex,
        textAlign: 'left',
        color: active ? TEXT_PRIMARY : TEXT_DIM,
        ...focusRingStyle(focused),
      }}
    >
      {COLUMN_LABEL[column].toUpperCase()}
      {active ? (sortDirection === 'asc' ? ' ↑' : ' ↓') : ''}
    </button>
  )
}

function TableBody({
  entries,
  density,
  selectedId,
  onSelectRow,
}: {
  entries: EnrichedRow[]
  density: Density
  selectedId: string | undefined
  onSelectRow: (row: EvidenceRow) => void
}): ReactElement {
  const rowHeight = density === 'compact' ? ROW_HEIGHT_COMPACT : ROW_HEIGHT_DEFAULT
  const containerRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(0)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return undefined
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setViewportHeight(entry.contentRect.height)
    })
    ro.observe(el)
    return (): void => {
      ro.disconnect()
    }
  }, [])

  const virtualized = entries.length > VIRTUALIZE_THRESHOLD

  if (!virtualized) {
    return (
      <div ref={containerRef} className="min-h-0 flex-1 overflow-y-auto">
        {entries.map(({ row, conf, dependents: depCount }) => (
          <EvidenceRowView
            key={row.id}
            row={row}
            conf={conf}
            dependents={depCount}
            height={rowHeight}
            selected={row.traced.id === selectedId}
            onSelect={() => onSelectRow(row)}
          />
        ))}
      </div>
    )
  }

  const { start, end } = computeVisibleRange(scrollTop, viewportHeight, rowHeight, entries.length, OVERSCAN)
  const visible = entries.slice(start, end)

  return (
    <div
      ref={containerRef}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      className="min-h-0 flex-1 overflow-y-auto"
      style={{ position: 'relative' }}
    >
      <div style={{ height: entries.length * rowHeight, position: 'relative' }}>
        {visible.map((entry, i) => (
          <div
            key={entry.row.id}
            style={{ position: 'absolute', top: (start + i) * rowHeight, left: 0, right: 0, height: rowHeight }}
          >
            <EvidenceRowView
              row={entry.row}
              conf={entry.conf}
              dependents={entry.dependents}
              height={rowHeight}
              selected={entry.row.traced.id === selectedId}
              onSelect={() => onSelectRow(entry.row)}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

function EvidenceRowView({
  row,
  conf,
  dependents: depCount,
  height,
  selected,
  onSelect,
}: {
  row: EvidenceRow
  conf: number
  dependents: number
  height: number
  selected: boolean
  onSelect: () => void
}): ReactElement {
  const { focused, handlers } = useFocusRing()
  const belowFloor = conf < CONFIDENCE_FLOOR_DEFAULT

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>): void {
    if (e.key === 'Enter') onSelect()
  }

  return (
    <div
      role="row"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={onKeyDown}
      {...handlers}
      className="pressable-row flex cursor-pointer items-center"
      style={{
        height,
        padding: `0 ${PANEL_PADDING}px`,
        borderBottom: `${BORDER_WIDTH}px solid ${HAIRLINE}`,
        borderLeft: `${ACCENT_INDICATOR_WIDTH}px solid ${selected ? VERIFIED : 'transparent'}`,
        ...focusRingStyle(focused),
      }}
    >
      <div style={{ flex: 2, minWidth: 0 }}>
        <Metric traced={row.traced} label={row.label} format={row.format} />
      </div>
      <div style={{ flex: 1 }} data-metric-id={row.traced.id}>
        <span className="font-mono" style={{ ...TYPE_BODY, color: belowFloor ? WATCH : TEXT_PRIMARY }}>
          {Math.round(conf * 100)}%
        </span>
      </div>
      <div
        style={{
          ...TYPE_BODY,
          flex: 3,
          color: TEXT_SECONDARY,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          paddingRight: SPACE_16,
        }}
        title={row.why ?? undefined}
      >
        {row.why}
      </div>
      <div className="flex items-center justify-between" style={{ ...TYPE_BODY, flex: 1, color: TEXT_SECONDARY }}>
        <span>
          {depCount} value{depCount === 1 ? '' : 's'}
        </span>
        {row.graphHref ? (
          <Link
            href={row.graphHref}
            onClick={(e) => e.stopPropagation()}
            style={{ ...TYPE_CAPTION, color: TEXT_DIM, textTransform: 'none', letterSpacing: 'normal' }}
          >
            Show in graph
          </Link>
        ) : null}
      </div>
    </div>
  )
}
