import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, type SearchResult } from '../lib/api'
import { EmptyState } from '../components/EmptyState'
import { SearchIcon } from '../components/icons'

const TYPE_LABEL: Record<string, string> = {
  Person: 'PERSON',
  Organization: 'ORGANIZATION',
  Location: 'LOCATION',
}

export function Search() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Every keystroke hits GET /search?q= directly — no bulk fetch, no
  // client-side matching. An AbortController guards against an older,
  // slower request resolving after a newer one and showing stale results.
  useEffect(() => {
    const q = query.trim()
    abortRef.current?.abort()
    if (!q) {
      setResults([])
      setLoading(false)
      return
    }
    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)
    api
      .search(q, controller.signal)
      .then((r) => {
        setResults(r)
        setActiveIndex(0)
        setLoading(false)
      })
      .catch((err) => {
        if (err.name !== 'AbortError') setLoading(false)
      })
    return () => controller.abort()
  }, [query])

  const openResult = (r: SearchResult) => {
    navigate(`/app/graph?focus=${r.id}`)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (results.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      openResult(results[activeIndex])
    }
  }

  return (
    <div className="flex h-full w-full flex-col bg-app">
      <div className="mx-auto w-full max-w-2xl px-6 pt-20">
        <div className="border-b border-hairline pb-4">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search entities, documents, relationships…"
            className="w-full bg-transparent text-2xl font-medium tracking-tight text-ink placeholder:text-ink-faint focus:outline-none"
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        {query.trim() === '' ? (
          <div className="pt-20">
            <EmptyState
              icon={SearchIcon}
              title="Search your data"
              subtitle="Find entities, documents, and relationships across every source."
            />
          </div>
        ) : results.length === 0 && !loading ? (
          <p className="pt-10 text-[14px] text-ink-faint">No results for "{query}".</p>
        ) : (
          <div className="py-4">
            {results.map((r, i) => (
              <button
                key={r.id}
                type="button"
                onClick={() => openResult(r)}
                onMouseEnter={() => setActiveIndex(i)}
                className={`flex w-full items-center gap-4 rounded-lg px-3 py-3 text-left transition-colors duration-fast ease-out ${
                  i === activeIndex ? 'bg-black/[0.045]' : ''
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-3">
                    <span className="truncate text-[15px] font-semibold text-ink">
                      {r.name}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] tracking-wide text-ink-faint">
                      {TYPE_LABEL[r.type] ?? r.type}
                    </span>
                  </div>
                  {r.matched_alias && (
                    <p className="mt-0.5 truncate text-[12px] text-ink-faint">
                      matched: "{r.matched_alias}"
                    </p>
                  )}
                </div>
                <span className="shrink-0 font-mono text-[13px] text-ink-soft">
                  {r.connections}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
