"use client"

import type { ReactElement } from "react"

import type { Finding } from "../types/finding"
import { formatComputed, humaniseFindingType } from "../services/display"

interface FindingRowProps {
  finding: Finding
  isFirst: boolean
  onOpenLineage: () => void
}

export function FindingRow({
  finding,
  isFirst,
  onOpenLineage,
}: FindingRowProps): ReactElement {
  const subject = finding.entities[0]
  const computed = formatComputed(finding.computed)

  return (
    <article
      className={`flex items-start justify-between gap-6 py-6 ${isFirst ? "" : "border-t border-hairline"}`}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-medium tracking-[0.06em] text-ink-faint uppercase">
            {humaniseFindingType(finding.finding_type)}
          </span>
          <span className="font-mono text-[11px] text-ink-faint">
            {finding.id}
          </span>
        </div>

        <p className="mt-1.5 text-[16px] font-medium text-ink">
          {finding.title}
        </p>
        <p className="mt-2 max-w-xl text-[14px] leading-[1.6] text-ink-soft">
          {finding.description}
        </p>

        {computed.length > 0 ? (
          <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[12px]">
            {computed.map(({ label, value }) => (
              <div key={label} className="flex items-baseline gap-1.5">
                <dt className="text-ink-faint">{label}</dt>
                <dd className="font-mono text-ink-soft">{value}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-ink-faint">
          <span>Computed from:</span>
          {finding.sources.map((source) => (
            <span key={source} className="font-mono text-ink-soft">
              {source}
            </span>
          ))}
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-2">
        {subject ? (
          <span className="text-[12px] text-ink-faint">
            {subject.type}:{" "}
            <span className="text-ink-soft">{subject.name}</span>
          </span>
        ) : null}
        <button
          type="button"
          onClick={onOpenLineage}
          className="duration-fast border border-ink px-3 py-1.5 text-[13px] font-medium text-ink transition-colors ease-out hover:bg-ink hover:text-app"
        >
          Trace this number
        </button>
      </div>
    </article>
  )
}
