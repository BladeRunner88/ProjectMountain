'use client'

import { useState, type ReactElement } from 'react'
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
  TEXT_DIM,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  TYPE_BODY,
  TYPE_CAPTION,
  WATCH,
} from '@/features/ase/tokens'
import { useDataset } from '@/features/ase/client'
import { EXPOSURE_CLASS_ORDER, type ExposureState, type MatrixCell } from '@/features/ase/services/exposure'
import { canDoOnPanel, disabledReasonOnPanel, type ExposureRole as Role } from '@/features/control-room'
import { focusRingStyle, useFocusRing } from '@/features/control-room'

const SEVERITY_COLOR: Record<MatrixCell['severity'], string> = { none: TEXT_DIM, low: TEXT_SECONDARY, watch: WATCH, anomaly: ANOMALY }

// MATRIX — source × conclusion-class, computed from the real dependents
// index. `totalDependents` per row is the EXACT figure Revision's own
// single-source queue item uses as blast radius for the same source
// (verified in exposure.test.ts) — this tab never shows a second,
// disagreeing number for the same question.
export function ExposureMatrix({ state, role }: { state: ExposureState; role: Role }): ReactElement {
  const { appendAuditRecordEntry } = useDataset()
  const [selected, setSelected] = useState<{ source: string; className: string } | null>(null)
  const allowed = canDoOnPanel('matrix', role, 'flag-for-review')

  return (
    <div>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, textTransform: 'none', letterSpacing: 'normal' }}>
        Each cell is a count of real conclusions that trace back to that source (via `dependents()`), not an authored figure. The TOTAL column is the
        source&apos;s full downstream closure — it will not always equal the sum of the class cells, since not every downstream fact is one this tab can
        attribute to a named class.
      </p>

      <div style={{ marginTop: SPACE_16, overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr style={{ borderBottom: `${BORDER_WIDTH}px solid ${HAIRLINE}` }}>
              <th style={{ ...TYPE_CAPTION, color: TEXT_DIM, textAlign: 'left', padding: SPACE_8 }}>SOURCE</th>
              {EXPOSURE_CLASS_ORDER.map((c) => (
                <th key={c} style={{ ...TYPE_CAPTION, color: TEXT_DIM, textAlign: 'right', padding: SPACE_8 }}>
                  {c.toUpperCase()}
                </th>
              ))}
              <th style={{ ...TYPE_CAPTION, color: TEXT_DIM, textAlign: 'right', padding: SPACE_8 }}>TOTAL</th>
            </tr>
          </thead>
          <tbody>
            {state.matrix.map((row) => (
              <tr key={row.sourceId} style={{ borderBottom: `${BORDER_WIDTH}px solid ${HAIRLINE}` }}>
                <td style={{ ...TYPE_BODY, color: TEXT_PRIMARY, padding: SPACE_8 }}>{row.sourceName}</td>
                {row.cells.map((cell) => (
                  <td key={cell.className} style={{ padding: SPACE_8, textAlign: 'right' }}>
                    <button
                      type="button"
                      onClick={() => setSelected({ source: row.sourceName, className: cell.className })}
                      className="pressable font-mono"
                      style={{
                        ...TYPE_BODY,
                        color: SEVERITY_COLOR[cell.severity],
                        textDecoration: selected?.source === row.sourceName && selected.className === cell.className ? 'underline' : 'none',
                      }}
                    >
                      {cell.count}
                    </button>
                  </td>
                ))}
                <td className="font-mono" style={{ ...TYPE_BODY, color: TEXT_SECONDARY, padding: SPACE_8, textAlign: 'right' }}>
                  {row.totalDependents}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <div style={{ marginTop: SPACE_16, padding: SPACE_16, background: PANEL_RAISED, borderRadius: RADIUS_STATIC, border: `${BORDER_WIDTH}px solid ${HAIRLINE}` }}>
          <p style={{ ...TYPE_BODY, color: TEXT_PRIMARY }}>
            {selected.source} → {selected.className}
          </p>
          <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
            Open Fragility to see exactly which conclusions these are and run a real counterfactual on any one of them.
          </p>
          <ActionButton
            allowed={allowed}
            reason={disabledReasonOnPanel('matrix', role, 'flag-for-review')}
            onClick={() => {
              appendAuditRecordEntry({
                who: 'You',
                actionKind: 'annotated',
                actionLabel: 'flagged a Matrix cell for review',
                aboutMachineId: null,
                aboutSerial: null,
                aboutLabel: `${selected.source} → ${selected.className}`,
                whatChanged: `Flagged the ${selected.source} / ${selected.className} exposure cell for a closer look.`,
                witness: null,
                witnessPending: false,
                attachments: [],
                correctionOfId: null,
                overruleReason: null,
                fromTab: 'exposure',
              })
              setSelected(null)
            }}
          />
        </div>
      )}
    </div>
  )
}

function ActionButton({ allowed, reason, onClick }: { allowed: boolean; reason: string; onClick: () => void }) {
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
        marginTop: SPACE_16,
        cursor: allowed ? 'pointer' : 'not-allowed',
        ...focusRingStyle(focused),
      }}
    >
      FLAG FOR REVIEW
    </button>
  )
}
