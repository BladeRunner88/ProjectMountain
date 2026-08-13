'use client'

import { useMemo, useState, type ReactElement } from 'react'
import {
  ANOMALY,
  BORDER_WIDTH,
  HAIRLINE,
  NOMINAL,
  PANEL_RAISED,
  RADIUS_INTERACTIVE,
  RADIUS_STATIC,
  SPACE_16,
  SPACE_8,
  TEXT_DIM,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  TYPE_BODY,
  TYPE_CAPTION,
  TYPE_DISPLAY,
  WATCH,
} from '@/features/ase/tokens'
import { useDataset, useSelection } from '@/features/ase/client'
import {
  ageColor,
  OVERRULE_REASON_LABEL,
  type OverruleReason,
  type OwnerState,
  type Priority,
  type QueueItem,
  type QueueSourceTab,
  type RevisionState,
} from '@/features/ase/services/revision'
import { RecommendationCard, type Recommendation } from '@/features/control-room'
import { canDo, disabledReason, type RevisionRole as Role } from '@/features/control-room'
import { focusRingStyle, useFocusRing } from '@/features/control-room'

const PRIORITY_COLOR: Record<Priority, string> = { critical: ANOMALY, standard: WATCH, backlog: TEXT_DIM }
const AGE_COLOR = { green: NOMINAL, amber: WATCH, red: ANOMALY }
const FROM_LABEL: Record<QueueSourceTab, string> = { model: 'Model', identity: 'Identity', meaning: 'Meaning', detection: 'Detection', prediction: 'Prediction', exposure: 'Exposure', trust: 'Trust' }
const TEMPLATES = ['Sensor drift, apply offset', 'False positive, add to ignore list', 'Merge confirmed, same person']

function ageHours(raisedAt: string): number {
  return (Date.now() - new Date(raisedAt).getTime()) / 3600000
}
function formatAge(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}m`
  return `${Math.round(hours)}h`
}

interface LocalOverride {
  owner: OwnerState
  resolutionStage: QueueItem['resolutionStage']
  overruleReason: OverruleReason | null
  overruleNote: string
}

// QUEUE — the entry point. Every row leads with what ASE recommends; a
// queue item is an actionable decision with two or more options and a
// consequence, never a status dump.
export function RevisionQueue({ state, role, onSelectItem }: { state: RevisionState; role: Role; onSelectItem: (itemId: string) => void }): ReactElement {
  const { changeConflictPolicy, appendAuditRecordEntry, logRevision } = useDataset()
  const { select } = useSelection()
  const [overrides, setOverrides] = useState<Record<string, LocalOverride>>({})
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [expandedWhy, setExpandedWhy] = useState<string | null>(null)
  const [batchReason, setBatchReason] = useState('')

  function overrideFor(item: QueueItem): LocalOverride {
    return overrides[item.id] ?? { owner: item.owner, resolutionStage: item.resolutionStage, overruleReason: null, overruleNote: '' }
  }
  function setOverride(id: string, patch: Partial<LocalOverride>) {
    setOverrides((prev) => ({ ...prev, [id]: { ...(prev[id] ?? { owner: { kind: 'unassigned' }, resolutionStage: 'open', overruleReason: null, overruleNote: '' }), ...patch } }))
  }

  function runAction(item: QueueItem, action: 'approve' | 'reject' | 'correct' | 'annotate' | 'defer', reason: string) {
    if (item.kind === 'conflict' || item.kind === 'model-conflict') {
      if (action === 'approve' && item.conflict) {
        const candidate = item.conflict.availablePolicies.find((p) => p.strategy !== 'human-required')
        if (candidate) changeConflictPolicy(item.conflict, candidate)
      }
    } else {
      logRevision(`${item.about}: ${action}${reason ? ` — ${reason}` : ''}`)
    }
    appendAuditRecordEntry({
      who: 'You',
      actionKind: action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : action === 'correct' ? 'corrected' : action === 'annotate' ? 'annotated' : 'deferred',
      actionLabel: `${action} — ${item.what}`,
      aboutClimberId: item.aboutClimberIds[0] ?? null,
      aboutSerial: null,
      aboutLabel: item.about,
      whatChanged: reason || item.recommendation.action,
      witness: null,
      witnessPending: item.requiresWitness,
      attachments: [],
      correctionOfId: null,
      overruleReason: overrideFor(item).overruleReason,
      fromTab: item.fromTab,
    })
    setOverride(item.id, { resolutionStage: action === 'approve' ? 'resolved-correct' : action === 'reject' ? 'resolved-wrong' : item.resolutionStage })
  }

  const health = useMemo(() => {
    const open = state.queue.filter((i) => overrideFor(i).resolutionStage === 'open' || overrideFor(i).resolutionStage === 'under-review')
    const ages = state.queue.map((i) => ageHours(i.raisedAt))
    const avgAge = ages.length ? ages.reduce((a, b) => a + b, 0) / ages.length : 0
    return {
      open: open.length,
      avgAge: formatAge(avgAge),
      critical: state.queue.filter((i) => i.priority === 'critical').length,
      assignedToYou: state.queue.filter((i) => overrideFor(i).owner.kind === 'assigned').length,
      blocking: state.queue.filter((i) => i.blockedByIds.length > 0).length,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.queue, overrides])

  return (
    <div>
      <QueueHealthStrip health={health} />

      {selected.size > 0 && (
        <div className="flex items-center" style={{ gap: SPACE_16, marginTop: SPACE_16, padding: SPACE_16, background: PANEL_RAISED, borderRadius: RADIUS_STATIC, border: `${BORDER_WIDTH}px solid ${NOMINAL}` }}>
          <span style={{ ...TYPE_BODY, color: TEXT_PRIMARY }}>{selected.size} selected</span>
          <input
            type="text"
            value={batchReason}
            onChange={(e) => setBatchReason(e.target.value)}
            placeholder="Shared reason for all selected…"
            aria-label="Batch reason"
            style={{ ...TYPE_CAPTION, textTransform: 'none', letterSpacing: 'normal', flex: 1, background: 'transparent', border: `${BORDER_WIDTH}px solid ${HAIRLINE}`, borderRadius: RADIUS_INTERACTIVE, padding: SPACE_8, color: TEXT_PRIMARY }}
          />
          <ActionButton
            label="APPROVE SELECTED"
            color={NOMINAL}
            allowed={canDo(role, 'approve')}
            reason={disabledReason(role, 'approve')}
            onClick={() => {
              for (const id of selected) {
                const item = state.queue.find((i) => i.id === id)
                if (item) runAction(item, 'approve', batchReason)
              }
              setSelected(new Set())
              setBatchReason('')
            }}
          />
        </div>
      )}

      <div style={{ marginTop: SPACE_16 }}>
        <HeaderRow />
        {state.queue.length === 0 ? (
          <p style={{ ...TYPE_BODY, color: TEXT_DIM, marginTop: SPACE_16 }}>Nothing waiting on a human right now.</p>
        ) : (
          state.queue.map((item) => (
            <QueueRow
              key={item.id}
              item={item}
              override={overrideFor(item)}
              role={role}
              selected={selected.has(item.id)}
              onToggleSelect={() =>
                setSelected((prev) => {
                  const next = new Set(prev)
                  if (next.has(item.id)) next.delete(item.id)
                  else next.add(item.id)
                  return next
                })
              }
              expandedWhy={expandedWhy === item.id}
              onToggleWhy={() => setExpandedWhy((id) => (id === item.id ? null : item.id))}
              onSetOwner={(owner) => setOverride(item.id, { owner })}
              onSetOverruleReason={(overruleReason, overruleNote) => setOverride(item.id, { overruleReason, overruleNote })}
              onAction={(action, reason) => runAction(item, action, reason)}
              onOpenImpact={() => onSelectItem(item.id)}
              onOpenConflict={() => item.conflict && select({ kind: 'conflict', conflict: item.conflict })}
            />
          ))
        )}
      </div>
    </div>
  )
}

function QueueHealthStrip({ health }: { health: { open: number; avgAge: string; critical: number; assignedToYou: number; blocking: number } }) {
  return (
    <div className="grid grid-cols-5" style={{ gap: SPACE_16 }}>
      <HealthStat label="OPEN ITEMS" value={String(health.open)} />
      <HealthStat label="AVERAGE AGE" value={health.avgAge} />
      <HealthStat label="CRITICAL" value={String(health.critical)} color={health.critical > 0 ? ANOMALY : undefined} />
      <HealthStat label="ASSIGNED TO YOU" value={String(health.assignedToYou)} />
      <HealthStat label="BLOCKING OTHERS" value={String(health.blocking)} />
    </div>
  )
}

function HealthStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ padding: SPACE_16, background: PANEL_RAISED, borderRadius: RADIUS_STATIC, border: `${BORDER_WIDTH}px solid ${HAIRLINE}` }}>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>{label}</p>
      <p className="font-mono" style={{ ...TYPE_DISPLAY, color: color ?? TEXT_PRIMARY, marginTop: SPACE_8, fontSize: 22 }}>
        {value}
      </p>
    </div>
  )
}

const COLS = { select: 0.3, priority: 0.9, from: 1, what: 2, about: 1.6, owner: 1.4, age: 0.7, raised: 0.9 }

function HeaderRow() {
  return (
    <div className="flex items-center" style={{ borderBottom: `${BORDER_WIDTH}px solid ${HAIRLINE}`, padding: `${SPACE_8}px 0` }}>
      <span style={{ flex: COLS.select }} />
      <span style={{ ...TYPE_CAPTION, color: TEXT_DIM, flex: COLS.priority }}>PRIORITY</span>
      <span style={{ ...TYPE_CAPTION, color: TEXT_DIM, flex: COLS.from }}>FROM</span>
      <span style={{ ...TYPE_CAPTION, color: TEXT_DIM, flex: COLS.what }}>WHAT</span>
      <span style={{ ...TYPE_CAPTION, color: TEXT_DIM, flex: COLS.about }}>ABOUT</span>
      <span style={{ ...TYPE_CAPTION, color: TEXT_DIM, flex: COLS.owner }}>OWNER</span>
      <span style={{ ...TYPE_CAPTION, color: TEXT_DIM, flex: COLS.age }}>AGE</span>
      <span style={{ ...TYPE_CAPTION, color: TEXT_DIM, flex: COLS.raised }}>RAISED</span>
    </div>
  )
}

function QueueRow({
  item,
  override,
  role,
  selected,
  onToggleSelect,
  expandedWhy,
  onToggleWhy,
  onSetOwner,
  onSetOverruleReason,
  onAction,
  onOpenImpact,
  onOpenConflict,
}: {
  item: QueueItem
  override: LocalOverride
  role: Role
  selected: boolean
  onToggleSelect: () => void
  expandedWhy: boolean
  onToggleWhy: () => void
  onSetOwner: (owner: OwnerState) => void
  onSetOverruleReason: (reason: OverruleReason, note: string) => void
  onAction: (action: 'approve' | 'reject' | 'correct' | 'annotate' | 'defer', reason: string) => void
  onOpenImpact: () => void
  onOpenConflict: () => void
}) {
  const [reason, setReason] = useState('')
  const age = ageHours(item.raisedAt)
  const done = override.resolutionStage === 'resolved-correct' || override.resolutionStage === 'resolved-wrong' || override.resolutionStage === 'closed'

  const rec: Recommendation = {
    id: item.id,
    action: item.recommendation.action,
    why: item.recommendation.why,
    confidencePct: item.recommendation.confidencePct,
    ifYouDoNothing: item.recommendation.ifNothing,
    doneLabel: 'DONE — RECORDED',
    onRun: () => onAction('approve', reason),
  }

  return (
    <div style={{ borderBottom: `${BORDER_WIDTH}px solid ${HAIRLINE}`, paddingBottom: SPACE_16, marginBottom: SPACE_16, opacity: done ? 0.6 : 1 }}>
      <div className="flex items-center" style={{ padding: `${SPACE_8}px 0` }}>
        <span style={{ flex: COLS.select }}>
          <input type="checkbox" checked={selected} onChange={onToggleSelect} aria-label={`Select ${item.what}`} />
        </span>
        <span style={{ flex: COLS.priority }}>
          <span style={{ ...TYPE_CAPTION, color: PRIORITY_COLOR[item.priority], border: `${BORDER_WIDTH}px solid ${PRIORITY_COLOR[item.priority]}`, borderRadius: RADIUS_INTERACTIVE, padding: `1px ${SPACE_8}px` }}>
            {item.priority.toUpperCase()}
          </span>
        </span>
        <span style={{ ...TYPE_BODY, color: TEXT_SECONDARY, flex: COLS.from }}>{FROM_LABEL[item.fromTab]}</span>
        <button type="button" onClick={onOpenImpact} className="pressable" style={{ ...TYPE_BODY, color: TEXT_PRIMARY, flex: COLS.what, textAlign: 'left', textTransform: 'none', letterSpacing: 'normal' }}>
          {item.what}
        </button>
        {item.conflict ? (
          <button
            type="button"
            onClick={onOpenConflict}
            className="pressable"
            title="Open both values, both sources, and the policy that chose, in the inspector"
            style={{ ...TYPE_BODY, color: TEXT_SECONDARY, flex: COLS.about, textAlign: 'left', textTransform: 'none', letterSpacing: 'normal', textDecoration: 'underline' }}
          >
            {item.about}
          </button>
        ) : (
          <span style={{ ...TYPE_BODY, color: TEXT_SECONDARY, flex: COLS.about, textTransform: 'none', letterSpacing: 'normal' }}>{item.about}</span>
        )}
        <span style={{ flex: COLS.owner }}>
          <OwnerControl owner={override.owner} onChange={onSetOwner} />
        </span>
        <span className="font-mono" style={{ flex: COLS.age, color: AGE_COLOR[ageColor(age)] }}>
          {formatAge(age)}
        </span>
        <span className="font-mono" style={{ ...TYPE_CAPTION, color: TEXT_DIM, flex: COLS.raised }}>
          {formatAge(age)} ago
        </span>
      </div>

      {item.blockedByIds.length > 0 && (
        <p style={{ ...TYPE_CAPTION, color: WATCH, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }} title={item.blockedByIds.join(', ')}>
          {item.blockedByIds.length} item{item.blockedByIds.length === 1 ? '' : 's'} waiting on this
        </p>
      )}

      {item.patternWatchWindow && (
        <p style={{ ...TYPE_CAPTION, color: TEXT_SECONDARY, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
          {item.patternWatchWindow.patternName} was predicted within {item.patternWatchWindow.windowHours}h. The window closed at{' '}
          {new Date(item.patternWatchWindow.expiredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} with no observed markers.
        </p>
      )}

      <button type="button" onClick={onToggleWhy} className="pressable" style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_8, textDecoration: 'underline' }}>
        why am I seeing this?
      </button>
      {expandedWhy && (
        <p style={{ ...TYPE_CAPTION, color: TEXT_SECONDARY, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>{item.whyAmISeeingThis}</p>
      )}

      <div style={{ marginTop: SPACE_16 }}>
        <RecommendationCard rec={rec} />
      </div>

      {!done && (
        <div style={{ marginTop: SPACE_16 }}>
          {item.requiresWitness && (
            <div style={{ marginBottom: SPACE_8 }}>
              <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>OVERRULE REASON</p>
              <div className="flex flex-wrap items-center" style={{ gap: SPACE_8, marginTop: SPACE_8 }}>
                {(Object.keys(OVERRULE_REASON_LABEL) as OverruleReason[]).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => onSetOverruleReason(r, override.overruleNote)}
                    className="pressable"
                    style={{
                      ...TYPE_CAPTION,
                      textTransform: 'none',
                      letterSpacing: 'normal',
                      color: override.overruleReason === r ? TEXT_PRIMARY : TEXT_SECONDARY,
                      background: override.overruleReason === r ? HAIRLINE : 'transparent',
                      border: `${BORDER_WIDTH}px solid ${override.overruleReason === r ? TEXT_SECONDARY : HAIRLINE}`,
                      borderRadius: RADIUS_INTERACTIVE,
                      padding: `${SPACE_8}px ${SPACE_8}px`,
                    }}
                  >
                    {OVERRULE_REASON_LABEL[r]}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex flex-wrap items-center" style={{ gap: SPACE_8 }}>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Optional note…"
              aria-label="Action note"
              style={{ ...TYPE_CAPTION, textTransform: 'none', letterSpacing: 'normal', flex: 1, minWidth: 160, background: 'transparent', border: `${BORDER_WIDTH}px solid ${HAIRLINE}`, borderRadius: RADIUS_INTERACTIVE, padding: SPACE_8, color: TEXT_PRIMARY }}
            />
            {TEMPLATES.map((t) => (
              <button key={t} type="button" onClick={() => setReason(t)} className="pressable" style={{ ...TYPE_CAPTION, color: TEXT_DIM, border: `${BORDER_WIDTH}px solid ${HAIRLINE}`, borderRadius: RADIUS_INTERACTIVE, padding: `${SPACE_8}px` }}>
                {t}
              </button>
            ))}
          </div>
          <div className="flex items-center" style={{ gap: SPACE_8, marginTop: SPACE_8 }}>
            <ActionButton label="REJECT" color={ANOMALY} allowed={canDo(role, 'reject')} reason={disabledReason(role, 'reject')} onClick={() => onAction('reject', reason)} />
            <ActionButton label="CORRECT" color={WATCH} allowed={canDo(role, 'correct')} reason={disabledReason(role, 'correct')} onClick={() => onAction('correct', reason)} />
            <ActionButton label="ANNOTATE" color={TEXT_SECONDARY} allowed={canDo(role, 'annotate')} reason={disabledReason(role, 'annotate')} onClick={() => onAction('annotate', reason)} />
            <ActionButton label="DEFER" color={TEXT_SECONDARY} allowed={canDo(role, 'defer')} reason={disabledReason(role, 'defer')} onClick={() => onAction('defer', reason)} />
          </div>
        </div>
      )}
    </div>
  )
}

function OwnerControl({ owner, onChange }: { owner: OwnerState; onChange: (o: OwnerState) => void }) {
  const value = owner.kind === 'unassigned' ? '' : owner.kind === 'assigned' ? `assigned:${owner.name}` : `second:${owner.name}`
  return (
    <select
      value={value}
      onChange={(e) => {
        const v = e.target.value
        if (!v) onChange({ kind: 'unassigned' })
        else if (v.startsWith('assigned:')) onChange({ kind: 'assigned', name: v.slice(9) })
        else onChange({ kind: 'awaiting-second-opinion', name: v.slice(7) })
      }}
      aria-label="Owner"
      style={{ ...TYPE_CAPTION, textTransform: 'none', letterSpacing: 'normal', color: owner.kind === 'unassigned' ? TEXT_DIM : TEXT_PRIMARY, background: 'transparent', border: `${BORDER_WIDTH}px solid ${HAIRLINE}`, borderRadius: RADIUS_INTERACTIVE, padding: SPACE_8 }}
    >
      <option value="">Unassigned</option>
      <option value="assigned:S. Chen">Assigned — S. Chen</option>
      <option value="assigned:R. Gurung">Assigned — R. Gurung</option>
      <option value="second:S. Chen">Awaiting second opinion — S. Chen</option>
    </select>
  )
}

function ActionButton({ label, color, allowed, reason, onClick }: { label: string; color: string; allowed: boolean; reason: string; onClick: () => void }) {
  const { focused, handlers } = useFocusRing()
  return (
    <button
      type="button"
      disabled={!allowed}
      title={!allowed ? reason : undefined}
      onClick={onClick}
      {...handlers}
      className="pressable"
      style={{
        ...TYPE_CAPTION,
        textTransform: 'none',
        letterSpacing: 'normal',
        color: allowed ? color : TEXT_DIM,
        border: `${BORDER_WIDTH}px solid ${allowed ? color : HAIRLINE}`,
        borderRadius: RADIUS_INTERACTIVE,
        padding: `${SPACE_8}px ${SPACE_16}px`,
        cursor: allowed ? 'pointer' : 'not-allowed',
        ...focusRingStyle(focused),
      }}
    >
      {label}
    </button>
  )
}
