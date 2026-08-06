import { useEffect, useRef, useState } from 'react'
import {
  ANOMALY,
  BAND_HEADER_HEIGHT,
  BORDER_WIDTH,
  FLOW_CURVE_HEADROOM,
  HAIRLINE,
  NOMINAL,
  PANEL,
  RADIUS_STATIC,
  SPACE_12,
  SPACE_16,
  SPACE_32,
  SPACE_8,
  STAGE_BOX_HEIGHT,
  STAGE_BOX_MIN_WIDTH,
  TEXT_DIM,
  TEXT_PRIMARY,
  TYPE_BODY,
  TYPE_CAPTION,
  WATCH,
} from '../../ase/tokens'
import { Metric } from '../../ase/Metric'
import type { PipelineStage, StageState } from '../../ase/dataset'

const BAND_LABELS: { band: 1 | 2 | 3; title: string; subtitle: string }[] = [
  { band: 1, title: 'Observe & resolve', subtitle: 'get the data, clean it, and work out what it’s describing' },
  { band: 2, title: 'Reason & learn', subtitle: 'work out why, spot what’s wrong, and remember it' },
  { band: 3, title: 'Synthesise', subtitle: 'combine it into answers and take corrections' },
]

const STATE_LABEL: Record<StageState, string> = {
  running: 'RUNNING',
  catching_up: 'CATCHING UP',
  degraded: 'DEGRADED',
}
const STATE_COLOR: Record<StageState, string> = {
  running: NOMINAL,
  catching_up: WATCH,
  degraded: ANOMALY,
}

// Hand-rolled SVG (S1f), no charting library. Straight connectors within a
// row, one short orthogonal drop between rows, and exactly one curve —
// stage 12 back to stage 9. Box positions are computed from a measured
// container width (same technique as EvidenceStrip) so the HTML boxes and
// the SVG connectors underneath them can never drift apart.
export function FlowDiagram({ stages }: { stages: PipelineStage[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const rows: PipelineStage[][] = [stages.slice(0, 5), stages.slice(5, 9), stages.slice(9, 12)]
  const gap = SPACE_16
  const rowGap = SPACE_32
  const boxWidth = Math.max(STAGE_BOX_MIN_WIDTH, width > 0 ? (width - 4 * gap) / 5 : STAGE_BOX_MIN_WIDTH)

  // Each row reserves BAND_HEADER_HEIGHT for its title+subtitle above the
  // boxes — headerTops is where that text sits, rowTops is where the boxes
  // (and every connector coordinate below) start.
  const rowSlot = BAND_HEADER_HEIGHT + STAGE_BOX_HEIGHT + rowGap
  const headerTops = [0, rowSlot, rowSlot * 2]
  const rowTops = headerTops.map((t) => t + BAND_HEADER_HEIGHT)
  const totalHeight = rowTops[2] + STAGE_BOX_HEIGHT + FLOW_CURVE_HEADROOM

  function boxX(indexInRow: number): number {
    return indexInRow * (boxWidth + gap)
  }

  const throughputByStage = new Map(stages.map((s) => [s.n, s.throughput.value]))

  return (
    <div ref={containerRef} className="relative w-full" style={{ height: totalHeight }}>
      {width > 0 && (
        <svg width={width} height={totalHeight} viewBox={`0 0 ${width} ${totalHeight}`} className="absolute left-0 top-0">
          {rows.map((row, rowIndex) =>
            row.slice(1).map((stage, i) => {
              const prev = row[i]
              const x1 = boxX(i) + boxWidth
              const x2 = boxX(i + 1)
              const y = rowTops[rowIndex] + STAGE_BOX_HEIGHT / 2
              const ratio = throughputByStage.get(stage.n)! / throughputByStage.get(prev.n)!
              return (
                <g key={`${prev.n}-${stage.n}`}>
                  <line x1={x1} y1={y} x2={x2} y2={y} stroke={HAIRLINE} strokeWidth={BORDER_WIDTH} />
                  {/* Below the box row, not at box-centre height — the gap
                      between boxes is narrower than this label's text, so a
                      label at box height would render partly behind them. */}
                  {ratio < 0.95 && (
                    <text
                      x={(x1 + x2) / 2}
                      y={rowTops[rowIndex] + STAGE_BOX_HEIGHT + SPACE_12}
                      textAnchor="middle"
                      fill={TEXT_DIM}
                      style={{ ...TYPE_CAPTION }}
                    >
                      ×{ratio.toFixed(2)}
                    </text>
                  )}
                </g>
              )
            })
          )}

          {[0, 1].map((rowIndex) => {
            const fromRow = rows[rowIndex]
            const toRow = rows[rowIndex + 1]
            const from = fromRow[fromRow.length - 1]
            const to = toRow[0]
            const x1 = boxX(fromRow.length - 1) + boxWidth / 2
            const y1 = rowTops[rowIndex] + STAGE_BOX_HEIGHT
            const x2 = boxX(0) + boxWidth / 2
            const y2 = rowTops[rowIndex + 1]
            const midY = y1 + rowGap / 2
            const ratio = throughputByStage.get(to.n)! / throughputByStage.get(from.n)!
            return (
              <g key={`${from.n}-${to.n}`}>
                <path
                  d={`M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}`}
                  fill="none"
                  stroke={HAIRLINE}
                  strokeWidth={BORDER_WIDTH}
                />
                {ratio < 0.95 && (
                  <text x={(x1 + x2) / 2} y={midY - SPACE_8} textAnchor="middle" fill={TEXT_DIM} style={{ ...TYPE_CAPTION }}>
                    ×{ratio.toFixed(2)}
                  </text>
                )}
              </g>
            )
          })}

          {/* The one curve: stage 12 back to stage 9, labelled in the clear space below the diagram. */}
          <path
            d={`M ${boxX(2) + boxWidth / 2} ${rowTops[2] + STAGE_BOX_HEIGHT} C ${boxX(2) + boxWidth / 2} ${totalHeight - SPACE_12}, ${boxX(3) + boxWidth / 2} ${totalHeight - SPACE_12}, ${boxX(3) + boxWidth / 2} ${rowTops[1] + STAGE_BOX_HEIGHT}`}
            fill="none"
            stroke={TEXT_DIM}
            strokeWidth={BORDER_WIDTH}
            strokeDasharray="4 3"
          />
          <text
            x={(boxX(2) + boxX(3)) / 2 + boxWidth / 2}
            y={totalHeight - SPACE_8}
            textAnchor="middle"
            fill={TEXT_DIM}
            style={{ ...TYPE_CAPTION }}
          >
            corrections feed back into memory
          </text>
        </svg>
      )}

      {rows.map((row, rowIndex) => (
        <div key={rowIndex}>
          <div className="absolute left-0" style={{ top: headerTops[rowIndex], width }}>
            <p style={{ ...TYPE_BODY, color: TEXT_PRIMARY }}>{BAND_LABELS[rowIndex].title}</p>
            <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, textTransform: 'none', letterSpacing: 'normal' }}>
              {BAND_LABELS[rowIndex].subtitle}
            </p>
          </div>
          <div className="absolute left-0" style={{ top: rowTops[rowIndex] }}>
            {row.map((stage, i) => (
              <div
                key={stage.n}
                className="absolute"
                style={{ left: boxX(i), width: boxWidth, height: STAGE_BOX_HEIGHT }}
                title={stage.description}
              >
                <StageBox stage={stage} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function StageBox({ stage }: { stage: PipelineStage }) {
  return (
    <div
      className="flex h-full flex-col justify-center"
      style={{
        border: `${BORDER_WIDTH}px solid ${HAIRLINE}`,
        borderRadius: RADIUS_STATIC,
        background: PANEL,
        padding: SPACE_8,
      }}
    >
      <div className="flex items-center justify-between">
        <span style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>{stage.n}</span>
        <span style={{ ...TYPE_CAPTION, color: STATE_COLOR[stage.state] }}>{STATE_LABEL[stage.state]}</span>
      </div>
      <p style={{ ...TYPE_CAPTION, color: TEXT_PRIMARY, textTransform: 'none', letterSpacing: 'normal', marginTop: SPACE_8 }}>
        {stage.name}
      </p>
      <div style={{ marginTop: SPACE_8 }}>
        <Metric traced={stage.throughput} label={`${stage.name} throughput`} format={(v) => `${v}/s`} />
      </div>
    </div>
  )
}
