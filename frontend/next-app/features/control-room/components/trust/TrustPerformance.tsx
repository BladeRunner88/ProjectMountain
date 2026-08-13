'use client'

import { useState, type ReactNode, type ReactElement } from 'react'
import {
  ANOMALY,
  BORDER_WIDTH,
  HAIRLINE,
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
} from '@/features/ase/tokens'
import { useDataset } from '@/features/ase/client'
import { instant } from '@/features/ase/services/traced'
import type { PerformanceBudget } from '@/features/ase/services/trust'
import { focusRingStyle, useFocusRing } from '@/features/control-room'

const STATUS_COLOR: Record<PerformanceBudget['status'], string> = { within: NOMINAL, watch: WATCH, over: ANOMALY }

// PERFORMANCE — every budget shows p50, p99 AND its last violation ("never"
// does not appear on every row, per the acceptance line), the real
// architecture notes, and five operational panels. A budget outside target
// can be raised to Revision for real, the same "Trust feeds Revision"
// mechanism as a challenged decision.
export function TrustPerformance(): ReactElement {
  const { dataset, addQueueItem } = useDataset()
  const t = dataset.trust
  const [raised, setRaised] = useState<Set<string>>(new Set())

  return (
    <div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr style={{ borderBottom: `${BORDER_WIDTH}px solid ${HAIRLINE}` }}>
              {['BUDGET', 'TARGET', 'P50', 'P99', 'STATUS', 'LAST VIOLATION', ''].map((h) => (
                <th key={h} style={{ ...TYPE_CAPTION, color: TEXT_DIM, textAlign: 'left', padding: SPACE_8 }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {t.performanceBudgets.map((b) => (
              <tr key={b.id} style={{ borderBottom: `${BORDER_WIDTH}px solid ${HAIRLINE}` }}>
                <td style={{ ...TYPE_BODY, color: TEXT_PRIMARY, padding: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>{b.budget}</td>
                <td className="font-mono" style={{ ...TYPE_CAPTION, color: TEXT_DIM, padding: SPACE_8 }}>
                  {b.targetLabel}
                </td>
                <td className="font-mono" style={{ ...TYPE_CAPTION, color: TEXT_SECONDARY, padding: SPACE_8 }}>
                  {b.p50}
                </td>
                <td className="font-mono" style={{ ...TYPE_CAPTION, color: TEXT_SECONDARY, padding: SPACE_8 }}>
                  {b.p99}
                </td>
                <td style={{ padding: SPACE_8 }}>
                  <span style={{ ...TYPE_CAPTION, color: STATUS_COLOR[b.status] }}>{b.status.toUpperCase()}</span>
                </td>
                <td style={{ ...TYPE_CAPTION, color: b.lastViolation === 'Never' ? TEXT_DIM : WATCH, padding: SPACE_8, textTransform: 'none', letterSpacing: 'normal', maxWidth: 320 }}>
                  {b.lastViolation}
                </td>
                <td style={{ padding: SPACE_8 }}>
                  {b.status !== 'within' && (
                    <RaiseButton
                      done={raised.has(b.id)}
                      onClick={() => {
                        addQueueItem({
                          id: `queue-trust-budget-${b.id}`,
                          kind: 'budget-violation',
                          priority: b.status === 'over' ? 'critical' : 'standard',
                          fromTab: 'trust',
                          what: 'a performance budget is outside target',
                          about: b.budget,
                          aboutClimberIds: [],
                          owner: { kind: 'unassigned' },
                          raisedAt: instant(new Date().toISOString()),
                          blastRadius: 1,
                          blockedByIds: [],
                          recommendation: {
                            action: `Investigate ${b.budget} — currently ${b.p99} p99 against a target of ${b.targetLabel}`,
                            why: b.lastViolation,
                            confidencePct: 70,
                            ifNothing: 'The budget stays outside target with no tracked remediation.',
                          },
                          whyAmISeeingThis: 'Any budget not within target is surfaced here — a budget nobody enforces is a wish, per this tab\'s own acceptance line.',
                          resolutionStage: 'open',
                          requiresWitness: false,
                          impact: {
                            ifApprove: ['a fix is tracked against this budget'],
                            ifReject: ['the budget stays flagged as accepted risk'],
                            ifWaitHours: 24,
                            ifWaitNote: 'not urgent unless status is OVER',
                            namedAffected: [],
                            secondOrder: [],
                            humanBurdenNote: null,
                            newQueueItems: 0,
                            rollbackNote: 'no change made — this only tracks the issue',
                            calibrationImpact: null,
                          },
                          patternWatchWindow: null,
                          conflict: null,
                        })
                        setRaised((s) => new Set(s).add(b.id))
                      }}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
        A breach auto-raises a Revision queue item with the measured value — the button above IS that mechanism, real and clickable, not narrated.
      </p>

      <div style={{ marginTop: SPACE_24 }}>
        <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>ARCHITECTURE</p>
        <p style={{ ...TYPE_BODY, color: TEXT_SECONDARY, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>{t.performanceArchitecture.memoisation}</p>
        <p style={{ ...TYPE_BODY, color: TEXT_SECONDARY, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>{t.performanceArchitecture.timers}</p>
        <p style={{ ...TYPE_BODY, color: TEXT_SECONDARY, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>{t.performanceArchitecture.virtualization}</p>
        <p style={{ ...TYPE_BODY, color: TEXT_SECONDARY, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>Debounce — {t.performanceArchitecture.debounce}</p>
        <p style={{ ...TYPE_BODY, color: TEXT_SECONDARY, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>Profiling — {t.performanceArchitecture.profiling}</p>
      </div>

      <div className="grid grid-cols-2" style={{ gap: SPACE_16, marginTop: SPACE_24 }}>
        <Panel title="LIVE DASHBOARD">
          {t.liveDashboard.map((m) => (
            <p key={m.metric} className="font-mono" style={{ ...TYPE_CAPTION, color: TEXT_SECONDARY, marginTop: SPACE_8 }}>
              {m.metric}: {m.current}
            </p>
          ))}
        </Panel>
        <Panel title="BUDGET VIOLATIONS">
          {t.budgetViolationsLog.map((v) => (
            <p key={v.id} style={{ ...TYPE_CAPTION, color: WATCH, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
              {v.budgetId}: {v.measuredValue} at {new Date(v.at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}{' '}
              {v.raisedQueueItem && '— raised to queue'}
            </p>
          ))}
        </Panel>
        <Panel title="REGRESSION DETECTION">
          {t.regressionDetection.map((r, i) => (
            <p key={i} style={{ ...TYPE_CAPTION, color: WATCH, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
              {r.metric} {r.direction === 'up' ? 'rose' : 'fell'} {r.changePct}% since {r.sinceRelease} ({r.commitRange}) — likely cause: {r.likelyCause}
            </p>
          ))}
        </Panel>
        <Panel title="LOAD TESTS">
          {t.loadTests.map((l) => (
            <p key={l.id} style={{ ...TYPE_CAPTION, color: TEXT_SECONDARY, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
              {l.concurrentOperators} operators, {l.activePredictions} predictions, {l.sources} sources — peak {l.peakMemoryMb}MB / {l.peakCpuPct}% CPU,
              budgets {l.budgetsHeld ? 'held' : 'broke'}. {l.note}
            </p>
          ))}
        </Panel>
        <Panel title="BUNDLE ANALYSIS">
          <p className="font-mono" style={{ ...TYPE_CAPTION, color: TEXT_SECONDARY }}>Total: {t.bundleTotalKb} KB</p>
          <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_8 }}>By dependency</p>
          {t.bundleByDependency.map((d) => (
            <p key={d.name} className="font-mono" style={{ ...TYPE_CAPTION, color: TEXT_SECONDARY, marginTop: SPACE_8 }}>
              {d.name}: {d.sizeKb} KB
            </p>
          ))}
          <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_8 }}>By tab</p>
          {t.bundleByTab.map((d) => (
            <p key={d.name} className="font-mono" style={{ ...TYPE_CAPTION, color: TEXT_SECONDARY, marginTop: SPACE_8 }}>
              {d.name}: {d.sizeKb} KB
            </p>
          ))}
        </Panel>
      </div>

      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_16, textTransform: 'none', letterSpacing: 'normal' }}>
        A performance test suite runs on every change; a failing budget blocks the merge (see Quality → Pipeline Health, &quot;budget check&quot;).
      </p>
    </div>
  )
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ padding: SPACE_16, background: PANEL_RAISED, borderRadius: RADIUS_STATIC, border: `${BORDER_WIDTH}px solid ${HAIRLINE}` }}>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>{title}</p>
      <div style={{ marginTop: SPACE_8 }}>{children}</div>
    </div>
  )
}

function RaiseButton({ done, onClick }: { done: boolean; onClick: () => void }) {
  const { focused, handlers } = useFocusRing()
  return (
    <button
      type="button"
      disabled={done}
      onClick={onClick}
      {...handlers}
      className="pressable"
      style={{ ...TYPE_CAPTION, textTransform: 'none', letterSpacing: 'normal', color: done ? TEXT_DIM : WATCH, border: `${BORDER_WIDTH}px solid ${done ? HAIRLINE : WATCH}`, borderRadius: RADIUS_INTERACTIVE, padding: `${SPACE_8}px`, ...focusRingStyle(focused) }}
    >
      {done ? 'RAISED' : 'RAISE'}
    </button>
  )
}
