import type { ReactNode } from 'react'
import { CompanyNodeShape, EdgeLine, GRAPH_CANVAS_COLOR, MajorNodeShape, SubNodeShape } from './graph/shapes'
import { LegendDiagram } from './LegendDiagram'
import { SquareButton } from '../SquareButton'

function SwatchChip({ children }: { children: ReactNode }) {
  return (
    <svg width="28" height="20" viewBox="0 0 28 20" className="shrink-0 rounded-[3px]">
      <rect width={28} height={20} fill={GRAPH_CANVAS_COLOR} rx={3} />
      {children}
    </svg>
  )
}

const ROWS: { swatch: ReactNode; term: string; description: string }[] = [
  {
    swatch: (
      <SwatchChip>
        <MajorNodeShape x={14} y={10} size={13} status="nominal" />
      </SwatchChip>
    ),
    term: 'Country',
    description: 'the top tier — a nation hosting expeditions. Rounded square, largest of the structural nodes.',
  },
  {
    swatch: (
      <SwatchChip>
        <MajorNodeShape x={14} y={10} size={9} status="nominal" />
      </SwatchChip>
    ),
    term: 'Region',
    description: 'a trekking route or approach within a country. Same shape, one size down.',
  },
  {
    swatch: (
      <SwatchChip>
        <CompanyNodeShape x={14} y={10} size={10} status="nominal" />
      </SwatchChip>
    ),
    term: 'Company',
    description: 'an operating trekking company. Small circle — its colour is rolled up from its climbers.',
  },
  {
    swatch: (
      <SwatchChip>
        <SubNodeShape x={14} y={10} radius={4.5} />
      </SwatchChip>
    ),
    term: 'Climber',
    description: 'one individual on the mountain. Smallest node — blue when nominal, red when anomalous.',
  },
  {
    swatch: (
      <SwatchChip>
        <EdgeLine x1={4} y1={10} x2={24} y2={10} colorKind="grey" />
      </SwatchChip>
    ),
    term: 'Grey edge',
    description: 'a structural link — country ↔ region, region ↔ company, region ↔ environment — while everything beneath it is nominal.',
  },
  {
    swatch: (
      <SwatchChip>
        <EdgeLine x1={4} y1={10} x2={24} y2={10} colorKind="blue" />
      </SwatchChip>
    ),
    term: 'Blue edge',
    description: 'a company → climber link, that climber reporting nominal vitals.',
  },
  {
    swatch: (
      <SwatchChip>
        <EdgeLine x1={2} y1={10} x2={16} y2={10} colorKind="red" />
        <SubNodeShape x={21} y={10} radius={4.5} anomaly />
      </SwatchChip>
    ),
    term: 'Red edge',
    description: 'any link whose child has gone anomalous — climber, environment, or region — rolling all the way up to the country. Pulses slowly.',
  },
]

export function LegendScreen({ onBack, onOpenGraph }: { onBack: () => void; onOpenGraph: () => void }) {
  return (
    <div>
      <h2 className="text-[24px] font-semibold tracking-[-0.01em] text-ink">How to read the graph</h2>

      <div className="mt-8 flex flex-col gap-8 sm:flex-row">
        <div className="w-full shrink-0 overflow-hidden rounded-[8px] sm:w-[200px]">
          <LegendDiagram />
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {ROWS.map((row) => (
            <div key={row.term} className="flex items-start gap-3">
              <div className="mt-0.5">{row.swatch}</div>
              <p className="text-[13px] leading-[1.5] text-ink-soft">
                <span className="font-medium text-ink">{row.term}</span> — {row.description}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-10 flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="text-[14px] text-ink-soft transition-colors duration-fast ease-out hover:text-ink"
        >
          Back
        </button>
        <SquareButton tone="light" onClick={onOpenGraph}>
          Open graph
        </SquareButton>
      </div>
    </div>
  )
}
