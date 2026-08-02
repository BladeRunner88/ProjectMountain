import type { ReactNode } from 'react'
import type { SourceId } from '../demo/graph/useGraphSimulation'
import { CRITICAL, TEXT_PRIMARY, TEXT_SECONDARY } from './tokens'
import { PanelLabel } from './primitives'

export interface SourceRow {
  id: SourceId
  name: string
  recordCount: number
  lastSync: Date
  degraded: boolean
}

const INGEST_STAGES = ['Stream parser', 'Normaliser']
const ONTOLOGY_STAGES = ['Entity resolver', 'Link builder', 'Anomaly engine']
const SURFACE_STAGES = ['Graph', 'Dashboard', 'Findings']

const ROW_HEIGHT = 42
const HEIGHT = 230
// A single coordinate system shared by the SVG connector layer and the HTML
// column layers below — both are positioned off the exact same rowY/column
// math, so a connector can never visually drift from the row it belongs to.
const WIDTH = 1000
const COL_WIDTH = WIDTH / 4
const BOUNDARY_2 = COL_WIDTH * 2
const BOUNDARY_3 = COL_WIDTH * 3

function rowY(index: number, count: number): number {
  const totalHeight = count * ROW_HEIGHT
  const startY = (HEIGHT - totalHeight) / 2
  return startY + index * ROW_HEIGHT + ROW_HEIGHT / 2
}

function pad2(n: number) {
  return String(n).padStart(2, '0')
}
function formatTime(d: Date) {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
}

function Column({ index, children }: { index: number; children: ReactNode }) {
  return (
    <div className="absolute top-0" style={{ left: `${index * 25}%`, width: '25%', height: HEIGHT }}>
      {children}
    </div>
  )
}

// Text sits well clear of the connector ticks at each column boundary — the
// inset is deliberate, not incidental, so a line can never read as striking
// through a label.
function StageList({ items, insetPct }: { items: string[]; insetPct: number }) {
  return (
    <>
      {items.map((item, i) => (
        <p
          key={item}
          className="absolute truncate font-mono text-[12px]"
          style={{ top: rowY(i, items.length) - 7, left: `${insetPct}%`, right: 0, color: TEXT_PRIMARY }}
        >
          {item}
        </p>
      ))}
    </>
  )
}

export function ConnectedSystems({
  sources,
  selectedSourceId,
  onSelectSource,
}: {
  sources: SourceRow[]
  selectedSourceId: SourceId | null
  onSelectSource: (id: SourceId) => void
}) {
  const centerY = HEIGHT / 2
  const stubEndX = COL_WIDTH - 30
  const funnelX = COL_WIDTH

  return (
    <div>
      <div className="grid grid-cols-4">
        <PanelLabel>Sources</PanelLabel>
        <PanelLabel>Ingest</PanelLabel>
        <PanelLabel>Ontology</PanelLabel>
        <PanelLabel>Surfaces</PanelLabel>
      </div>

      <div className="relative mt-4" style={{ height: HEIGHT }}>
        <svg
          className="pointer-events-none absolute inset-0"
          width="100%"
          height={HEIGHT}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          preserveAspectRatio="none"
        >
          {/* fan-in: each source's own stub, coloured by that source alone */}
          {sources.map((source, i) => (
            <line
              key={source.id}
              x1={stubEndX}
              y1={rowY(i, sources.length)}
              x2={funnelX}
              y2={centerY}
              stroke={source.degraded ? CRITICAL : TEXT_PRIMARY}
              strokeWidth={1.25}
            />
          ))}
          {/* backbone ticks live entirely in the gap between columns — never
              crossing into a column's own text (which insets clear of them) */}
          <line x1={BOUNDARY_2 - 30} y1={centerY} x2={BOUNDARY_2 + 30} y2={centerY} stroke={TEXT_PRIMARY} strokeWidth={1.25} />
          <line x1={BOUNDARY_3 - 30} y1={centerY} x2={BOUNDARY_3 + 30} y2={centerY} stroke={TEXT_PRIMARY} strokeWidth={1.25} />
        </svg>

        <Column index={0}>
          {sources.map((source, i) => {
            const selected = selectedSourceId === source.id
            const dimmed = selectedSourceId !== null && !selected
            return (
              <button
                key={source.id}
                type="button"
                onClick={() => onSelectSource(source.id)}
                className="absolute left-0 flex items-center gap-2.5 pr-10 text-left transition-opacity duration-fast ease-out"
                style={{ top: rowY(i, sources.length) - ROW_HEIGHT / 2, height: ROW_HEIGHT, width: '100%', opacity: dimmed ? 0.35 : 1 }}
              >
                <span
                  className="h-[6px] w-[6px] shrink-0 rounded-full"
                  style={{ backgroundColor: source.degraded ? CRITICAL : TEXT_PRIMARY }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-[12px]" style={{ color: TEXT_PRIMARY }}>
                    {source.name}
                  </span>
                  <span className="block truncate font-mono text-[10px]" style={{ color: TEXT_SECONDARY }}>
                    {source.recordCount.toLocaleString()} recs · {formatTime(source.lastSync)}
                  </span>
                </span>
              </button>
            )
          })}
        </Column>

        <Column index={1}>
          <StageList items={INGEST_STAGES} insetPct={16} />
        </Column>
        <Column index={2}>
          <StageList items={ONTOLOGY_STAGES} insetPct={16} />
        </Column>
        <Column index={3}>
          <StageList items={SURFACE_STAGES} insetPct={16} />
        </Column>
      </div>
    </div>
  )
}
