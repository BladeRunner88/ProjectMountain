import type { ReactElement } from 'react'

import type { StationTemp } from '../types'
import { TEXT_PRIMARY, TEXT_SECONDARY } from '../types/tokens'
import { SegmentedBar } from './primitives'

const TEMP_MIN = -40
const TEMP_MAX = 10

export function StationTemperature({ stations }: { stations: StationTemp[] }): ReactElement {
  return (
    <div className="flex flex-col gap-5">
      {stations.map((station) => (
        <div key={station.label} className="flex items-center gap-4">
          <span
            className="w-8 shrink-0 font-mono text-[10px] uppercase tracking-[0.12em]"
            style={{ color: TEXT_SECONDARY }}
          >
            {station.label}
          </span>
          <div className="min-w-0 flex-1">
            <SegmentedBar value={TEMP_MAX - station.tempC} max={TEMP_MAX - TEMP_MIN} />
          </div>
          <span className="w-14 shrink-0 text-right font-mono text-[14px] tabular-nums" style={{ color: TEXT_PRIMARY }}>
            {station.tempC}C
          </span>
        </div>
      ))}
    </div>
  )
}
