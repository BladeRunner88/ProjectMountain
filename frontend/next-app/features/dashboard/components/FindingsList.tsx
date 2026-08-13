import type { ReactElement } from 'react'

import type { Finding, SourceId } from '@/features/demo/types'

import { CRITICAL, TEXT_PRIMARY, TEXT_SECONDARY } from '../types/tokens'
import { PanelLabel } from './primitives'

const LEVEL_COLOR: Record<Finding['level'], string> = {
  nominal: TEXT_PRIMARY,
  watch: TEXT_PRIMARY,
  anomaly: CRITICAL,
}

const VISIBLE_COUNT = 8

export function FindingsList({
  findings,
  selectedSourceId,
  sourceNameById,
}: {
  findings: Finding[]
  selectedSourceId: SourceId | null
  sourceNameById: ReadonlyMap<SourceId, string>
}): ReactElement {
  const filtered = selectedSourceId ? findings.filter((f) => f.source === selectedSourceId) : findings
  const visible = filtered.slice(-VISIBLE_COUNT).reverse()

  return (
    <div className="flex flex-col gap-3">
      <PanelLabel>
        {selectedSourceId
          ? `Findings — ${sourceNameById.get(selectedSourceId) ?? selectedSourceId}`
          : 'Findings — all sources'}
      </PanelLabel>
      <div className="flex flex-col gap-1.5">
        {visible.length === 0 && (
          <p className="font-mono text-[12px]" style={{ color: TEXT_SECONDARY }}>
            No findings from this source yet.
          </p>
        )}
        {visible.map((finding) => (
          <div key={finding.id} className="flex items-baseline gap-3 font-mono text-[11px] leading-snug">
            <span className="shrink-0" style={{ color: TEXT_SECONDARY }}>
              {finding.time}
            </span>
            <span className="w-16 shrink-0 font-semibold" style={{ color: LEVEL_COLOR[finding.level] }}>
              {finding.level.toUpperCase()}
            </span>
            <span className="truncate" style={{ color: TEXT_PRIMARY }}>
              {finding.message}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
