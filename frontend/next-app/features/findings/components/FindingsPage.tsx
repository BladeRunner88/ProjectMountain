'use client'

import { useMemo, type ReactElement } from 'react'
import { useRouter } from 'next/navigation'

import { getFlags, getNode, nameOf } from '../mock'
import type { Flag } from '../mock'

const KIND_LABEL: Record<string, string> = {
  silent_source: 'Silent source',
  reconciliation_mismatch: 'Reconciliation mismatch',
  statistical_outlier: 'Statistical outlier',
  duplicate_account: 'Duplicate account',
}

interface FlagRow {
  flag: Flag
  entityName: string
  entityId: string
}

export function FindingsPage(): ReactElement {
  const router = useRouter()
  const flags = getFlags()
  const rows = useMemo<FlagRow[]>(
    () =>
      flags.flatMap((flag) => {
        const entity = getNode(flag.entityId)
        if (!entity) return []
        return [{ flag, entityName: nameOf(entity), entityId: entity.id }]
      }),
    [flags]
  )

  return (
    <div className="h-full w-full overflow-y-auto bg-app">
      <div className="mx-auto max-w-3xl px-8 py-16">
        <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-ink">Findings</h1>
        <p className="mt-2 text-[14px] text-ink-soft">
          {flags.length} computed data discrepancies awaiting review.
        </p>

        {rows.length === 0 ? (
          <p className="mt-10 text-[14px] text-ink-soft">No findings to review.</p>
        ) : (
          <div className="mt-10">
            {rows.map(({ flag, entityName, entityId }, i) => (
              <div
                key={entityId}
                className={`flex items-start justify-between gap-6 py-6 ${i === 0 ? '' : 'border-t border-hairline'}`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-ink-faint">
                      {KIND_LABEL[flag.kind] ?? flag.kind}
                    </span>
                    <span className="font-mono text-[11px] text-ink-faint">{entityId}</span>
                  </div>
                  <p className="mt-1.5 text-[16px] font-medium text-ink">{entityName}</p>
                  <p className="mt-2 max-w-xl text-[14px] leading-[1.6] text-ink-soft">{flag.reason}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-ink-faint">
                    <span>Sources:</span>
                    {flag.sources.map((s) => (
                      <span key={s} className="font-mono text-ink-soft">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <button
                    type="button"
                    onClick={() => router.push(`/app/control-room?focus=${flag.entityId}`)}
                    className="text-[13px] text-ink-soft transition-colors duration-fast ease-out hover:text-accent"
                  >
                    View in graph
                  </button>
                  {flag.metricKey ? (
                    <button
                      type="button"
                      onClick={() =>
                        router.push(
                          `/app/control-room/reconciliation/${flag.metricKey}?entity=${flag.entityId}&from=/app/control-room/findings`
                        )
                      }
                      className="border border-ink px-3 py-1.5 text-[13px] font-medium text-ink transition-colors duration-fast ease-out hover:bg-ink hover:text-app"
                    >
                      Open reconciliation
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
