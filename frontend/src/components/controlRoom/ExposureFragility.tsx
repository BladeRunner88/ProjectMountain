import { useState } from 'react'
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
import { renderProvenance, provenance } from '../../ase/folds'
import { EXPOSURE_SOURCE_NAMES } from '../../ase/dataset'
import { computeFragilityScenarios, type ExposureState, type FragileConclusion } from '../../ase/exposure'
import { canDoOnPanel, disabledReasonOnPanel, type Role } from './exposurePermissions'
import { focusRingStyle, useFocusRing } from './focusRing'

// FRAGILITY — single-source vs corroborated conclusions (a real
// `cost().sourcesTouched` bucketing), plus a derivation-tree inspector for
// whichever fragile conclusion is selected: three real counterfactual
// scenarios, computed on selection from the actual TracedValue, not baked
// into the dataset (RevisionImpact and PredictionCascade already established
// this "compute on demand" discipline).
export function ExposureFragility({ state, role }: { state: ExposureState; role: Role }) {
  const { dataset, appendAuditRecordEntry } = useDataset()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const exposureSources = dataset.sources.filter((s) => (EXPOSURE_SOURCE_NAMES as readonly string[]).includes(s.def.name))
  const selected = state.fragileConclusions.find((f) => f.id === selectedId) ?? null
  const allowed = canDoOnPanel('fragility', role, 'flag-for-review')

  return (
    <div>
      <div className="grid grid-cols-2" style={{ gap: SPACE_16 }}>
        <Stat label="SINGLE-SOURCE CONCLUSIONS" value={String(state.fragileConclusions.length)} color={state.fragileConclusions.length > 0 ? WATCH : undefined} />
        <Stat label="CORROBORATED CONCLUSIONS" value={String(state.corroboratedConclusions.length)} color={NOMINAL} />
      </div>

      <div className="grid grid-cols-2" style={{ gap: SPACE_24, marginTop: SPACE_24 }}>
        <div>
          <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>SINGLE-SOURCE — SELECT ONE TO INSPECT</p>
          <div style={{ marginTop: SPACE_8, maxHeight: 480, overflowY: 'auto' }}>
            {state.fragileConclusions.map((f) => (
              <FragileRow key={f.id} item={f} active={f.id === selectedId} onSelect={() => setSelectedId(f.id)} />
            ))}
          </div>
        </div>

        <div>
          <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>DERIVATION-TREE INSPECTOR</p>
          {!selected ? (
            <p style={{ ...TYPE_BODY, color: TEXT_DIM, marginTop: SPACE_16 }}>Select a single-source conclusion on the left.</p>
          ) : (
            <Inspector selected={selected} role={role} allowed={allowed} exposureSources={exposureSources} onFlag={() => {
              appendAuditRecordEntry({
                who: 'You',
                actionKind: 'annotated',
                actionLabel: 'flagged a fragile conclusion for review',
                aboutClimberId: selected.climberId,
                aboutSerial: null,
                aboutLabel: selected.label,
                whatChanged: `Single-source conclusion (${selected.sourceName}) flagged for corroboration review.`,
                witness: null,
                witnessPending: false,
                attachments: [],
                correctionOfId: null,
                overruleReason: null,
                fromTab: 'exposure',
              })
            }} />
          )}
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

function FragileRow({ item, active, onSelect }: { item: FragileConclusion; active: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="pressable flex items-center justify-between"
      style={{
        width: '100%',
        textAlign: 'left',
        padding: SPACE_8,
        borderBottom: `${BORDER_WIDTH}px solid ${HAIRLINE}`,
        background: active ? PANEL_RAISED : 'transparent',
      }}
    >
      <span>
        <span style={{ ...TYPE_BODY, color: TEXT_PRIMARY, textTransform: 'none', letterSpacing: 'normal' }}>{item.label}</span>
        <span style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginLeft: SPACE_8 }}>{item.className.toUpperCase()}</span>
      </span>
      <span className="font-mono" style={{ ...TYPE_CAPTION, color: TEXT_SECONDARY }}>
        {item.confidencePct}%
      </span>
    </button>
  )
}

function Inspector({
  selected,
  role,
  allowed,
  exposureSources,
  onFlag,
}: {
  selected: FragileConclusion
  role: Role
  allowed: boolean
  exposureSources: Parameters<typeof computeFragilityScenarios>[1]
  onFlag: () => void
}) {
  const scenarios = computeFragilityScenarios(selected.marker, exposureSources)
  const sentence = renderProvenance(provenance(selected.marker))

  return (
    <div style={{ marginTop: SPACE_16, padding: SPACE_16, background: PANEL_RAISED, borderRadius: RADIUS_STATIC, border: `${BORDER_WIDTH}px solid ${HAIRLINE}` }}>
      <p style={{ ...TYPE_BODY, color: TEXT_PRIMARY }}>{selected.label}</p>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>{sentence}</p>

      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_16 }}>REAL COUNTERFACTUAL SCENARIOS</p>
      {scenarios.map((s) => (
        <div key={s.id} style={{ marginTop: SPACE_8, padding: SPACE_8, border: `${BORDER_WIDTH}px solid ${s.droppedToZero ? ANOMALY : HAIRLINE}`, borderRadius: RADIUS_STATIC }}>
          <p style={{ ...TYPE_BODY, color: TEXT_PRIMARY, textTransform: 'none', letterSpacing: 'normal' }}>{s.label}</p>
          <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>{s.removedDescription}</p>
          <p className="font-mono" style={{ ...TYPE_CAPTION, color: s.droppedToZero ? ANOMALY : WATCH, marginTop: SPACE_8 }}>
            {s.confidenceBeforePct}% → {s.confidenceAfterPct}%
          </p>
        </div>
      ))}

      <ActionButton allowed={allowed} reason={disabledReasonOnPanel('fragility', role, 'flag-for-review')} onClick={onFlag} />
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
      FLAG FOR CORROBORATION REVIEW
    </button>
  )
}
