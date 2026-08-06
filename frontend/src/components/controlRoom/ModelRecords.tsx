import { useMemo } from 'react'
import {
  BORDER_WIDTH,
  HAIRLINE,
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
  WATCH,
} from '../../ase/tokens'
import { useDataset } from '../../ase/store'
import { focusRingStyle, useFocusRing } from './focusRing'
import { EvidenceTable, type EvidenceRow } from './EvidenceTable'
import type { Ontology, RecordMisfit } from '../../ase/ontology'

const KIND_LABEL: Record<string, string> = { country: 'Country', region: 'Region', route: 'Route', operator: 'Operator', climber: 'Climber', sensor: 'Sensor' }

// RECORDS: a virtualised EvidenceTable of every real instance (127 rows —
// genuinely over the 100-row virtualisation threshold), plus the three that
// don't fit the model, each with its own action.
export function ModelRecords({ ontology }: { ontology: Ontology }) {
  const { logRevision } = useDataset()

  const rows: EvidenceRow[] = useMemo(
    () =>
      ontology.records.map((r) => ({
        id: r.id,
        traced: r.traced,
        label: `${KIND_LABEL[r.kind]} · ${r.label}`,
        claimSortValue: r.label,
        why: r.why,
        format: () => `${KIND_LABEL[r.kind]} · ${r.label}`,
        graphHref: '/app/graph',
      })),
    [ontology]
  )

  return (
    <div>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>DOESN'T FIT THE MODEL</p>
      <div style={{ marginTop: SPACE_16, marginBottom: SPACE_32 }}>
        {ontology.misfits.map((m) => (
          <MisfitRow key={m.id} misfit={m} onWiden={() => logRevision(`${m.label}: the model was widened to account for this — ${m.reason}`)} onFlag={() => logRevision(`${m.label}: flagged the source for review — ${m.reason}`)} />
        ))}
      </div>

      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>ALL RECORDS ({ontology.records.length})</p>
      <div style={{ marginTop: SPACE_16 }}>
        <EvidenceTable rows={rows} />
      </div>
    </div>
  )
}

function MisfitRow({ misfit, onWiden, onFlag }: { misfit: RecordMisfit; onWiden: () => void; onFlag: () => void }) {
  return (
    <div
      style={{
        padding: SPACE_16,
        background: PANEL_RAISED,
        borderRadius: RADIUS_STATIC,
        border: `${BORDER_WIDTH}px solid ${HAIRLINE}`,
        marginBottom: SPACE_8,
      }}
    >
      <div className="flex items-start justify-between" style={{ gap: SPACE_16 }}>
        <div style={{ flex: 1 }}>
          <p style={{ ...TYPE_BODY, color: TEXT_PRIMARY }}>{misfit.label}</p>
          <p style={{ ...TYPE_BODY, color: TEXT_SECONDARY, marginTop: SPACE_8 }}>{misfit.reason}</p>
        </div>
        <div className="flex shrink-0" style={{ gap: SPACE_8 }}>
          <ActionButton label="Widen the model" onClick={onWiden} />
          <ActionButton label="Flag the source" onClick={onFlag} />
        </div>
      </div>
    </div>
  )
}

function ActionButton({ label, onClick }: { label: string; onClick: () => void }) {
  const { focused, handlers } = useFocusRing()
  return (
    <button
      type="button"
      onClick={onClick}
      {...handlers}
      className="pressable"
      style={{
        ...TYPE_CAPTION,
        textTransform: 'none',
        letterSpacing: 'normal',
        color: WATCH,
        border: `${BORDER_WIDTH}px solid ${WATCH}`,
        borderRadius: RADIUS_INTERACTIVE,
        padding: `${SPACE_8}px ${SPACE_16}px`,
        whiteSpace: 'nowrap',
        ...focusRingStyle(focused),
      }}
    >
      {label.toUpperCase()}
    </button>
  )
}
