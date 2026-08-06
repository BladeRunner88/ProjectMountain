import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
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
} from '../../ase/tokens'
import { confidence, dependents } from '../../ase/folds'
import { Metric } from '../../ase/Metric'
import { useSelection } from '../../ase/selection'
import type { TracedValue } from '../../ase/traced'
import { compareValues, computeVisibleRange, hasRenderableWhy } from './evidenceTableLogic'
import { useDensity, type Density } from './useDensity'
import { focusRingStyle, useFocusRing } from './focusRing'

// The only table (S1e). Every row that makes a claim carries exactly these
// four columns — a tab doesn't get to add, remove, or reorder them.
export interface EvidenceRow {
  id: string
  traced: TracedValue<unknown>
  label: string
  whatThisIs?: string
  /** What CLAIM sorts by — kept explicit rather than inferred from `traced.value`, since that's typed `unknown` here and callers know whether it's numeric or textual. */
  claimSortValue: string | number
  /** ONE short sentence, or null. A row whose reason can't be written as a sentence is dropped entirely, per S1e — never rendered with an empty or token-list WHY. */
  why: string | null
  format?: (value: unknown) => string
  /** S9.5: an optional "Show me in graph" link, rendered inline in the depends-on column rather than as a fifth column — still four columns, one of them just carries a second, smaller affordance, the same way Metric's own `ownerTab` link already does. */
  graphHref?: string
}

type SortColumn = 'claim' | 'confidence' | 'why' | 'depends'
type SortDirection = 'asc' | 'desc'

const VIRTUALIZE_THRESHOLD = 100
const OVERSCAN = 6

export function EvidenceTable({ rows }: { rows: EvidenceRow[] }) {
  const [density] = useDensity()
  const [sortColumn, setSortColumn] = useState<SortColumn>('confidence')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const { selection, select } = useSelection()

  // A row that can't produce a WHY sentence doesn't render at all (S1e).
  const renderable = useMemo(() => rows.filter((r) => hasRenderableWhy(r.why)), [rows])

  const enriched = useMemo(
    () =>
      renderable.map((row) => ({
        row,
        conf: confidence(row.traced),
        dependents: dependents(row.traced.id).length,
      })),
    [renderable]
  )

  const sorted = useMemo(() => {
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

  function toggleSort(column: SortColumn) {
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
      <TableBody
        entries={sorted}
        density={density}
        selectedId={selection?.kind === 'value' ? selection.traced.id : undefined}
        onSelectRow={(row) => select({ kind: 'value', traced: row.traced, label: row.label, whatThisIs: row.whatThisIs })}
      />
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
}) {
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
}) {
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
      {active && (sortDirection === 'asc' ? ' ↑' : ' ↓')}
    </button>
  )
}

function TableBody({
  entries,
  density,
  selectedId,
  onSelectRow,
}: {
  entries: { row: EvidenceRow; conf: number; dependents: number }[]
  density: Density
  selectedId: string | undefined
  onSelectRow: (row: EvidenceRow) => void
}) {
  const rowHeight = density === 'compact' ? ROW_HEIGHT_COMPACT : ROW_HEIGHT_DEFAULT
  const containerRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(0)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setViewportHeight(entry.contentRect.height))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const virtualized = entries.length > VIRTUALIZE_THRESHOLD

  if (!virtualized) {
    return (
      <div ref={containerRef} className="min-h-0 flex-1 overflow-y-auto">
        {entries.map(({ row, conf, dependents }) => (
          <EvidenceRowView
            key={row.id}
            row={row}
            conf={conf}
            dependents={dependents}
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
  dependents,
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
}) {
  const { focused, handlers } = useFocusRing()
  const belowFloor = conf < CONFIDENCE_FLOOR_DEFAULT

  return (
    <div
      role="row"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onSelect()
      }}
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
          {dependents} value{dependents === 1 ? '' : 's'}
        </span>
        {row.graphHref && (
          <Link
            to={row.graphHref}
            onClick={(e) => e.stopPropagation()}
            style={{ ...TYPE_CAPTION, color: TEXT_DIM, textTransform: 'none', letterSpacing: 'normal' }}
          >
            Show in graph
          </Link>
        )}
      </div>
    </div>
  )
}
