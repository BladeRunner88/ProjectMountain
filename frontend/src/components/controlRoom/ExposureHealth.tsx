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
  TYPE_DISPLAY,
  WATCH,
} from '../../ase/tokens'
import { useDataset } from '../../ase/store'
import type { ExposureState, SourceHealth, SourceHealthState } from '../../ase/exposure'
import { canDoOnPanel, disabledReasonOnPanel, type Role } from './exposurePermissions'
import { focusRingStyle, useFocusRing } from './focusRing'

const STATE_COLOR: Record<SourceHealthState, string> = { healthy: NOMINAL, stable: TEXT_SECONDARY, degraded: WATCH, critical: ANOMALY }

// HEALTH — four summary cards, per-source detail with the real
// uptime/freshness/corroboration/reliability breakdown, proactive alerts
// (auto-raised to Revision's queue after 10 minutes — see exposure.ts's
// buildAlerts), and a 7-day uptime history per source.
export function ExposureHealth({ state, role }: { state: ExposureState; role: Role }) {
  const meanHealth = Math.round(state.sourceHealth.reduce((a, h) => a + h.healthPct, 0) / state.sourceHealth.length)
  const critical = state.sourceHealth.filter((h) => h.state === 'critical').length
  const pendingAlerts = state.alerts.filter((a) => !a.raisedToQueue).length
  const factsTracked = state.sourceHealth.reduce((a, h) => a + h.factsDependent, 0)

  return (
    <div>
      <div className="grid grid-cols-4" style={{ gap: SPACE_16 }}>
        <Stat label="MEAN HEALTH" value={`${meanHealth}%`} color={meanHealth < 70 ? WATCH : undefined} />
        <Stat label="SOURCES CRITICAL" value={String(critical)} color={critical > 0 ? ANOMALY : undefined} />
        <Stat label="ALERTS PENDING AUTO-RAISE" value={String(pendingAlerts)} />
        <Stat label="FACTS TRACKED" value={String(factsTracked)} />
      </div>

      {state.alerts.length > 0 && (
        <div style={{ marginTop: SPACE_24 }}>
          <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>PROACTIVE ALERTS</p>
          {state.alerts.map((a) => (
            <AlertRow key={a.id} alert={a} role={role} />
          ))}
        </div>
      )}

      <div style={{ marginTop: SPACE_24 }}>
        <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>SOURCES</p>
        <div className="grid grid-cols-2" style={{ gap: SPACE_16, marginTop: SPACE_16 }}>
          {state.sourceHealth.map((h) => (
            <SourceCard key={h.sourceId} health={h} />
          ))}
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ padding: SPACE_16, background: PANEL_RAISED, borderRadius: RADIUS_STATIC, border: `${BORDER_WIDTH}px solid ${HAIRLINE}` }}>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>{label}</p>
      <p className="font-mono" style={{ ...TYPE_DISPLAY, color: color ?? TEXT_PRIMARY, marginTop: SPACE_8, fontSize: 22 }}>
        {value}
      </p>
    </div>
  )
}

function AlertRow({ alert, role }: { alert: ExposureState['alerts'][number]; role: Role }) {
  const { appendAuditRecordEntry } = useDataset()
  const { focused, handlers } = useFocusRing()
  const allowed = canDoOnPanel('health', role, 'flag-for-review')
  return (
    <div
      className="flex items-center justify-between"
      style={{
        padding: SPACE_16,
        marginTop: SPACE_8,
        background: PANEL_RAISED,
        borderRadius: RADIUS_STATIC,
        border: `${BORDER_WIDTH}px solid ${alert.raisedToQueue ? ANOMALY : WATCH}`,
      }}
    >
      <div>
        <p style={{ ...TYPE_BODY, color: TEXT_PRIMARY }}>{alert.message}</p>
        <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
          {alert.raisedToQueue
            ? `Auto-raised to Revision's queue at ${new Date(alert.autoRaiseAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`
            : `Will auto-raise to Revision's queue at ${new Date(alert.autoRaiseAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} if still unresolved.`}
        </p>
      </div>
      <button
        type="button"
        disabled={!allowed}
        title={!allowed ? disabledReasonOnPanel('health', role, 'flag-for-review') : undefined}
        onClick={() =>
          appendAuditRecordEntry({
            who: 'You',
            actionKind: 'annotated',
            actionLabel: 'flagged a source health alert for review',
            aboutClimberId: null,
            aboutSerial: null,
            aboutLabel: alert.sourceName,
            whatChanged: alert.message,
            witness: null,
            witnessPending: false,
            attachments: [],
            correctionOfId: null,
            overruleReason: null,
            fromTab: 'exposure',
          })
        }
        {...handlers}
        className="pressable"
        style={{
          ...TYPE_CAPTION,
          textTransform: 'none',
          letterSpacing: 'normal',
          color: allowed ? NOMINAL : TEXT_DIM,
          border: `${BORDER_WIDTH}px solid ${allowed ? NOMINAL : HAIRLINE}`,
          borderRadius: RADIUS_INTERACTIVE,
          padding: `${SPACE_8}px ${SPACE_16}px`,
          cursor: allowed ? 'pointer' : 'not-allowed',
          ...focusRingStyle(focused),
        }}
      >
        FLAG FOR REVIEW
      </button>
    </div>
  )
}

function SourceCard({ health: h }: { health: SourceHealth }) {
  return (
    <div style={{ padding: SPACE_16, background: PANEL_RAISED, borderRadius: RADIUS_STATIC, border: `${BORDER_WIDTH}px solid ${HAIRLINE}` }}>
      <div className="flex items-center justify-between">
        <div>
          <p style={{ ...TYPE_BODY, color: TEXT_PRIMARY }}>{h.sourceName}</p>
          <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_8 }}>{h.category.toUpperCase()}</p>
        </div>
        <span
          style={{
            ...TYPE_CAPTION,
            color: STATE_COLOR[h.state],
            border: `${BORDER_WIDTH}px solid ${STATE_COLOR[h.state]}`,
            borderRadius: RADIUS_INTERACTIVE,
            padding: `1px ${SPACE_8}px`,
          }}
        >
          {h.healthPct}% · {h.state.toUpperCase()}
        </span>
      </div>

      <div style={{ marginTop: SPACE_16 }}>
        <Breakdown label="Uptime (30%)" pct={h.breakdown.uptimePct} />
        <Breakdown label="Freshness (25%)" pct={h.breakdown.freshnessPct} />
        <Breakdown label="Corroboration (25%)" pct={h.breakdown.corroborationPct} />
        <Breakdown label="Reliability (20%)" pct={h.breakdown.reliabilityPct} />
      </div>

      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_16, textTransform: 'none', letterSpacing: 'normal' }}>
        Estimated failure risk in the next 30 minutes: <span style={{ color: TEXT_SECONDARY }}>{h.failureRiskPct30Min}%</span> — a model estimate, not a
        measurement.
      </p>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
        Last sync {h.lastSyncAgeSec}s ago · useful window {h.usefulWindowLabel} ·{' '}
        {h.inUse ? `${h.factsDependent} fact${h.factsDependent === 1 ? '' : 's'} depend on it` : 'not yet relied upon by any conclusion'}
      </p>

      <div className="flex items-end" style={{ gap: 3, marginTop: SPACE_16, height: 28 }}>
        {h.history7Day.map((pct, i) => (
          <div key={i} title={`Day -${h.history7Day.length - i}: ${pct}% uptime`} style={{ width: 10, height: `${Math.max(4, pct * 0.28)}px`, background: pct < 70 ? WATCH : NOMINAL, opacity: 0.8 }} />
        ))}
      </div>
    </div>
  )
}

function Breakdown({ label, pct }: { label: string; pct: number }) {
  return (
    <div className="flex items-center" style={{ gap: SPACE_8, marginTop: SPACE_8 }}>
      <span style={{ ...TYPE_CAPTION, color: TEXT_DIM, textTransform: 'none', letterSpacing: 'normal', width: 130 }}>{label}</span>
      <div className="flex-1" style={{ height: 4, background: HAIRLINE, borderRadius: RADIUS_INTERACTIVE }}>
        <div style={{ width: `${pct}%`, height: 4, background: pct < 50 ? ANOMALY : pct < 75 ? WATCH : NOMINAL, borderRadius: RADIUS_INTERACTIVE }} />
      </div>
      <span className="font-mono" style={{ ...TYPE_CAPTION, color: TEXT_SECONDARY, width: 32, textAlign: 'right' }}>
        {pct}%
      </span>
    </div>
  )
}
