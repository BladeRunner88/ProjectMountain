import type { ReactElement } from 'react'
import { HAIRLINE, SPACE_8, TEXT_DIM, TEXT_PRIMARY, TEXT_SECONDARY, TYPE_BODY, TYPE_CAPTION } from '@/features/ase/tokens'

const SEGMENTS = 20

export interface RatingRingProps {
  pct: number
  color: string
  size?: number
  strokeWidth?: number
}

export function RatingRing({ pct, color, size = 110, strokeWidth = 6 }: RatingRingProps): ReactElement {
  const r = size / 2 - strokeWidth - 4
  const cx = size / 2
  const cy = size / 2
  const circumference = 2 * Math.PI * r
  const dash = circumference * Math.min(1, Math.max(0, pct / 100))
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Overall score ${pct}%`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={HAIRLINE} strokeWidth={strokeWidth} />
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={`${dash} ${circumference}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ transition: 'stroke-dasharray 150ms var(--cr-ease-out)' }}
      />
      <text x={cx} y={cy + size * 0.065} textAnchor="middle" fill={TEXT_PRIMARY} fontSize={size * 0.236} fontFamily="monospace">
        {Math.round(pct)}
      </text>
    </svg>
  )
}

export interface SegmentedBarProps {
  label: string
  value: number
  max: number
  valueLabel?: string
  percentileLabel: string
  filledColor: string
}

export function SegmentedBar({
  label,
  value,
  max,
  valueLabel,
  percentileLabel,
  filledColor,
}: SegmentedBarProps): ReactElement {
  const frac = max === 0 ? 0 : value / max
  const filled = Math.round(Math.min(1, Math.max(0, frac)) * SEGMENTS)
  return (
    <div style={{ marginBottom: SPACE_8 * 2 }}>
      <div className="flex items-center justify-between">
        <span style={{ ...TYPE_BODY, color: TEXT_PRIMARY }}>{label}</span>
        <span className="font-mono" style={{ ...TYPE_BODY, color: TEXT_SECONDARY }}>
          {valueLabel ?? `${value.toFixed(1)}/${max.toFixed(0)}`}
        </span>
      </div>
      <div className="flex" style={{ gap: 2, marginTop: SPACE_8 }}>
        {Array.from({ length: SEGMENTS }).map((_, i) => (
          <span key={i} style={{ flex: 1, height: 6, background: i < filled ? filledColor : HAIRLINE, borderRadius: 1 }} />
        ))}
      </div>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
        {percentileLabel}
      </p>
    </div>
  )
}
