import { CRITICAL, HAIRLINE, TEXT_PRIMARY } from './tokens'

const W = 460
const H = 150
const BANDS = 10

function hexToRgb(hex: string) {
  const n = parseInt(hex.slice(1), 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

// A solid intermediate colour, not a gradient primitive — the "fade" is a
// stack of discrete bands, each its own flat fill.
function mixHex(a: string, b: string, t: number): string {
  const pa = hexToRgb(a)
  const pb = hexToRgb(b)
  const r = Math.round(pa.r + (pb.r - pa.r) * t)
  const g = Math.round(pa.g + (pb.g - pa.g) * t)
  const bch = Math.round(pa.b + (pb.b - pa.b) * t)
  return `rgb(${r}, ${g}, ${bch})`
}

export function ExposureLoad({ values }: { values: number[] }) {
  // Real anomaly-load percentages live in a narrow band (roughly 5-20%) —
  // scaling to a fixed 0-100 would squash every real fluctuation against
  // the baseline, so this autoscales to the window's own observed range
  // with a little padding, the way an instrument's needle range would be
  // tuned to what it actually reads rather than its theoretical extremes.
  const dataMin = Math.min(...values)
  const dataMax = Math.max(...values)
  const padding = Math.max((dataMax - dataMin) * 0.25, 2)
  const min = Math.max(0, dataMin - padding)
  const max = dataMax + padding

  const points = values.map((v, i) => ({
    x: (i / (values.length - 1)) * W,
    y: H - ((Math.max(min, Math.min(max, v)) - min) / (max - min)) * H,
  }))
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
  const areaPath = `${linePath} L ${W} ${H} L 0 ${H} Z`

  const peakValue = Math.max(...values)
  const peakIndex = values.indexOf(peakValue)
  const peak = points[peakIndex]

  const bands = Array.from({ length: BANDS }, (_, i) => {
    const yTop = (H / BANDS) * i
    const yBot = (H / BANDS) * (i + 1)
    // top of the chart (near the line) fades toward red; the baseline stays black
    const t = 1 - i / (BANDS - 1)
    return <rect key={i} x={0} y={yTop} width={W} height={yBot - yTop + 0.5} fill={mixHex('#000000', CRITICAL, t)} />
  })

  const gridlineCount = 8

  return (
    <svg width={W} height={H + 22} viewBox={`0 0 ${W} ${H + 22}`}>
      <defs>
        <clipPath id="exposure-load-area">
          <path d={areaPath} />
        </clipPath>
      </defs>
      <g clipPath="url(#exposure-load-area)">{bands}</g>
      {Array.from({ length: gridlineCount }, (_, i) => {
        const x = (i / (gridlineCount - 1)) * W
        return <line key={i} x1={x} y1={0} x2={x} y2={H} stroke={HAIRLINE} strokeWidth={1} strokeDasharray="2 4" />
      })}
      <path d={linePath} fill="none" stroke={CRITICAL} strokeWidth={2} />
      {peak && (
        <>
          <circle cx={peak.x} cy={peak.y} r={3.5} fill={TEXT_PRIMARY} stroke={CRITICAL} strokeWidth={1.5} />
          <text
            x={Math.min(Math.max(peak.x, 60), W - 60)}
            y={Math.max(peak.y - 10, 12)}
            textAnchor="middle"
            fontSize={9}
            letterSpacing="0.1em"
            className="font-mono uppercase"
            fill={TEXT_PRIMARY}
          >
            High exposure
          </text>
        </>
      )}
    </svg>
  )
}
