"use client"

import { useRouter } from "next/navigation"
import { useEffect, useRef, useState, type KeyboardEvent } from "react"

import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { SearchIcon } from "@/components/ui/icons"
import { LoadingState } from "@/components/ui/loading-state"
import { cn } from "@/lib/cn"

import { useDebouncedValue } from "../hooks/useDebouncedValue"
import { useSearchQuery } from "../hooks/useSearchQuery"
import { describeSearchError } from "../services/search"
import type { SearchResult } from "../types/search"

function typeLabel(type: string): string {
  return type.replace(/([a-z])([A-Z])/g, "$1 $2").toUpperCase()
}

export function SearchView() {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const debouncedQuery = useDebouncedValue(query, 300)
  const trimmed = query.trim()
  const isDebouncing = trimmed !== debouncedQuery.trim()

  const { data, isFetching, isError, error, refetch } =
    useSearchQuery(debouncedQuery)

  const results: SearchResult[] = trimmed === "" ? [] : (data ?? [])
  const highlightIndex =
    results.length === 0 ? 0 : Math.min(activeIndex, results.length - 1)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const openResult = (result: SearchResult): void => {
    router.push(`/app/graph?focus=${encodeURIComponent(result.id)}`)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (results.length === 0) return
    if (event.key === "ArrowDown") {
      event.preventDefault()
      setActiveIndex((index) => Math.min(index + 1, results.length - 1))
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      setActiveIndex((index) => Math.max(index - 1, 0))
    } else if (event.key === "Enter") {
      event.preventDefault()
      const selected = results[highlightIndex]
      if (selected) openResult(selected)
    }
  }

  const showLoading =
    trimmed !== "" && (isDebouncing || isFetching) && results.length === 0

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-app dark:bg-background">
      <div className="mx-auto w-full max-w-2xl px-6 pt-20">
        <div className="border-b border-hairline pb-4 dark:border-border">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setActiveIndex(0)
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search entities, documents, relationships…"
            className="w-full bg-transparent text-2xl font-medium tracking-tight text-ink placeholder:text-ink-faint focus:outline-none dark:text-foreground dark:placeholder:text-muted-foreground"
            autoComplete="off"
            spellCheck={false}
            aria-label="Search"
          />
        </div>

        {trimmed === "" ? (
          <div className="pt-20">
            <EmptyState
              icon={SearchIcon}
              title="Search your data"
              subtitle="Find entities, documents, and relationships across every source."
            />
          </div>
        ) : isError ? (
          <div className="pt-10">
            <ErrorState
              message={describeSearchError(
                error,
                "Search could not be completed."
              )}
              onRetry={() => {
                void refetch()
              }}
            />
          </div>
        ) : showLoading ? (
          <div className="pt-10">
            <LoadingState label="Searching" />
          </div>
        ) : results.length === 0 ? (
          <div className="pt-10">
            <EmptyState
              icon={SearchIcon}
              title={`No results for “${query}”`}
              subtitle="Try a different name, alias, or property value."
            />
          </div>
        ) : (
          <div className="py-4">
            {results.map((result, index) => (
              <button
                key={result.id}
                type="button"
                onClick={() => openResult(result)}
                onMouseEnter={() => setActiveIndex(index)}
                className={cn(
                  "flex w-full items-center gap-4 rounded-lg px-3 py-3 text-left transition-colors duration-fast ease-out",
                  index === highlightIndex
                    ? "bg-black/[0.045] dark:bg-white/[0.06]"
                    : ""
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-3">
                    <span className="truncate text-[15px] font-semibold text-ink dark:text-foreground">
                      {result.name}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] tracking-wide text-ink-faint dark:text-muted-foreground">
                      {typeLabel(result.type)}
                    </span>
                  </div>
                  {result.matched_alias ? (
                    <p className="mt-0.5 truncate text-[12px] text-ink-faint dark:text-muted-foreground">
                      matched: &quot;{result.matched_alias}&quot;
                    </p>
                  ) : null}
                </div>
                <span className="shrink-0 font-mono text-[13px] text-ink-soft dark:text-muted-foreground">
                  {result.connections}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
