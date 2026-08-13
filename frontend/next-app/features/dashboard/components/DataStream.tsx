import type { ReactElement } from 'react'

import { CRITICAL, INACTIVE_SEGMENT, TEXT_PRIMARY, TEXT_SECONDARY } from '../types/tokens'
import { LegendItem } from './primitives'

const STAGES = ['BC', 'C1', 'C2', 'C3', 'C4', 'SUMMIT']
const W = 560
const H = 150

function pathFor(values: number[], min: number, max: number): string {
  const range = max - min || 1
  const denom = Math.max(1, values.length - 1)
  return values
    .map((v, i) => {
      const x = (i / denom) * W
      const y = H - ((Math.max(min, Math.min(max, v)) - min) / range) * H
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(' ')
}

export function DataStream({
  spo2Series,
  hrSeries,
  ascentSeries,
}: {
  spo2Series: number[]
  hrSeries: number[]
  ascentSeries: number[]
}): ReactElement {
  const spo2Path = pathFor(spo2Series, 60, 100)
  const hrPath = pathFor(hrSeries, 50, 160)
  const ascentPath = pathFor(ascentSeries, 0, 250)

  return (
    <div className="flex flex-col gap-3">
      <svg width={W} height={H + 22} viewBox={`0 0 ${W} ${H + 22}`}>
        {STAGES.map((stage, i) => {
          const x = (i / (STAGES.length - 1)) * W
          const anchor = i === 0 ? 'start' : i === STAGES.length - 1 ? 'end' : 'middle'
          return (
            <text
              key={stage}
              x={x}
              y={H + 16}
              textAnchor={anchor}
              fontSize={9}
              letterSpacing="0.1em"
              className="font-mono uppercase"
              fill={TEXT_SECONDARY}
            >
              {stage}
            </text>
          )
        })}
        <path d={ascentPath} fill="none" stroke={INACTIVE_SEGMENT} strokeWidth={1.5} />
        <path d={hrPath} fill="none" stroke={TEXT_PRIMARY} strokeWidth={1.5} />
        <path d={spo2Path} fill="none" stroke={CRITICAL} strokeWidth={1.5} />
      </svg>
      <div className="flex gap-6 font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color: TEXT_SECONDARY }}>
        <LegendItem color={CRITICAL} label="SpO2" />
        <LegendItem color={TEXT_PRIMARY} label="Heart rate" />
        <LegendItem color={INACTIVE_SEGMENT} label="Ascent rate" />
      </div>
    </div>
  )
}
