import type { ReactElement } from 'react'

import { CRITICAL, INACTIVE_SEGMENT, TEXT_PRIMARY, TEXT_SECONDARY } from '../types/tokens'

const W = 200
const H = 108
const CX = W / 2
const CY = H - 12
const R = 78

export function RampUpBalance({ exposedPct }: { exposedPct: number }): ReactElement {
  const clamped = Math.max(0, Math.min(100, exposedPct))
  const angleDeg = 180 - (clamped / 100) * 180
  const rad = (angleDeg * Math.PI) / 180
  const needleX = CX + (R - 12) * Math.cos(rad)
  const needleY = CY - (R - 12) * Math.sin(rad)
  const arcPointX = CX + R * Math.cos(rad)
  const arcPointY = CY - R * Math.sin(rad)
  const leftEnd = { x: CX - R, y: CY }
  const rightEnd = { x: CX + R, y: CY }

  return (
    <svg width={W} height={H + 24} viewBox={`0 0 ${W} ${H + 24}`}>
      <path
        d={`M ${leftEnd.x} ${leftEnd.y} A ${R} ${R} 0 0 1 ${rightEnd.x} ${rightEnd.y}`}
        fill="none"
        stroke={INACTIVE_SEGMENT}
        strokeWidth={5}
      />
      <path
        d={`M ${arcPointX} ${arcPointY} A ${R} ${R} 0 0 1 ${rightEnd.x} ${rightEnd.y}`}
        fill="none"
        stroke={CRITICAL}
        strokeWidth={5}
      />
      <line x1={CX} y1={CY} x2={needleX} y2={needleY} stroke={TEXT_PRIMARY} strokeWidth={2} />
      <circle cx={CX} cy={CY} r={4} fill={TEXT_PRIMARY} />
      <text x={CX} y={CY - 24} textAnchor="middle" fontSize={22} className="font-mono tabular-nums" fill={TEXT_PRIMARY}>
        {clamped}%
      </text>
      <text
        x={leftEnd.x}
        y={CY + 18}
        fontSize={9}
        letterSpacing="0.1em"
        className="font-mono uppercase"
        fill={TEXT_SECONDARY}
      >
        Run in
      </text>
      <text
        x={rightEnd.x}
        y={CY + 18}
        textAnchor="end"
        fontSize={9}
        letterSpacing="0.1em"
        className="font-mono uppercase"
        fill={TEXT_SECONDARY}
      >
        Exposed
      </text>
    </svg>
  )
}
