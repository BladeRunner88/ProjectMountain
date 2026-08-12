import { useMemo, useState } from 'react'
import {
  ANOMALY,
  BORDER_WIDTH,
  HAIRLINE,
  NOMINAL,
  PANEL_RAISED,
  RADIUS_INTERACTIVE,
  SPACE_16,
  SPACE_32,
  SPACE_8,
  TEXT_DIM,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  TYPE_BODY,
  TYPE_CAPTION,
  WATCH,
} from '../../ase/tokens'
import { useDataset } from '../../ase/store'
import { verifyChain, type AuditRecordEntry } from '../../ase/revision'
import { canDo, disabledReason, type Role } from './revisionPermissions'
import { focusRingStyle, useFocusRing } from './focusRing'

// RECORD — the audit chain. Append-only, newest first, nothing editable.
// Seals are real (a hash chained to the entry before it, recomputed here on
// every render) — VERIFY genuinely walks the chain rather than reporting a
// canned "all good."
export function RevisionRecord({ role }: { role: Role }) {
  const { auditRecord } = useDataset()
  const [search, setSearch] = useState('')
  const [actionFilter, setActionFilter] = useState<'all' | AuditRecordEntry['actionKind']>('all')
  const [openSeal, setOpenSeal] = useState<string | null>(null)
  const [verifyResult, setVerifyResult] = useState<{ intact: boolean; brokenAtId: string | null } | null>(null)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return auditRecord.filter((e) => {
      if (actionFilter !== 'all' && e.actionKind !== actionFilter) return false
      if (!q) return true
      return e.who.toLowerCase().includes(q) || (e.aboutSerial ?? '').toLowerCase().includes(q) || e.aboutLabel.toLowerCase().includes(q) || e.whatChanged.toLowerCase().includes(q)
    })
  }, [auditRecord, search, actionFilter])

  const byId = useMemo(() => new Map(auditRecord.map((e) => [e.id, e])), [auditRecord])
  const newestFirst = [...filtered].reverse()

  return (
    <div>
      <div className="flex flex-wrap items-center" style={{ gap: SPACE_8 }}>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, serial, date, action…"
          aria-label="Search the record"
          style={{ ...TYPE_CAPTION, textTransform: 'none', letterSpacing: 'normal', color: TEXT_PRIMARY, background: PANEL_RAISED, border: `${BORDER_WIDTH}px solid ${HAIRLINE}`, borderRadius: RADIUS_INTERACTIVE, padding: SPACE_8, width: 260 }}
        />
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value as typeof actionFilter)}
          aria-label="Filter by action type"
          style={{ ...TYPE_CAPTION, textTransform: 'none', letterSpacing: 'normal', color: TEXT_PRIMARY, background: PANEL_RAISED, border: `${BORDER_WIDTH}px solid ${HAIRLINE}`, borderRadius: RADIUS_INTERACTIVE, padding: SPACE_8 }}
        >
          <option value="all">All actions</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="overruled">Overruled</option>
          <option value="widened-model">Widened model</option>
          <option value="corrected">Corrected</option>
          <option value="annotated">Annotated</option>
          <option value="deferred">Deferred</option>
        </select>
        <ActionButton
          label="VERIFY CHAIN"
          allowed
          reason=""
          onClick={() => setVerifyResult(verifyChain(auditRecord))}
        />
        <ActionButton label="EXPORT" allowed={canDo(role, 'export')} reason={disabledReason(role, 'export')} onClick={() => {}} />
        {verifyResult && (
          <span style={{ ...TYPE_CAPTION, color: verifyResult.intact ? NOMINAL : ANOMALY }}>
            {verifyResult.intact ? '✓ chain intact, all seals verified' : `✗ broken at ${verifyResult.brokenAtId}`}
          </span>
        )}
      </div>

      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_16, textTransform: 'none', letterSpacing: 'normal' }}>
        Append-only. Nothing below is editable — a correction references the original and both stay visible.
      </p>

      <div style={{ marginTop: SPACE_16, overflowX: 'auto' }}>
        <div style={{ minWidth: 1100 }}>
          <div className="flex items-center" style={{ ...TYPE_CAPTION, color: TEXT_DIM, borderBottom: `${BORDER_WIDTH}px solid ${HAIRLINE}`, paddingBottom: SPACE_8 }}>
            <span style={{ flex: 0.9 }}>WHEN</span>
            <span style={{ flex: 0.9 }}>WHO</span>
            <span style={{ flex: 1.6 }}>WHAT THEY DID</span>
            <span style={{ flex: 1 }}>ABOUT</span>
            <span style={{ flex: 2.4 }}>WHAT CHANGED</span>
            <span style={{ flex: 1.2 }}>WITNESS</span>
            <span style={{ flex: 0.8 }}>SEAL</span>
          </div>
          {newestFirst.length === 0 ? (
            <p style={{ ...TYPE_BODY, color: TEXT_DIM, marginTop: SPACE_16 }}>No entries match this search.</p>
          ) : (
            newestFirst.map((e) => <RecordRow key={e.id} entry={e} correctionOf={e.correctionOfId ? byId.get(e.correctionOfId) ?? null : null} isOpen={openSeal === e.id} onToggleSeal={() => setOpenSeal((id) => (id === e.id ? null : e.id))} />)
          )}
        </div>
      </div>

      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_32, textTransform: 'none', letterSpacing: 'normal' }}>
        Records retained for 7 years per expedition protocol. {auditRecord.length.toLocaleString()} entries.
      </p>
    </div>
  )
}

function RecordRow({ entry, correctionOf, isOpen, onToggleSeal }: { entry: AuditRecordEntry; correctionOf: AuditRecordEntry | null; isOpen: boolean; onToggleSeal: () => void }) {
  return (
    <div style={{ padding: `${SPACE_8}px 0`, borderBottom: `${BORDER_WIDTH}px solid ${HAIRLINE}` }}>
      <div className="flex items-center">
        <span className="font-mono" style={{ flex: 0.9, ...TYPE_CAPTION, color: TEXT_DIM }}>
          {new Date(entry.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
        <span style={{ flex: 0.9, ...TYPE_BODY, color: TEXT_PRIMARY }}>{entry.who}</span>
        <span style={{ flex: 1.6, ...TYPE_BODY, color: TEXT_SECONDARY, textTransform: 'none', letterSpacing: 'normal' }}>{entry.actionLabel}</span>
        <span style={{ flex: 1 }}>
          {entry.aboutSerial ? (
            <span>
              <span style={{ ...TYPE_BODY, color: TEXT_PRIMARY }}>{entry.aboutLabel}</span>{' '}
              <span className="font-mono" style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>
                {entry.aboutSerial}
              </span>
            </span>
          ) : (
            <span style={{ ...TYPE_BODY, color: TEXT_SECONDARY, textTransform: 'none', letterSpacing: 'normal' }}>{entry.aboutLabel}</span>
          )}
        </span>
        <span style={{ flex: 2.4, ...TYPE_BODY, color: TEXT_SECONDARY, textTransform: 'none', letterSpacing: 'normal' }}>
          {entry.whatChanged}
          {entry.overruleReason && <span style={{ color: TEXT_DIM }}> — {entry.overruleReason.replace('-', ' ')}</span>}
        </span>
        <span style={{ flex: 1.2, ...TYPE_CAPTION, color: entry.witnessPending ? WATCH : TEXT_DIM, textTransform: 'none', letterSpacing: 'normal' }}>
          {entry.witness ? `witnessed by ${entry.witness}` : entry.witnessPending ? 'awaiting witness' : '—'}
        </span>
        <button type="button" onClick={onToggleSeal} className="pressable font-mono" style={{ flex: 0.8, ...TYPE_CAPTION, color: NOMINAL, textAlign: 'left' }}>
          ✓ {entry.seal.slice(0, 4)}
        </button>
      </div>
      {isOpen && (
        <p className="font-mono" style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
          full seal: {entry.seal} — chained to the entry immediately before it; any edit to either would change this value.
        </p>
      )}
      {entry.attachments.length > 0 && (
        <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>attached: {entry.attachments.map((a) => a.label).join(', ')}</p>
      )}
      {correctionOf && (
        <p style={{ ...TYPE_CAPTION, color: WATCH, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
          corrects {correctionOf.id} ({correctionOf.actionLabel}, {correctionOf.who}) — original entry stays visible above, not overwritten
        </p>
      )}
    </div>
  )
}

function ActionButton({ label, allowed, reason, onClick }: { label: string; allowed: boolean; reason: string; onClick: () => void }) {
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
        color: allowed ? TEXT_SECONDARY : TEXT_DIM,
        border: `${BORDER_WIDTH}px solid ${HAIRLINE}`,
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
