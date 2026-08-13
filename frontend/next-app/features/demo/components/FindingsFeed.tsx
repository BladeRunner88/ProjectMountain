import type { ReactElement } from 'react'

import type { Finding } from '../types/simulation'
import { ANOMALY_COLOR, CLIMBER_NORMAL_COLOR, WATCH_COLOR } from './shapes'

const LEVEL_COLOR: Record<Finding['level'], string> = {
  nominal: CLIMBER_NORMAL_COLOR,
  watch: WATCH_COLOR,
  anomaly: ANOMALY_COLOR,
}

const VISIBLE_COUNT = 6

export function FindingsFeed({ findings }: { findings: Finding[] }): ReactElement | null {
  if (findings.length === 0) return null
  const visible = findings.slice(-VISIBLE_COUNT)

  return (
    <div className="pointer-events-none absolute bottom-4 left-4 z-10 flex w-[380px] flex-col gap-1.5 rounded-[8px] border border-white/10 bg-black/50 p-3 backdrop-blur-sm">
      <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-white/40">Findings</p>
      {visible.map((finding) => (
        <div key={finding.id} className="flex items-baseline gap-2 font-mono text-[11px] leading-snug">
          <span className="shrink-0 text-white/40">{finding.time}</span>
          <span className="w-14 shrink-0 font-semibold" style={{ color: LEVEL_COLOR[finding.level] }}>
            {finding.level.toUpperCase()}
          </span>
          <span className="truncate text-white/70">{finding.message}</span>
        </div>
      ))}
    </div>
  )
}
