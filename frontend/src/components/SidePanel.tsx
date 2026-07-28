import { useEffect, useState } from 'react'
import { api, type ObjectDetail } from '../lib/api'

const TYPE_LABEL: Record<string, string> = {
  Person: 'PERSON',
  Organization: 'ORGANIZATION',
  Location: 'LOCATION',
}

type SidePanelProps = {
  objectId: string
  onClose: () => void
  onNavigate: (id: string) => void
}

export function SidePanel({ objectId, onClose, onNavigate }: SidePanelProps) {
  const [detail, setDetail] = useState<ObjectDetail | null>(null)

  useEffect(() => {
    let cancelled = false
    setDetail(null)
    api.object(objectId).then((d) => {
      if (!cancelled) setDetail(d)
    })
    return () => {
      cancelled = true
    }
  }, [objectId])

  if (!detail) {
    return (
      <aside className="flex h-full w-[360px] shrink-0 flex-col border-l border-hairline bg-app" />
    )
  }

  const { name, ...rest } = detail.properties as { name: string; [k: string]: unknown }

  return (
    <aside className="flex h-full w-[360px] shrink-0 flex-col overflow-y-auto border-l border-hairline bg-app">
      <div className="flex items-start justify-between px-6 pt-6">
        <div>
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink-faint">
            {TYPE_LABEL[detail.type] ?? detail.type}
          </p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-ink">{name}</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-0.5 text-ink-faint transition-colors duration-fast ease-out hover:text-ink"
          aria-label="Close"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {Object.keys(rest).length > 0 && (
        <div className="mt-8 px-6">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink-faint">
            Properties
          </p>
          <dl className="mt-3 flex flex-col gap-2.5">
            {Object.entries(rest).map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-4">
                <dt className="text-[13px] text-ink-soft">{k}</dt>
                <dd className="text-right text-[13px] font-medium text-ink">
                  {v == null ? '—' : String(v)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      <div className="mt-8 px-6">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink-faint">
          Connections ({detail.connections.length})
        </p>
        {detail.connections.length === 0 ? (
          <p className="mt-3 text-[13px] text-ink-faint">No linked objects.</p>
        ) : (
          <div className="mt-3 flex flex-col">
            {detail.connections.map((c, i) => (
              <button
                key={`${c.direction}-${c.rel_type}-${c.id}-${i}`}
                type="button"
                onClick={() => onNavigate(c.id)}
                className={`flex items-center justify-between gap-3 py-2.5 text-left transition-colors duration-fast ease-out hover:text-accent ${
                  i === 0 ? '' : 'border-t border-hairline'
                }`}
              >
                <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{c.name}</span>
                <span className="shrink-0 font-mono text-[11px] text-ink-faint">
                  {c.direction === 'out' ? c.rel_type : `← ${c.rel_type}`}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {detail.resolved_from.length > 1 && (
        <div className="mt-8 px-6 pb-8">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink-faint">
            Resolved from ({detail.resolved_from.length})
          </p>
          <div className="mt-3 flex flex-col gap-1.5">
            {detail.resolved_from.map((r) => (
              <div
                key={`${r.source_table}-${r.source_id}`}
                className="flex items-baseline justify-between gap-4"
              >
                <span className="text-[13px] text-ink-soft">{r.raw_name}</span>
                <span className="shrink-0 font-mono text-[11px] text-ink-faint">
                  {r.source_table}#{r.source_id}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </aside>
  )
}
