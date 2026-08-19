'use client'

import type { ReactElement, ReactNode } from 'react'

import type { SourceId, SourceRow } from '../types'
import { CRITICAL, TEXT_PRIMARY, TEXT_SECONDARY } from '../types/tokens'
import { PanelLabel } from './primitives'

const INGEST_STAGES = ['Stream parser', 'Normaliser']
const ONTOLOGY_STAGES = ['Entity resolver', 'Link builder', 'Anomaly engine']
const SURFACE_STAGES = ['Graph', 'Dashboard', 'Findings']

const ROW_HEIGHT = 42
const HEIGHT = 230
const WIDTH = 1000
const COL_WIDTH = WIDTH / 4
const BOUNDARY_2 = COL_WIDTH * 2
const BOUNDARY_3 = COL_WIDTH * 3

function rowY(index: number, count: number): number {
  const totalHeight = count * ROW_HEIGHT
  const startY = (HEIGHT - totalHeight) / 2
  return startY + index * ROW_HEIGHT + ROW_HEIGHT / 2
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}
function formatTime(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
}

function Column({ index, children }: { index: number; children: ReactNode }): ReactElement {
  return (
    <div className="absolute top-0" style={{ left: `${index * 25}%`, width: '25%', height: HEIGHT }}>
      {children}
    </div>
  )
}

function StageList({ items, insetPct }: { items: string[]; insetPct: number }): ReactElement {
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
}): ReactElement {
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
          <line
            x1={BOUNDARY_2 - 30}
            y1={centerY}
            x2={BOUNDARY_2 + 30}
            y2={centerY}
            stroke={TEXT_PRIMARY}
            strokeWidth={1.25}
          />
          <line
            x1={BOUNDARY_3 - 30}
            y1={centerY}
            x2={BOUNDARY_3 + 30}
            y2={centerY}
            stroke={TEXT_PRIMARY}
            strokeWidth={1.25}
          />
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
                style={{
                  top: rowY(i, sources.length) - ROW_HEIGHT / 2,
                  height: ROW_HEIGHT,
                  width: '100%',
                  opacity: dimmed ? 0.35 : 1,
                }}
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
