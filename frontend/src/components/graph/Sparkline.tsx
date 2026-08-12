// S8.9: a hand-rolled SVG sparkline — no chart library (S8.0's rule still
// binds here). Renders whatever buffer it's handed; it has no idea it's
// SpO2 or HR, or that the buffer resets when the panel switches climbers —
// that's the caller's concern (vitalsStore.ts).

export function Sparkline({ values, width = 140, height = 32, color, min, max }: { values: readonly number[]; width?: number; height?: number; color: string; min: number; max: number }) {
  if (values.length < 2) return <svg width={width} height={height} />

  const span = Math.max(1e-6, max - min)
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width
      const y = height - ((v - min) / span) * height
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}
