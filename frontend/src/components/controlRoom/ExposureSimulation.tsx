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
} from '../../ase/tokens'
import { useSimulationMode } from '../../ase/simulationMode'
import type { ExposureState } from '../../ase/exposure'
import { PersonBadge } from './PersonBadge'
import { canDoOnPanel, disabledReasonOnPanel, type Role } from './exposurePermissions'
import { focusRingStyle, useFocusRing } from './focusRing'

// SIMULATION — outage/degraded-mode rehearsal against REAL
// `dependentsOfSource()` counts (exposure.ts's buildSimulations), wired to
// the actual global SimulationMode context so starting one visibly changes
// the whole Control Room's nav bar (TopBar.tsx), not just this panel — a
// simulated state can never be mistaken for the present. Recovery reports
// are honest about what could NOT be backfilled, not just what was.
export function ExposureSimulation({ state, role }: { state: ExposureState; role: Role }) {
  const simulation = useSimulationMode()
  const allowed = canDoOnPanel('simulation', role, 'run-simulation')
  const active = state.simulations.find((s) => s.sourceId === simulation.sourceId) ?? null

  return (
    <div>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, textTransform: 'none', letterSpacing: 'normal' }}>
        Rehearses a source going offline against the real dependents index — nothing here is written to the actual graph. Running one changes the nav bar
        above for the whole Control Room, so it can't be mistaken for a real outage.
      </p>

      <div className="grid grid-cols-2" style={{ gap: SPACE_16, marginTop: SPACE_16 }}>
        {state.simulations.map((s) => (
          <div key={s.id} style={{ padding: SPACE_16, background: PANEL_RAISED, borderRadius: RADIUS_STATIC, border: `${BORDER_WIDTH}px solid ${simulation.sourceId === s.sourceId ? WATCH : HAIRLINE}` }}>
            <div className="flex items-center justify-between">
              <p style={{ ...TYPE_BODY, color: TEXT_PRIMARY }}>{s.sourceName}</p>
              {simulation.sourceId === s.sourceId ? (
                <ExitButton onClick={simulation.stop} />
              ) : (
                <RunButton
                  allowed={allowed}
                  reason={disabledReasonOnPanel('simulation', role, 'run-simulation')}
                  onClick={() => simulation.start(s.sourceId, s.sourceName)}
                />
              )}
            </div>
            <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
              {s.factsUnavailable} conclusion{s.factsUnavailable === 1 ? '' : 's'} would become unavailable.
            </p>
          </div>
        ))}
      </div>

      {active && (
        <div style={{ marginTop: SPACE_24, padding: SPACE_16, background: PANEL_RAISED, borderRadius: RADIUS_STATIC, border: `${BORDER_WIDTH}px solid ${WATCH}` }}>
          <p style={{ ...TYPE_BODY, color: TEXT_PRIMARY }}>{active.sourceName} — simulated outage report</p>

          <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_16 }}>CONCLUSIONS BELOW THE CONFIDENCE FLOOR, BY CLASS</p>
          <div className="flex flex-wrap" style={{ gap: SPACE_8, marginTop: SPACE_8 }}>
            {active.conclusionsBelowFloorByClass.map((c) => (
              <span key={c.className} style={{ ...TYPE_CAPTION, color: c.count > 0 ? ANOMALY : TEXT_DIM, border: `${BORDER_WIDTH}px solid ${c.count > 0 ? ANOMALY : HAIRLINE}`, borderRadius: RADIUS_INTERACTIVE, padding: `1px ${SPACE_8}px` }}>
                {c.className}: {c.count}
              </span>
            ))}
          </div>

          <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_16, textTransform: 'none', letterSpacing: 'normal' }}>
            {active.predictionsCannotIssue} prediction{active.predictionsCannotIssue === 1 ? '' : 's'} could not issue.
          </p>

          {active.peopleNotFullyKnowable.length > 0 && (
            <div style={{ marginTop: SPACE_16 }}>
              <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>PEOPLE NOT FULLY KNOWABLE</p>
              <div className="flex flex-wrap" style={{ gap: SPACE_8, marginTop: SPACE_8 }}>
                {active.peopleNotFullyKnowable.map((p) => (
                  <PersonBadge key={p.climberId} climberId={p.climberId} name={p.name} serial={p.serial} />
                ))}
              </div>
            </div>
          )}

          {active.backup ? (
            <div style={{ marginTop: SPACE_16 }}>
              <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>BACKUP SOURCE</p>
              <p style={{ ...TYPE_BODY, color: TEXT_PRIMARY, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>{active.backup.backupSourceName}</p>
              <p style={{ ...TYPE_CAPTION, color: TEXT_SECONDARY, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
                Switch cost ~{active.backup.switchCostMinutes} min · already corroborates {active.backup.factsRestoredPct}% of what this source carries ·{' '}
                {active.backup.coverageGapPct}% coverage gap remains
              </p>
            </div>
          ) : (
            <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_16, textTransform: 'none', letterSpacing: 'normal' }}>
              No natural backup source for this one in this domain.
            </p>
          )}
        </div>
      )}

      {state.recoveryReports.length > 0 && (
        <div style={{ marginTop: SPACE_24 }}>
          <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>RECOVERY REPORT — SOURCES CURRENTLY DEGRADED</p>
          {state.recoveryReports.map((r) => (
            <div key={r.sourceId} style={{ padding: SPACE_16, marginTop: SPACE_8, background: PANEL_RAISED, borderRadius: RADIUS_STATIC, border: `${BORDER_WIDTH}px solid ${HAIRLINE}` }}>
              <p style={{ ...TYPE_BODY, color: TEXT_PRIMARY }}>{r.sourceName}</p>
              <p style={{ ...TYPE_CAPTION, color: TEXT_SECONDARY, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
                Backfill window {r.backfilledMinutes} min · {r.factsReinstated} facts reinstated · {r.factsStillDegraded} still degraded
              </p>
              <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_8 }}>COULD NOT BE BACKFILLED</p>
              <ul style={{ marginTop: SPACE_8, paddingLeft: SPACE_16 }}>
                {r.couldNotBackfill.map((line, i) => (
                  <li key={i} style={{ ...TYPE_CAPTION, color: TEXT_SECONDARY, textTransform: 'none', letterSpacing: 'normal', marginTop: SPACE_8 }}>
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function RunButton({ allowed, reason, onClick }: { allowed: boolean; reason: string; onClick: () => void }) {
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
        color: allowed ? NOMINAL : TEXT_DIM,
        border: `${BORDER_WIDTH}px solid ${allowed ? NOMINAL : HAIRLINE}`,
        borderRadius: RADIUS_INTERACTIVE,
        padding: `${SPACE_8}px ${SPACE_16}px`,
        cursor: allowed ? 'pointer' : 'not-allowed',
        ...focusRingStyle(focused),
      }}
    >
      RUN SIMULATION
    </button>
  )
}

function ExitButton({ onClick }: { onClick: () => void }) {
  const { focused, handlers } = useFocusRing()
  return (
    <button
      type="button"
      onClick={onClick}
      {...handlers}
      className="pressable"
      style={{ ...TYPE_CAPTION, textTransform: 'none', letterSpacing: 'normal', color: WATCH, border: `${BORDER_WIDTH}px solid ${WATCH}`, borderRadius: RADIUS_INTERACTIVE, padding: `${SPACE_8}px ${SPACE_16}px`, ...focusRingStyle(focused) }}
    >
      EXIT SIMULATION
    </button>
  )
}
