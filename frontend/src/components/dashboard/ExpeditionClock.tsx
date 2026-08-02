import { useEffect, useState } from 'react'
import { CRITICAL, INACTIVE_SEGMENT, TEXT_PRIMARY } from './tokens'

const SIZE = 176
const CENTER = SIZE / 2
const R_OUTER = 82
const TICK_LEN = 10

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

// Radial 60-tick gauge — reads as a clock face, not a countdown: elapsed
// seconds within the current minute light up red, the rest stay inactive.
export function ExpeditionClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(interval)
  }, [])

  const elapsedTicks = now.getSeconds() + 1
  const ticks = Array.from({ length: 60 }, (_, i) => {
    const angle = (i / 60) * 360 - 90
    const rad = (angle * Math.PI) / 180
    const major = i % 5 === 0
    const inner = R_OUTER - TICK_LEN
    const x1 = CENTER + inner * Math.cos(rad)
    const y1 = CENTER + inner * Math.sin(rad)
    const x2 = CENTER + R_OUTER * Math.cos(rad)
    const y2 = CENTER + R_OUTER * Math.sin(rad)
    const active = i < elapsedTicks
    return (
      <line
        key={i}
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={active ? CRITICAL : INACTIVE_SEGMENT}
        strokeWidth={major ? 2.5 : 1.25}
      />
    )
  })

  const time = `${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`

  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
      {ticks}
      <text
        x={CENTER}
        y={CENTER + 7}
        textAnchor="middle"
        fontSize={22}
        letterSpacing="0.02em"
        className="font-mono tabular-nums"
        fill={TEXT_PRIMARY}
      >
        {time}
      </text>
    </svg>
  )
}
