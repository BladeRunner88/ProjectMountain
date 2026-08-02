import { TEXT_PRIMARY, TEXT_SECONDARY } from './tokens'
import { SegmentedBar } from './primitives'

const TEMP_MIN = -40
const TEMP_MAX = 10

export function CampTemperature({ camps }: { camps: { label: string; tempC: number }[] }) {
  return (
    <div className="flex flex-col gap-5">
      {camps.map((camp) => (
        <div key={camp.label} className="flex items-center gap-4">
          <span
            className="w-8 shrink-0 font-mono text-[10px] uppercase tracking-[0.12em]"
            style={{ color: TEXT_SECONDARY }}
          >
            {camp.label}
          </span>
          <div className="min-w-0 flex-1">
            {/* fill grows as it gets colder, not warmer — colder reads as
                more severe on this instrument, same convention as the KPI
                row's anomaly-load bars */}
            <SegmentedBar value={TEMP_MAX - camp.tempC} max={TEMP_MAX - TEMP_MIN} />
          </div>
          <span className="w-14 shrink-0 text-right font-mono text-[14px] tabular-nums" style={{ color: TEXT_PRIMARY }}>
            {camp.tempC}C
          </span>
        </div>
      ))}
    </div>
  )
}
