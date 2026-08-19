"use client"

import { CloseIcon } from "@/components/ui/icons"
import { ErrorState } from "@/components/ui/error-state"
import { LoadingState } from "@/components/ui/loading-state"
import { cn } from "@/lib/cn"

import { useObjectQuery } from "../hooks/useObjectQuery"
import { pickHeading, typeLabel } from "../services/display"
import { describeGraphError } from "../services/objects"

type SidePanelProps = {
  objectId: string
  onClose: () => void
  onNavigate: (id: string) => void
}

export function SidePanel({ objectId, onClose, onNavigate }: SidePanelProps) {
  const { data: detail, isPending, isError, error, refetch } = useObjectQuery(
    objectId
  )

  if (isPending) {
    return (
      <aside className="flex h-full w-[360px] shrink-0 flex-col border-l border-hairline bg-app dark:border-border dark:bg-background">
        <LoadingState label="Loading object" />
      </aside>
    )
  }

  if (isError || !detail) {
    return (
      <aside className="flex h-full w-[360px] shrink-0 flex-col border-l border-hairline bg-app dark:border-border dark:bg-background">
        <div className="flex justify-end px-4 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="text-ink-faint transition-colors duration-fast ease-out hover:text-ink dark:text-muted-foreground dark:hover:text-foreground"
            aria-label="Close"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
        <ErrorState
          message={describeGraphError(
            error,
            "This object could not be loaded."
          )}
          onRetry={() => {
            void refetch()
          }}
        />
      </aside>
    )
  }

  const { heading, rest } = pickHeading(detail.properties, detail.id)

  return (
    <aside className="flex h-full w-[360px] shrink-0 flex-col overflow-y-auto border-l border-hairline bg-app dark:border-border dark:bg-background">
      <div className="flex items-start justify-between px-6 pt-6">
        <div>
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink-faint dark:text-muted-foreground">
            {typeLabel(detail.type)}
          </p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-ink dark:text-foreground">
            {heading}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-0.5 text-ink-faint transition-colors duration-fast ease-out hover:text-ink dark:text-muted-foreground dark:hover:text-foreground"
          aria-label="Close"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>

      {Object.keys(rest).length > 0 && (
        <div className="mt-8 px-6">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink-faint dark:text-muted-foreground">
            Properties
          </p>
          <dl className="mt-3 flex flex-col gap-2.5">
            {Object.entries(rest).map(([key, value]) => (
              <div key={key} className="flex items-baseline justify-between gap-4">
                <dt className="text-[13px] text-ink-soft dark:text-muted-foreground">
                  {key}
                </dt>
                <dd className="text-right text-[13px] font-medium text-ink dark:text-foreground">
                  {value == null ? "—" : String(value)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      <div className="mt-8 px-6">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink-faint dark:text-muted-foreground">
          Connections ({detail.connections.length})
        </p>
        {detail.connections.length === 0 ? (
          <p className="mt-3 text-[13px] text-ink-faint dark:text-muted-foreground">
            No linked objects.
          </p>
        ) : (
          <div className="mt-3 flex flex-col">
            {detail.connections.map((connection, index) => (
              <button
                key={`${connection.direction}-${connection.rel_type}-${connection.id}-${index}`}
                type="button"
                onClick={() => onNavigate(connection.id)}
                className={cn(
                  "flex items-center justify-between gap-3 py-2.5 text-left transition-colors duration-fast ease-out hover:text-accent",
                  index === 0 ? "" : "border-t border-hairline dark:border-border"
                )}
              >
                <span className="min-w-0 flex-1 truncate text-[13px] text-ink dark:text-foreground">
                  {connection.name}
                </span>
                <span className="shrink-0 font-mono text-[11px] text-ink-faint dark:text-muted-foreground">
                  {connection.direction === "out"
                    ? connection.rel_type
                    : `← ${connection.rel_type}`}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {detail.resolved_from.length > 1 && (
        <div className="mt-8 px-6 pb-8">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink-faint dark:text-muted-foreground">
            Resolved from ({detail.resolved_from.length})
          </p>
          <div className="mt-3 flex flex-col gap-1.5">
            {detail.resolved_from.map((record) => (
              <div
                key={`${record.source_table}-${record.source_id}`}
                className="flex items-baseline justify-between gap-4"
              >
                <span className="text-[13px] text-ink-soft dark:text-muted-foreground">
                  {record.raw_name}
                </span>
                <span className="shrink-0 font-mono text-[11px] text-ink-faint dark:text-muted-foreground">
                  {record.source_table}#{record.source_id}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </aside>
  )
}
