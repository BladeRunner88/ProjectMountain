import { useState } from 'react'
import {
  ANOMALY,
  BORDER_WIDTH,
  HAIRLINE,
  HUMAN,
  NOMINAL,
  PANEL_RAISED,
  RADIUS_INTERACTIVE,
  RADIUS_STATIC,
  SPACE_8,
  SPACE_16,
  SPACE_24,
  TEXT_DIM,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  TYPE_BODY,
  TYPE_CAPTION,
  WATCH,
} from '../../ase/tokens'
import { useDataset } from '../../ase/store'
import { instant } from '../../ase/traced'
import type { Decision, DecisionConfidence, DecisionStatus } from '../../ase/trust'
import { focusRingStyle, useFocusRing } from './focusRing'

const STATUS_COLOR: Record<DecisionStatus, string> = { proposed: TEXT_SECONDARY, 'under-review': WATCH, active: NOMINAL, superseded: TEXT_DIM, deprecated: ANOMALY }
const CONFIDENCE_LABEL: Record<DecisionConfidence, string> = { proven: 'Proven — benchmark', strong: 'Strong — pilot data', moderate: 'Moderate — expert consensus', tentative: 'Tentative — no data yet' }
const CONFIDENCE_COLOR: Record<DecisionConfidence, string> = { proven: NOMINAL, strong: NOMINAL, moderate: WATCH, tentative: ANOMALY }

// DECISIONS — the full record format per S9.13, lifecycle/governance up
// top, then all seven decisions. A challenge on an active decision writes a
// REAL item into Revision's queue (via the store's live extension), and a
// real, seal-chained audit entry — never a toast that forgets itself.
export function TrustDecisions() {
  const { dataset, addQueueItem, appendAuditRecordEntry } = useDataset()
  const [openId, setOpenId] = useState<number | null>(1)
  const decisions = dataset.trust.decisions
  const byId = new Map(decisions.map((d) => [d.id, d]))

  return (
    <div>
      <div style={{ padding: SPACE_16, background: PANEL_RAISED, borderRadius: RADIUS_STATIC, border: `${BORDER_WIDTH}px solid ${HAIRLINE}` }}>
        <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>LIFECYCLE AND GOVERNANCE</p>
        <p style={{ ...TYPE_BODY, color: TEXT_SECONDARY, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
          Anyone may propose a decision. It enters a 7-day review; a coordinator and one domain expert must approve. Each transition is recorded and
          sealed. Active decisions are reviewed annually — the due date is shown per decision. Any evaluator can challenge an active decision, which
          raises a Revision queue item; the challenge, the response and the outcome are all recorded.
        </p>
        <ExportButton />
      </div>

      <div style={{ marginTop: SPACE_24 }}>
        {decisions.map((d) => (
          <DecisionRow
            key={d.id}
            decision={d}
            supersededBy={d.supersededById ? (byId.get(d.supersededById) ?? null) : null}
            open={openId === d.id}
            onToggle={() => setOpenId((id) => (id === d.id ? null : d.id))}
            onChallenge={(reason) => {
              addQueueItem({
                id: `queue-trust-challenge-${d.id}`,
                kind: 'decision-challenged',
                priority: 'standard',
                fromTab: 'trust',
                what: 'a decision was challenged',
                about: d.title,
                aboutClimberIds: [],
                owner: { kind: 'unassigned' },
                raisedAt: instant(new Date().toISOString()),
                blastRadius: d.impact.length,
                blockedByIds: [],
                recommendation: {
                  action: 'Review the challenge against the decision\'s evidence and either reaffirm or open a new decision',
                  why: reason || 'An evaluator disputed this decision\'s reasoning or evidence.',
                  confidencePct: 50,
                  ifNothing: 'The decision stands unreviewed despite a live challenge — the record would understate how contested it actually is.',
                },
                whyAmISeeingThis: 'Any challenge to an active decision is surfaced here automatically — this is what "governed" means, not just documented.',
                resolutionStage: 'open',
                requiresWitness: false,
                impact: {
                  ifApprove: ['the decision is reaffirmed with the challenge and response recorded alongside it'],
                  ifReject: ['a new decision is opened to supersede this one'],
                  ifWaitHours: 168,
                  ifWaitNote: 'decisions are reviewed on a 7-day cycle, same as a proposal',
                  namedAffected: [],
                  secondOrder: d.impact,
                  humanBurdenNote: null,
                  newQueueItems: 0,
                  rollbackNote: 'challenging a decision never changes it by itself — only a recorded response can',
                  calibrationImpact: null,
                },
                patternWatchWindow: null,
                conflict: null,
              })
              appendAuditRecordEntry({
                who: 'You',
                actionKind: 'annotated',
                actionLabel: 'challenged a decision',
                aboutClimberId: null,
                aboutSerial: null,
                aboutLabel: d.title,
                whatChanged: reason || 'Challenged without an explicit reason.',
                witness: null,
                witnessPending: false,
                attachments: [],
                correctionOfId: null,
                overruleReason: null,
                fromTab: 'trust',
              })
            }}
          />
        ))}
      </div>
    </div>
  )
}

function DecisionRow({
  decision: d,
  supersededBy,
  open,
  onToggle,
  onChallenge,
}: {
  decision: Decision
  supersededBy: Decision | null
  open: boolean
  onToggle: () => void
  onChallenge: (reason: string) => void
}) {
  const [reason, setReason] = useState('')
  const [challenged, setChallenged] = useState(false)
  const { focused, handlers } = useFocusRing()

  return (
    <div style={{ marginBottom: SPACE_16, background: PANEL_RAISED, borderRadius: RADIUS_STATIC, border: `${BORDER_WIDTH}px solid ${d.status === 'superseded' ? WATCH : HAIRLINE}` }}>
      <button type="button" onClick={onToggle} {...handlers} className="pressable flex items-center justify-between" style={{ width: '100%', textAlign: 'left', padding: SPACE_16, ...focusRingStyle(focused) }}>
        <span className="flex items-center" style={{ gap: SPACE_8 }}>
          <span className="font-mono" style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>
            {d.id}
          </span>
          <span style={{ ...TYPE_BODY, color: TEXT_PRIMARY }}>{d.title}</span>
        </span>
        <span className="flex items-center" style={{ gap: SPACE_8 }}>
          <span style={{ ...TYPE_CAPTION, color: CONFIDENCE_COLOR[d.confidence] }}>{d.confidence.toUpperCase()}</span>
          <span style={{ ...TYPE_CAPTION, color: STATUS_COLOR[d.status], border: `${BORDER_WIDTH}px solid ${STATUS_COLOR[d.status]}`, borderRadius: RADIUS_INTERACTIVE, padding: `1px ${SPACE_8}px` }}>
            {d.status.replace('-', ' ').toUpperCase()}
          </span>
        </span>
      </button>

      {open && (
        <div style={{ padding: SPACE_16, borderTop: `${BORDER_WIDTH}px solid ${HAIRLINE}` }}>
          <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>
            {d.date} · {d.by}
          </p>

          <Field label="CONTEXT" text={d.context} />
          <Field label="WHAT WAS CHOSEN" text={d.whatWasChosen} />

          <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_16 }}>WHAT WAS REJECTED</p>
          {d.whatWasRejected.map((r, i) => (
            <p key={i} style={{ ...TYPE_BODY, color: TEXT_SECONDARY, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
              <span style={{ color: TEXT_PRIMARY }}>{r.option}</span> — {r.whyItLost}
            </p>
          ))}

          <Field label="TRADE-OFF" text={d.tradeOff} />
          <Field label="EVIDENCE" text={d.evidence} />

          <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_16 }}>IMPACT</p>
          <div className="flex flex-wrap" style={{ gap: SPACE_8, marginTop: SPACE_8 }}>
            {d.impact.map((imp, i) => (
              <span key={i} style={{ ...TYPE_CAPTION, color: TEXT_SECONDARY, border: `${BORDER_WIDTH}px solid ${HAIRLINE}`, borderRadius: RADIUS_INTERACTIVE, padding: `1px ${SPACE_8}px`, textTransform: 'none', letterSpacing: 'normal' }}>
                {imp}
              </span>
            ))}
          </div>

          {d.status === 'superseded' && d.supersededReason && (
            <div style={{ marginTop: SPACE_16, padding: SPACE_8, border: `${BORDER_WIDTH}px solid ${WATCH}`, borderRadius: RADIUS_STATIC }}>
              <p style={{ ...TYPE_CAPTION, color: WATCH }}>SUPERSEDED BY {supersededBy ? `${supersededBy.id} — ${supersededBy.title}` : d.supersededById}</p>
              <p style={{ ...TYPE_BODY, color: TEXT_SECONDARY, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>{d.supersededReason}</p>
            </div>
          )}

          <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_16 }}>CONFIDENCE</p>
          <p style={{ ...TYPE_BODY, color: TEXT_SECONDARY, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
            {CONFIDENCE_LABEL[d.confidence]} — {d.confidenceNote}
          </p>

          <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_16 }}>LINKING — IMPLEMENTATION</p>
          <p className="font-mono" style={{ ...TYPE_CAPTION, color: TEXT_SECONDARY, marginTop: SPACE_8 }}>
            {[...d.implementation.files, ...d.implementation.configs, ...d.implementation.modelVersions].join(' · ') || '—'}
          </p>

          {d.reviewDueDate && (
            <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_16 }}>REVIEW DUE {d.reviewDueDate}</p>
          )}

          {d.status === 'active' && (
            <div style={{ marginTop: SPACE_24, paddingTop: SPACE_16, borderTop: `${BORDER_WIDTH}px solid ${HAIRLINE}` }}>
              {challenged ? (
                <p style={{ ...TYPE_CAPTION, color: NOMINAL }}>✓ Challenge recorded — raised as a Revision queue item.</p>
              ) : (
                <>
                  <input
                    type="text"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Why are you challenging this decision?"
                    aria-label="Challenge reason"
                    style={{ ...TYPE_CAPTION, textTransform: 'none', letterSpacing: 'normal', width: '100%', background: 'transparent', border: `${BORDER_WIDTH}px solid ${HAIRLINE}`, borderRadius: RADIUS_INTERACTIVE, padding: SPACE_8, color: TEXT_PRIMARY }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      onChallenge(reason)
                      setChallenged(true)
                    }}
                    className="pressable"
                    style={{ ...TYPE_CAPTION, textTransform: 'none', letterSpacing: 'normal', color: HUMAN, border: `${BORDER_WIDTH}px solid ${HUMAN}`, borderRadius: RADIUS_INTERACTIVE, padding: `${SPACE_8}px ${SPACE_16}px`, marginTop: SPACE_8 }}
                  >
                    CHALLENGE THIS DECISION
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Field({ label, text }: { label: string; text: string }) {
  return (
    <>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_16 }}>{label}</p>
      <p style={{ ...TYPE_BODY, color: TEXT_SECONDARY, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>{text}</p>
    </>
  )
}

function ExportButton() {
  const { focused, handlers } = useFocusRing()
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      onClick={() => setDone(true)}
      {...handlers}
      className="pressable"
      style={{ ...TYPE_CAPTION, textTransform: 'none', letterSpacing: 'normal', color: done ? TEXT_DIM : NOMINAL, border: `${BORDER_WIDTH}px solid ${done ? HAIRLINE : NOMINAL}`, borderRadius: RADIUS_INTERACTIVE, padding: `${SPACE_8}px ${SPACE_16}px`, marginTop: SPACE_16, ...focusRingStyle(focused) }}
    >
      {done ? 'PREPARED — DECISIONS PDF (WITH EVIDENCE LINKS)' : 'EXPORT ALL DECISIONS AS PDF'}
    </button>
  )
}
