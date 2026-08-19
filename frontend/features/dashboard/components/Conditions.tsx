import type { ReactElement } from 'react'

import { CRITICAL, INACTIVE_SEGMENT, TEXT_PRIMARY, TEXT_SECONDARY } from '../types/tokens'
import { PanelLabel } from './primitives'

const SIZE = 76
const C = SIZE / 2
const R = 30

function CompassGlyph({ bearingDeg }: { bearingDeg: number }): ReactElement {
  const rad = ((bearingDeg - 90) * Math.PI) / 180
  const tipX = C + R * Math.cos(rad)
  const tipY = C + R * Math.sin(rad)
  const spread = 2.7
  const b1x = C + R * 0.38 * Math.cos(rad + spread * 0.35)
  const b1y = C + R * 0.38 * Math.sin(rad + spread * 0.35)
  const b2x = C + R * 0.38 * Math.cos(rad - spread * 0.35)
  const b2y = C + R * 0.38 * Math.sin(rad - spread * 0.35)

  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
      <circle cx={C} cy={C} r={R} fill="none" stroke={INACTIVE_SEGMENT} strokeWidth={1} />
      <polygon points={`${tipX},${tipY} ${b1x},${b1y} ${b2x},${b2y}`} fill={CRITICAL} />
      <text x={C} y={9} textAnchor="middle" fontSize={8} className="font-mono" fill={TEXT_SECONDARY}>
        N
      </text>
    </svg>
  )
}

export function Conditions({
  tempC,
  vibrationMmS,
  vibrationBearingDeg,
}: {
  tempC: number
  vibrationMmS: number
  vibrationBearingDeg: number
}): ReactElement {
  return (
    <div className="flex items-center gap-10">
      <div className="flex flex-col gap-3">
        <PanelLabel>Temp</PanelLabel>
        <p className="font-mono text-[40px] leading-none tabular-nums" style={{ color: TEXT_PRIMARY }}>
          {tempC}
          <span className="ml-1 text-[16px]" style={{ color: TEXT_SECONDARY }}>
            C
          </span>
        </p>
      </div>
      <div className="flex flex-col gap-3">
        <PanelLabel>Vibration</PanelLabel>
        <p className="font-mono text-[40px] leading-none tabular-nums" style={{ color: TEXT_PRIMARY }}>
          {vibrationMmS}
          <span className="ml-1 text-[16px]" style={{ color: TEXT_SECONDARY }}>
            kph
          </span>
        </p>
      </div>
      <div className="flex flex-col items-center gap-3">
        <PanelLabel>Bearing</PanelLabel>
        <CompassGlyph bearingDeg={vibrationBearingDeg} />
      </div>
    </div>
  )
}
