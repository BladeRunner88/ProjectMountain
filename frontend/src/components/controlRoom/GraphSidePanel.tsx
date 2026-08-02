import type { ConnectionRef } from '../../mock'
import type { Entity, Flag } from '../../mock'
import { nameOf } from '../../mock'
import { CloseIcon } from '../icons'

const RELATION_LABEL: Record<string, string> = {
  parent_of: 'Parent of',
  holds: 'Holds account',
  transacted: 'Transaction',
  processed_by: 'Processed by',
  reverses: 'Reverses',
}

function kindLabel(entity: Entity): string {
  if (entity.kind === 'organization') return entity.type === 'holding' ? 'Holding organization' : 'Subsidiary organization'
  if (entity.kind === 'account') return 'Account'
  if (entity.kind === 'provider') return `Provider — ${entity.category}`
  return 'Transaction'
}

function sourceSystemsOf(entity: Entity): string[] {
  if (entity.kind === 'organization' || entity.kind === 'account' || entity.kind === 'provider') return entity.sourceSystems
  return [entity.sourceSystem]
}

function connectionVerb(ref: ConnectionRef): string {
  if (ref.direction === 'out') return RELATION_LABEL[ref.relType] ?? ref.relType
  const reverseLabel: Record<string, string> = {
    parent_of: 'Subsidiary of',
    holds: 'Held by',
    transacted: 'Belongs to account',
    processed_by: 'Processes',
    reverses: 'Reversed by',
  }
  return reverseLabel[ref.relType] ?? ref.relType
}

export function GraphSidePanel({
  entity,
  connections,
  flag,
  onNavigate,
  onClose,
  onOpenReconciliation,
}: {
  entity: Entity
  connections: ConnectionRef[]
  flag: Flag | undefined
  onNavigate: (id: string) => void
  onClose: () => void
  onOpenReconciliation: (metricKey: string, entityId: string) => void
}) {
  return (
    <aside className="flex h-full w-[360px] shrink-0 flex-col overflow-y-auto border-l border-hairline-on-canvas bg-canvas">
      <div className="flex items-center justify-between border-b border-hairline-on-canvas px-6 py-4">
        <p className="text-[12px] uppercase tracking-[0.08em] text-ink-on-canvas-soft">{kindLabel(entity)}</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close panel"
          className="flex h-7 w-7 items-center justify-center text-ink-on-canvas-soft transition-colors duration-fast ease-out hover:text-ink-on-canvas"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-col gap-6 px-6 py-6">
        <div>
          <h2 className="text-[20px] font-semibold leading-tight text-ink-on-canvas">{nameOf(entity)}</h2>
          <p className="mt-1.5 font-mono text-[12px] text-ink-on-canvas-soft">{entity.id}</p>
        </div>

        {entity.kind === 'transaction' && (
          <div className="grid grid-cols-2 gap-4 border-t border-hairline-on-canvas pt-5">
            <div>
              <p className="text-[11px] uppercase tracking-[0.06em] text-ink-on-canvas-soft">Amount</p>
              <p className="mt-1 font-mono text-[17px] text-ink-on-canvas">
                {entity.currency} {entity.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.06em] text-ink-on-canvas-soft">Status</p>
              <p className="mt-1 text-[14px] text-ink-on-canvas">{entity.status}</p>
            </div>
            <div className="col-span-2">
              <p className="text-[11px] uppercase tracking-[0.06em] text-ink-on-canvas-soft">Timestamp (UTC)</p>
              <p className="mt-1 font-mono text-[13px] text-ink-on-canvas">{entity.timestampUtc}</p>
            </div>
          </div>
        )}

        <div className="border-t border-hairline-on-canvas pt-5">
          <p className="text-[11px] uppercase tracking-[0.06em] text-ink-on-canvas-soft">Source systems</p>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
            {sourceSystemsOf(entity).map((s) => (
              <span key={s} className="font-mono text-[13px] text-ink-on-canvas">
                {s}
              </span>
            ))}
          </div>
        </div>

        <div className="border-t border-hairline-on-canvas pt-5">
          <p className="text-[11px] uppercase tracking-[0.06em] text-ink-on-canvas-soft">Reconciliation status</p>
          {flag ? (
            <div className="mt-2 flex flex-col gap-3">
              <p className="text-[14px] leading-[1.6] text-ink-on-canvas">{flag.reason}</p>
              <div className="flex flex-wrap items-center gap-2 text-[12px] text-ink-on-canvas-soft">
                <span>Sources involved:</span>
                {flag.sources.map((s) => (
                  <span key={s} className="font-mono text-ink-on-canvas">
                    {s}
                  </span>
                ))}
              </div>
              {flag.metricKey && (
                <button
                  type="button"
                  onClick={() => onOpenReconciliation(flag.metricKey!, entity.id)}
                  className="mt-1 w-fit border border-app px-4 py-2 text-[13px] font-medium text-ink-on-canvas transition-colors duration-fast ease-out hover:bg-app hover:text-ink"
                >
                  Open reconciliation
                </button>
              )}
            </div>
          ) : (
            <p className="mt-2 text-[14px] text-ink-on-canvas">Reconciled — no discrepancy found.</p>
          )}
        </div>

        {connections.length > 0 && (
          <div className="border-t border-hairline-on-canvas pt-5">
            <p className="text-[11px] uppercase tracking-[0.06em] text-ink-on-canvas-soft">
              Connected entities ({connections.length})
            </p>
            <div className="mt-2 flex flex-col">
              {connections.map((c) => (
                <button
                  key={`${c.relType}-${c.direction}-${c.entity.id}`}
                  type="button"
                  onClick={() => onNavigate(c.entity.id)}
                  className="group flex items-center justify-between gap-3 border-t border-hairline-on-canvas py-2.5 text-left first:border-t-0"
                >
                  <span className="min-w-0 flex-1 truncate text-[13px] text-ink-on-canvas transition-colors duration-fast ease-out group-hover:text-accent">
                    {nameOf(c.entity)}
                  </span>
                  <span className="shrink-0 text-[11px] text-ink-on-canvas-soft">{connectionVerb(c)}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}
