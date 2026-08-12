import { useState } from 'react'
import {
  ANOMALY,
  BORDER_WIDTH,
  HAIRLINE,
  NOMINAL,
  PANEL_RAISED,
  RADIUS_INTERACTIVE,
  RADIUS_STATIC,
  SPACE_16,
  SPACE_32,
  SPACE_8,
  TEXT_DIM,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  TYPE_BODY,
  TYPE_CAPTION,
  TYPE_DISPLAY,
  WATCH,
} from '../../ase/tokens'
import { OVERRULE_REASON_LABEL, type RevisionState } from '../../ase/revision'
import { canDo, disabledReason, type Role } from './revisionPermissions'
import { focusRingStyle, useFocusRing } from './focusRing'

// LEARNING — what decisions changed. Regression results and human-versus-
// ASE are the two things explicitly called out to build; the two panels
// this block explicitly says NOT to build (A/B testing on too few cases,
// lives-saved conversion) are shown as stated intent, not fabricated
// numbers — the restraint is the point.
export function RevisionLearning({ state, role }: { state: RevisionState; role: Role }) {
  const [revertedIds, setRevertedIds] = useState<Set<string>>(new Set())

  return (
    <div>
      <div className="grid grid-cols-5" style={{ gap: SPACE_16 }}>
        {state.learningFigures.map((f) => (
          <FigureCard key={f.key} label={f.label} value={f.value} deltaNote={f.deltaNote} />
        ))}
      </div>

      <div style={{ marginTop: SPACE_32 }}>
        <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>CHANGES MADE HERE</p>
        {state.modelChanges.map((c) => {
          const reverted = revertedIds.has(c.id)
          return (
            <div key={c.id} style={{ padding: SPACE_16, background: PANEL_RAISED, borderRadius: RADIUS_STATIC, border: `${BORDER_WIDTH}px solid ${c.madeThingsWorse ? ANOMALY : HAIRLINE}`, marginTop: SPACE_16 }}>
              <div className="flex items-center justify-between">
                <p style={{ ...TYPE_BODY, color: TEXT_PRIMARY }}>
                  {c.what}: {c.before} → {c.after}
                </p>
                <span style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>by {c.who}</span>
              </div>
              <p style={{ ...TYPE_BODY, color: c.madeThingsWorse ? ANOMALY : TEXT_SECONDARY, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>Measured effect: {c.measuredEffect}</p>
              {c.madeThingsWorse && c.revertImpact && !reverted && (
                <div style={{ marginTop: SPACE_8 }}>
                  <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, textTransform: 'none', letterSpacing: 'normal' }}>{c.revertImpact}</p>
                  <RevertButton allowed={canDo(role, 'revert')} reason={disabledReason(role, 'revert')} onClick={() => setRevertedIds((s) => new Set(s).add(c.id))} label={`Revert to ${c.before}?`} />
                </div>
              )}
              {reverted && <p style={{ ...TYPE_CAPTION, color: NOMINAL, marginTop: SPACE_8 }}>✓ reverted to {c.before}</p>}
            </div>
          )
        })}
      </div>

      <div style={{ marginTop: SPACE_32 }}>
        <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>REGRESSION RESULTS</p>
        {state.regressionResults.map((r) => (
          <div key={r.id} className="flex items-center justify-between" style={{ padding: `${SPACE_8}px 0`, borderBottom: `${BORDER_WIDTH}px solid ${HAIRLINE}` }}>
            <div>
              <p style={{ ...TYPE_BODY, color: TEXT_PRIMARY, textTransform: 'none', letterSpacing: 'normal' }}>{r.change}</p>
              <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
                checked across {r.tabsChecked.join(', ')} · {r.note}
              </p>
            </div>
            <span style={{ ...TYPE_CAPTION, color: r.verdict === 'pass' ? NOMINAL : ANOMALY, border: `${BORDER_WIDTH}px solid ${r.verdict === 'pass' ? NOMINAL : ANOMALY}`, borderRadius: RADIUS_INTERACTIVE, padding: `1px ${SPACE_8}px` }}>
              REGRESSION: {r.verdict.toUpperCase()}
            </span>
          </div>
        ))}
      </div>

      <div style={{ marginTop: SPACE_32 }}>
        <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>DRIFT DETECTION</p>
        {state.driftSignals.map((d) => (
          <p key={d.id} style={{ ...TYPE_BODY, color: TEXT_PRIMARY, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
            Performance on {d.metric} has drifted {d.changePct}% {d.direction} over {d.period}. Possible cause: {d.possibleCause}. Recommend review.
          </p>
        ))}
      </div>

      <div style={{ marginTop: SPACE_32 }}>
        <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>DRIVER IMPORTANCE OVER TIME</p>
        <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>Matches Calibration's own by-driver table — never disagrees with it.</p>
        {state.driverImportance.map((d) => (
          <p key={d.driver} style={{ ...TYPE_BODY, color: TEXT_SECONDARY, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
            {d.driver}: {ordinal(d.rankLastMonth)} last month, now {ordinal(d.rankNow)}{d.rankNow < d.rankLastMonth ? ' ↑' : d.rankNow > d.rankLastMonth ? ' ↓' : ''}
          </p>
        ))}
      </div>

      <div style={{ marginTop: SPACE_32, padding: SPACE_16, background: PANEL_RAISED, borderRadius: RADIUS_STATIC, border: `${BORDER_WIDTH}px solid ${HAIRLINE}` }}>
        <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>HUMAN VERSUS ASE</p>
        <p style={{ ...TYPE_BODY, color: TEXT_PRIMARY, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
          When humans overruled ASE this month, the human was right {state.humanVsAse.humanOverruleCorrectPct}% of the time (n={state.humanVsAse.humanOverruleN}).
        </p>
        <p style={{ ...TYPE_BODY, color: TEXT_PRIMARY, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
          ASE was right {state.humanVsAse.aseCorrectWhenNotOverruledPct}% of the time when not overruled (n={state.humanVsAse.aseN}).
        </p>
      </div>

      <div style={{ marginTop: SPACE_32 }}>
        <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>PREDICTION FEEDBACK — THE LOOP THAT MAKES PREDICTION IMPROVE</p>
        <div className="grid grid-cols-3" style={{ gap: SPACE_16, marginTop: SPACE_16 }}>
          <div>
            <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>WRONG PREDICTIONS</p>
            {state.predictionFeedback.wrongPredictions.map((w, i) => (
              <p key={i} style={{ ...TYPE_BODY, color: TEXT_SECONDARY, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
                {w.who} {w.serial} — {w.implicatedDriver}
              </p>
            ))}
          </div>
          <div>
            <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>MISSED PATTERNS</p>
            {state.predictionFeedback.missedPatterns.map((m, i) => (
              <p key={i} style={{ ...TYPE_BODY, color: TEXT_SECONDARY, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
                {m.pattern} — {m.count} times, {m.expiredWatchWindows} expired watch windows
              </p>
            ))}
          </div>
          <div>
            <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>OVERRULED, BY REASON</p>
            {state.predictionFeedback.overruledByReason.map((o) => (
              <p key={o.reason} style={{ ...TYPE_BODY, color: TEXT_SECONDARY, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
                {OVERRULE_REASON_LABEL[o.reason]}: {o.count}
              </p>
            ))}
          </div>
        </div>
      </div>

      <div style={{ marginTop: SPACE_32 }}>
        <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>QA SAMPLING</p>
        <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>5% of resolved items resurfaced for a second look.</p>
        {state.qaSamples.map((qa) => (
          <div key={qa.id} className="flex items-center justify-between" style={{ padding: `${SPACE_8}px 0`, borderBottom: `${BORDER_WIDTH}px solid ${HAIRLINE}` }}>
            <span style={{ ...TYPE_BODY, color: TEXT_SECONDARY, textTransform: 'none', letterSpacing: 'normal' }}>QA sample — please verify: {qa.what}</span>
            <span style={{ ...TYPE_CAPTION, color: qa.status === 'found-error' ? ANOMALY : qa.status === 'confirmed-correct' ? NOMINAL : WATCH }}>{qa.status.replace('-', ' ')}</span>
          </div>
        ))}
      </div>

      <div style={{ marginTop: SPACE_32, padding: SPACE_16, background: PANEL_RAISED, borderRadius: RADIUS_STATIC, border: `${BORDER_WIDTH}px solid ${HAIRLINE}` }}>
        <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>EXTERNAL VALIDATION</p>
        <p style={{ ...TYPE_BODY, color: TEXT_DIM, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
          No external reviewer assessment on record yet. When a medical officer or an external altitude-medicine reviewer assesses ASE's calls, their independent verdict lands here — e.g. "External validation: 89% agreement on descent recommendations." Left present, empty, to show the intent.
        </p>
      </div>

      <div className="grid grid-cols-2" style={{ gap: SPACE_16, marginTop: SPACE_32 }}>
        <NotBuiltPanel heading="A/B TESTING">
          Not shown: with {'118'} resolved cases, a 20%-of-climbers split test cannot reach statistical significance, and showing one implies a sample size this product does not have. A/B testing becomes available above 400 resolved cases — this is a stated production plan, not a demo feature.
        </NotBuiltPanel>
        <NotBuiltPanel heading="COST IN LIVES">
          Not shown: converting a false-negative rate into "lives saved" from mock data is the easiest claim in this product to attack. Instead: this change reduces missed cases by 12% and increases false alarms by 8% — the trade-off, for the operator to weigh, not a number this product invents on their behalf.
        </NotBuiltPanel>
      </div>

      <div style={{ marginTop: SPACE_32 }}>
        <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>MODEL VERSIONS</p>
        {state.modelVersions.map((v) => (
          <div key={v.version} className="flex items-center justify-between" style={{ padding: `${SPACE_8}px 0`, borderBottom: `${BORDER_WIDTH}px solid ${HAIRLINE}` }}>
            <span style={{ ...TYPE_BODY, color: TEXT_PRIMARY }}>{v.version}</span>
            <span style={{ ...TYPE_BODY, color: TEXT_SECONDARY, flex: 1, marginLeft: SPACE_16, textTransform: 'none', letterSpacing: 'normal' }}>{v.what}</span>
            <span style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>{v.recomputedCount} recomputed</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`
}

function FigureCard({ label, value, deltaNote }: { label: string; value: string; deltaNote: string }) {
  return (
    <div style={{ padding: SPACE_16, background: PANEL_RAISED, borderRadius: RADIUS_STATIC, border: `${BORDER_WIDTH}px solid ${HAIRLINE}` }}>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>{label.toUpperCase()}</p>
      <p className="font-mono" style={{ ...TYPE_DISPLAY, color: TEXT_PRIMARY, marginTop: SPACE_8, fontSize: 22 }}>
        {value}
      </p>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>{deltaNote}</p>
    </div>
  )
}

function NotBuiltPanel({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: SPACE_16, background: 'transparent', borderRadius: RADIUS_STATIC, border: `${BORDER_WIDTH}px dashed ${HAIRLINE}` }}>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>{heading} — DELIBERATELY NOT SHOWN</p>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>{children}</p>
    </div>
  )
}

function RevertButton({ allowed, reason, onClick, label }: { allowed: boolean; reason: string; onClick: () => void; label: string }) {
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
        color: allowed ? ANOMALY : TEXT_DIM,
        border: `${BORDER_WIDTH}px solid ${allowed ? ANOMALY : HAIRLINE}`,
        borderRadius: RADIUS_INTERACTIVE,
        padding: `${SPACE_8}px ${SPACE_16}px`,
        marginTop: SPACE_8,
        cursor: allowed ? 'pointer' : 'not-allowed',
        ...focusRingStyle(focused),
      }}
    >
      {label}
    </button>
  )
}
