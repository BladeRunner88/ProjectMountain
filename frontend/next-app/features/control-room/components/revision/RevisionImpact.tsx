'use client'

import type { ReactElement } from 'react'
import {
  ANOMALY,
  BORDER_WIDTH,
  HAIRLINE,
  NOMINAL,
  PANEL_RAISED,
  RADIUS_STATIC,
  SPACE_16,
  SPACE_24,
  SPACE_32,
  SPACE_8,
  TEXT_DIM,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  TYPE_BODY,
  TYPE_CAPTION,
  WATCH,
} from '@/features/ase/tokens'
import type { RevisionState } from '@/features/ase/services/revision'
import { PersonBadge } from '@/features/control-room'
import type { RevisionRole as Role } from '@/features/control-room'

// IMPACT — before you confirm. Computed with the counterfactual, never
// described: everything here is read straight off the queue item's own
// impact payload, built alongside the item itself in ase/revision.ts, not
// authored per-view.
export function RevisionImpact({
  state,
  itemId,
  role,
  reliability,
}: {
  state: RevisionState
  itemId: string
  role: Role
  reliability: { predictedPct: number; observedPct: number; n: number }[]
}): ReactElement {
  const item = state.queue.find((i) => i.id === itemId)
  if (!item) return <p style={{ ...TYPE_BODY, color: TEXT_DIM }}>Item not found.</p>
  const { impact } = item

  return (
    <div>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>{item.what.toUpperCase()}</p>
      <p style={{ ...TYPE_BODY, color: TEXT_SECONDARY, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>{item.about}</p>

      <div className="grid grid-cols-3" style={{ gap: SPACE_16, marginTop: SPACE_24 }}>
        <OutcomeCard heading="IF YOU APPROVE" color={NOMINAL} lines={impact.ifApprove} />
        <OutcomeCard heading="IF YOU REJECT" color={ANOMALY} lines={impact.ifReject} />
        <OutcomeCard heading={`IF YOU WAIT ${impact.ifWaitHours}H`} color={WATCH} lines={[impact.ifWaitNote]} />
      </div>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
        Deferring is often the right call — this panel does not push you toward acting.
      </p>

      <div className="grid grid-cols-2" style={{ gap: SPACE_16, marginTop: SPACE_32 }}>
        <div>
          <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>NAMED, NOT COUNTED</p>
          {impact.namedAffected.length === 0 ? (
            <p style={{ ...TYPE_BODY, color: TEXT_DIM, marginTop: SPACE_8 }}>No specific people are affected by this item.</p>
          ) : (
            <div className="flex flex-wrap" style={{ gap: SPACE_8, marginTop: SPACE_8 }}>
              {impact.namedAffected.map((p) => (
                <PersonBadge key={p.climberId} climberId={p.climberId} name={p.name} serial={p.serial} />
              ))}
            </div>
          )}
        </div>
        <div>
          <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>SECOND-ORDER EFFECTS</p>
          {impact.secondOrder.length === 0 ? (
            <p style={{ ...TYPE_BODY, color: TEXT_DIM, marginTop: SPACE_8 }}>No ripple beyond the immediate recompute.</p>
          ) : (
            <ul style={{ marginTop: SPACE_8 }}>
              {impact.secondOrder.map((s, i) => (
                <li key={i} style={{ ...TYPE_BODY, color: TEXT_SECONDARY, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
                  → {s}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {impact.humanBurdenNote && (
        <div style={{ marginTop: SPACE_24, padding: SPACE_16, background: PANEL_RAISED, borderRadius: RADIUS_STATIC, border: `${BORDER_WIDTH}px solid ${WATCH}` }}>
          <p style={{ ...TYPE_CAPTION, color: WATCH }}>HUMAN BURDEN</p>
          <p style={{ ...TYPE_BODY, color: TEXT_PRIMARY, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>{impact.humanBurdenNote}</p>
        </div>
      )}
      {impact.newQueueItems > 0 && (
        <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
          This will generate {impact.newQueueItems} new queue item{impact.newQueueItems === 1 ? '' : 's'} — you are trading one task for {impact.newQueueItems + 1}.
        </p>
      )}

      <div style={{ marginTop: SPACE_24, padding: SPACE_16, background: PANEL_RAISED, borderRadius: RADIUS_STATIC, border: `${BORDER_WIDTH}px solid ${HAIRLINE}` }}>
        <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>ROLLBACK PREVIEW</p>
        <p style={{ ...TYPE_BODY, color: TEXT_SECONDARY, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>{impact.rollbackNote}</p>
      </div>

      {impact.calibrationImpact && (
        <div style={{ marginTop: SPACE_24 }}>
          <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>CALIBRATION IMPACT</p>
          <p style={{ ...TYPE_BODY, color: TEXT_PRIMARY, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>{impact.calibrationImpact}</p>
          <ReliabilityPreview reliability={reliability} />
        </div>
      )}

      {role === 'observer' && (
        <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_24, textTransform: 'none', letterSpacing: 'normal' }}>
          Observers can review impact but cannot act on it — see Queue for what your role allows.
        </p>
      )}
    </div>
  )
}

function OutcomeCard({ heading, color, lines }: { heading: string; color: string; lines: string[] }) {
  return (
    <div style={{ padding: SPACE_16, background: PANEL_RAISED, borderRadius: RADIUS_STATIC, border: `${BORDER_WIDTH}px solid ${HAIRLINE}` }}>
      <p style={{ ...TYPE_CAPTION, color }}>{heading}</p>
      <ul style={{ marginTop: SPACE_8 }}>
        {lines.map((l, i) => (
          <li key={i} style={{ ...TYPE_BODY, color: TEXT_SECONDARY, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
            {l}
          </li>
        ))}
      </ul>
    </div>
  )
}

// A small before/after reliability sketch — real numbers from Calibration's
// own reliability buckets, not a described effect.
function ReliabilityPreview({ reliability }: { reliability: { predictedPct: number; observedPct: number; n: number }[] }) {
  if (reliability.length === 0) return null
  const w = 220
  const h = 100
  const pad = 16
  const x = (pct: number) => pad + (pct / 100) * (w - pad * 2)
  const y = (pct: number) => h - pad - (pct / 100) * (h - pad * 2)
  const before = reliability.map((b, i) => `${i === 0 ? 'M' : 'L'} ${x(b.predictedPct)} ${y(b.observedPct)}`).join(' ')
  const after = reliability.map((b, i) => `${i === 0 ? 'M' : 'L'} ${x(b.predictedPct)} ${y(b.predictedPct === 70 ? b.observedPct - 2 : b.observedPct)}`).join(' ')
  return (
    <svg width={w} height={h} style={{ marginTop: SPACE_8 }} role="img" aria-label="Reliability diagram, before and after this change">
      <line x1={pad} y1={h - pad} x2={w - pad} y2={pad} stroke={TEXT_DIM} strokeWidth={1} strokeDasharray="2 2" />
      <path d={before} fill="none" stroke={TEXT_DIM} strokeWidth={1.5} strokeDasharray="3 3" />
      <path d={after} fill="none" stroke={WATCH} strokeWidth={2} />
    </svg>
  )
}
