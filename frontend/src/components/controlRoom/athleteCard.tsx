import { HAIRLINE, SPACE_8, TEXT_DIM, TEXT_PRIMARY, TEXT_SECONDARY, TYPE_BODY, TYPE_CAPTION } from '../../ase/tokens'

// S9.6b convention #4: "THE ATHLETE-CARD TREATMENT." 9.6's Scoring
// established a rating card — a large overall inside a filled ring,
// attribute rows with 20-block segmented bars, and a percentile beneath
// each. Reserved for exactly ONE more use: 9.10 Prediction's PHYSIOLOGICAL
// READINESS card. "Do not reuse this treatment anywhere else. Two surfaces
// is a pattern; five is wallpaper" — check that instruction still holds
// before importing either of these into a third tab.

const SEGMENTS = 20

/** The overall-score ring — just the SVG, not the surrounding card (name/serial and the caption lines beside it are specific to each consumer, composed by the caller). */
export function RatingRing({ pct, color, size = 110, strokeWidth = 6 }: { pct: number; color: string; size?: number; strokeWidth?: number }) {
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

/** One attribute row — label/value, a 20-block segmented bar filled to `value/max`, and a percentile line beneath. */
export function SegmentedBar({
  label,
  value,
  max,
  valueLabel,
  percentileLabel,
  filledColor,
}: {
  label: string
  value: number
  max: number
  /** Defaults to "{value}/{max}" — override for a different unit (e.g. a physiological axis that isn't a 0..weight fraction). */
  valueLabel?: string
  /** Defaults to "higher than {value/max as a percentile}% of resolved people" — override for a different population framing. */
  percentileLabel: string
  filledColor: string
}) {
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
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>{percentileLabel}</p>
    </div>
  )
}
