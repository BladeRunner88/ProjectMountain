import type { ReactElement } from 'react'

import { CRITICAL, TEXT_PRIMARY, TEXT_SECONDARY } from '../types/tokens'
import { PanelLabel } from './primitives'

const W = 220
const H = 110

function LoadRow({ label, value }: { label: string; value: number }): ReactElement {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color: TEXT_SECONDARY }}>
        {label}
      </span>
      <span className="font-mono text-[16px] tabular-nums" style={{ color: TEXT_PRIMARY }}>
        {value.toLocaleString()}m
      </span>
    </div>
  )
}

export function LineAnalysis({
  lineName,
  entry,
  crux,
  exit,
}: {
  lineName: string
  entry: number
  crux: number
  exit: number
}): ReactElement {
  const p0 = { x: 12, y: H - 16 }
  const p1 = { x: W / 2, y: 14 }
  const p2 = { x: W - 12, y: H - 34 }
  const path = `M ${p0.x} ${p0.y} Q ${(p0.x + p1.x) / 2} ${p1.y + 6} ${p1.x} ${p1.y} Q ${(p1.x + p2.x) / 2} ${p1.y + 6} ${p2.x} ${p2.y}`

  return (
    <div className="flex flex-col gap-2">
      <PanelLabel>Line analysis</PanelLabel>
      <p className="font-mono text-[11px]" style={{ color: TEXT_SECONDARY }}>
        {lineName}
      </p>
      <div className="mt-3 flex items-center gap-6">
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="shrink-0">
          <path d={path} fill="none" stroke={CRITICAL} strokeWidth={2} />
          {[p0, p1, p2].map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={3} fill={TEXT_PRIMARY} />
          ))}
        </svg>
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <LoadRow label="Entry" value={entry} />
          <LoadRow label="Crux" value={crux} />
          <LoadRow label="Exit" value={exit} />
        </div>
      </div>
    </div>
  )
}
