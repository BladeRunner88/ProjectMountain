import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, type Stats, type ObjectType } from '../lib/api'

const TYPE_COLOR: Record<string, string> = {
  Person: '#5B7C99',
  Organization: '#A6803F',
  Location: '#5F8264',
}

const TYPE_LABEL: Record<string, string> = {
  Person: 'PERSON',
  Organization: 'ORGANIZATION',
  Location: 'LOCATION',
}

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max === 0 ? 0 : Math.max((value / max) * 100, 2)
  return (
    <div className="h-1 w-full rounded-full bg-black/[0.06]">
      <div
        className="h-1 rounded-full transition-[width] duration-500 ease-out"
        style={{ width: `${pct}%`, backgroundColor: color }}
      />
    </div>
  )
}

export function Dashboard() {
  const navigate = useNavigate()
  const [stats, setStats] = useState<Stats | null>(null)

  useEffect(() => {
    api.stats().then(setStats)
  }, [])

  if (!stats) {
    return <div className="h-full w-full bg-app" />
  }

  const typeEntries = Object.entries(stats.by_type) as [string, number][]
  const maxByType = Math.max(...typeEntries.map(([, v]) => v), 1)

  const linkEntries = Object.entries(stats.links_by_type) as [string, number][]
  const maxLinks = Math.max(...linkEntries.map(([, v]) => v), 1)

  return (
    <div className="h-full w-full overflow-y-auto bg-app">
      <div className="mx-auto max-w-3xl px-8 py-16">
        {/* entities by type */}
        <section>
          <h2 className="text-[13px] font-medium text-ink-soft">Entities</h2>
          <div className="mt-6 grid grid-cols-3 gap-8">
            {typeEntries.map(([type, count]) => (
              <div key={type}>
                <p className="font-mono text-[32px] leading-none text-ink">
                  {count.toLocaleString()}
                </p>
                <p className="mt-2 text-[13px] text-ink-soft">{type}</p>
                <div className="mt-3">
                  <Bar value={count} max={maxByType} color={TYPE_COLOR[type] ?? '#98989D'} />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* resolution stats — the highlight */}
        <section className="mt-16 border-y border-hairline py-12">
          <h2 className="text-[13px] font-medium text-ink-soft">Resolution</h2>
          <div className="mt-6 flex flex-wrap items-baseline gap-x-3 gap-y-2">
            <span className="font-mono text-[40px] leading-none text-ink">
              {stats.resolution.raw_records.toLocaleString()}
            </span>
            <span className="text-[15px] text-ink-soft">records</span>
            <span className="mx-1 text-[28px] text-ink-faint">→</span>
            <span className="font-mono text-[40px] leading-none text-ink">
              {stats.resolution.resolved_entities.toLocaleString()}
            </span>
            <span className="text-[15px] text-ink-soft">entities</span>
            <span className="mx-1 text-[22px] text-ink-faint">·</span>
            <span className="font-mono text-[28px] leading-none text-ink-soft">
              {stats.resolution.merged.toLocaleString()}
            </span>
            <span className="text-[15px] text-ink-soft">merged</span>
          </div>
        </section>

        {/* most connected */}
        <section className="mt-16">
          <h2 className="text-[13px] font-medium text-ink-soft">Most connected</h2>
          <div className="mt-4">
            {stats.most_connected.map((e, i) => (
              <button
                key={e.id}
                type="button"
                onClick={() => navigate(`/app/graph?focus=${e.id}`)}
                className={`flex w-full items-center gap-4 py-3 text-left transition-colors duration-fast ease-out hover:text-accent ${
                  i === 0 ? '' : 'border-t border-hairline'
                }`}
              >
                <span className="w-5 shrink-0 font-mono text-[12px] text-ink-faint">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-ink">
                  {e.name}
                </span>
                <span className="shrink-0 font-mono text-[10px] tracking-wide text-ink-faint">
                  {TYPE_LABEL[e.type as ObjectType] ?? e.type}
                </span>
                <span className="w-10 shrink-0 text-right font-mono text-[13px] text-ink-soft">
                  {e.connections}
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* links by relationship type */}
        <section className="mt-16 pb-16">
          <h2 className="text-[13px] font-medium text-ink-soft">Links</h2>
          <div className="mt-4">
            {linkEntries.map(([relType, count], i) => (
              <div
                key={relType}
                className={`flex items-center gap-4 py-3 ${i === 0 ? '' : 'border-t border-hairline'}`}
              >
                <span className="w-32 shrink-0 font-mono text-[12px] text-ink-soft">
                  {relType}
                </span>
                <div className="flex-1">
                  <Bar value={count} max={maxLinks} color="#98989D" />
                </div>
                <span className="w-10 shrink-0 text-right font-mono text-[13px] text-ink">
                  {count}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
