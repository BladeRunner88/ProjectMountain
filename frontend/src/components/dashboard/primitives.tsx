import type { ReactNode } from 'react'
import { CRITICAL, INACTIVE_SEGMENT, TEXT_SECONDARY } from './tokens'

export function PanelLabel({ children }: { children: string }) {
  return <p className="font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color: TEXT_SECONDARY }}>{children}</p>
}

// 14 discrete blocks by default — filled red, remainder inactive grey.
// Never a continuous/gradient fill; the whole point is a quantised read.
export function SegmentedBar({ value, max, segments = 14 }: { value: number; max: number; segments?: number }) {
  const filled = Math.max(0, Math.min(segments, Math.round((value / max) * segments)))
  return (
    <div className="flex gap-[3px]">
      {Array.from({ length: segments }, (_, i) => (
        <div key={i} className="h-[6px] flex-1" style={{ backgroundColor: i < filled ? CRITICAL : INACTIVE_SEGMENT }} />
      ))}
    </div>
  )
}

export function KpiTile({ label, value, unit, segValue, segMax }: {
  label: string
  value: string
  unit: string
  segValue: number
  segMax: number
}) {
  return (
    <div className="flex flex-col gap-4 px-8 py-8">
      <PanelLabel>{label}</PanelLabel>
      <p className="font-mono text-[56px] leading-none tracking-tight tabular-nums" style={{ color: '#FFFFFF' }}>
        {value}
        <span className="ml-2 text-[18px]" style={{ color: TEXT_SECONDARY }}>{unit}</span>
      </p>
      <SegmentedBar value={segValue} max={segMax} />
    </div>
  )
}

export function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-[2px] w-3" style={{ backgroundColor: color }} />
      {label}
    </span>
  )
}

// divide-x, not per-panel borders — a first panel with its own left border
// would draw a stray line flush against the viewport edge; Tailwind's
// divide utilities skip the first child for exactly this reason.
export function PanelRow({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-12 divide-x divide-[#1C1C1C] border-t border-[#1C1C1C]">{children}</div>
}

export function Panel({ span, children, className }: { span: number; children: ReactNode; className?: string }) {
  return (
    <div className={`px-8 py-8 ${className ?? ''}`} style={{ gridColumn: `span ${span} / span ${span}` }}>
      {children}
    </div>
  )
}
