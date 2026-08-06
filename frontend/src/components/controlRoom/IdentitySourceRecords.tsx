import { useState } from 'react'
import {
  ANOMALY,
  BORDER_WIDTH,
  DEPENDENCY_DIM_OPACITY,
  HAIRLINE,
  HUMAN,
  MOTION_DEPENDENCY_DIM_MS,
  MOTION_DEPENDENCY_RESTORE_MS,
  NOMINAL,
  PANEL_RAISED,
  RADIUS_INTERACTIVE,
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
  TYPE_DISPLAY,
  WATCH,
} from '../../ase/tokens'
import type { Dataset } from '../../ase/dataset'
import { statusFromAnomalyState, type Associate, type PersonStatus } from '../../ase/identityCard'
import { edgeDashArray, nodeVisual } from '../../ase/nodeLanguage'
import { Metric } from '../../ase/Metric'
import { useSelection } from '../../ase/selection'
import { isAnteMortemUnsealed } from '../../ase/identityRecord'
import { useDataset } from '../../ase/store'
import { maskedSerial } from '../../ase/serial'
import type { Conflict } from '../../ase/conflict'
import type { TracedValue } from '../../ase/traced'
import { focusRingStyle, useFocusRing } from './focusRing'

const STATUS_COLOR: Record<PersonStatus, string> = { nominal: NOMINAL, watch: WATCH, anomaly: ANOMALY }

export function IdentitySourceRecords({
  dataset,
  climberId,
  onSelectPerson,
}: {
  dataset: Dataset
  climberId: string
  onSelectPerson: (climberId: string) => void
}) {
  const { openIncidents } = useDataset()
  const record = dataset.identityRecords.get(climberId)
  const anteMortem = dataset.anteMortems.get(climberId)
  const card = dataset.identityCards.get(climberId)

  if (!record || !anteMortem || !card) {
    return <p style={{ ...TYPE_BODY, color: TEXT_DIM }}>No source record for this person.</p>
  }

  const status = statusFromAnomalyState(record.derived.anomalyState.value)
  const unsealed = isAnteMortemUnsealed(record, openIncidents.has(climberId))
  const ethnicityConflict = card.identity.ethnicityHasConflict
    ? dataset.conflicts.find((cf) => cf.propertyLabel === 'Ethnicity (as recorded)' && cf.entityLabel === record.who.fullLegalName.value)
    : undefined

  return (
    <div>
      <IdentityCardPanel record={record} card={card} status={status} unsealed={unsealed} ethnicityConflict={ethnicityConflict} />
      <NodeChart card={card} status={status} onSelectPerson={onSelectPerson} />
      <MovementTrail card={card} />
    </div>
  )
}

// -- THE IDENTITY CARD -------------------------------------------------------

function IdentityCardPanel({
  record,
  card,
  status,
  unsealed,
  ethnicityConflict,
}: {
  record: NonNullable<ReturnType<Dataset['identityRecords']['get']>>
  card: NonNullable<ReturnType<Dataset['identityCards']['get']>>
  status: PersonStatus
  unsealed: boolean
  ethnicityConflict: Conflict | undefined
}) {
  return (
    <div style={{ padding: SPACE_16, background: PANEL_RAISED, borderRadius: RADIUS_STATIC, border: `${BORDER_WIDTH}px solid ${HAIRLINE}` }}>
      <div className="flex items-baseline" style={{ gap: SPACE_16 }} title={`Full serial: ${record.serial.value}`}>
        <p style={{ ...TYPE_DISPLAY, color: TEXT_PRIMARY }}>{record.who.fullLegalName.value}</p>
        <span className="font-mono" style={{ ...TYPE_BODY, color: TEXT_DIM }}>
          {maskedSerial(record.serial.value)}
        </span>
        <span className="flex items-center" style={{ gap: SPACE_8 }}>
          <span aria-hidden style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_COLOR[status], display: 'inline-block' }} />
          <span style={{ ...TYPE_CAPTION, color: STATUS_COLOR[status] }}>{status.toUpperCase()}</span>
        </span>
      </div>

      <div className="grid grid-cols-4" style={{ gap: SPACE_24, marginTop: SPACE_24 }}>
        <CardColumn heading="Identity">
          <FieldMetric label="Age" traced={card.identity.age} />
          <FieldMetric label="Date of birth" traced={card.identity.dateOfBirth} />
          <FieldMetric label="Sex" traced={card.identity.sex} />
          <FieldMetric
            label="Ethnicity"
            traced={card.identity.ethnicity}
            sub={`As recorded — ${card.identity.ethnicityDocument}`}
            conflict={ethnicityConflict}
          />
          <FieldMetric label="Race" traced={card.identity.race} sub={`As recorded — ${card.identity.raceDocument}`} />
          <FieldMetric label="Languages" traced={card.identity.languages} />
        </CardColumn>

        <CardColumn heading="Physical">
          <FieldMetric label="Height" traced={card.physical.height} format={(v) => `${v as number}cm`} />
          <FieldMetric label="Weight" traced={card.physical.weight} format={(v) => `${v as number}kg`} />
          <FieldMetric label="Build" traced={card.physical.build} />
          <FieldMetric label="Eye colour" traced={card.physical.eyeColour} />
          <FieldMetric label="Hair colour" traced={card.physical.hairColour} />
          <FieldMetric label="Skin tone" traced={card.physical.skinTone} />
          <FieldMetric label="Distinguishing marks" traced={card.physical.distinguishingMarks} />
        </CardColumn>

        <CardColumn heading="Medical">
          <FieldMetric label="Blood group" traced={card.medical.bloodGroup} />
          <FieldMetric label="Allergies" traced={card.medical.allergies} />
          <FieldMetric label="Medical alerts" traced={card.medical.medicalAlerts} />
          <FieldMetric label="Resting heart rate" traced={card.medical.restingHeartRate} format={(v) => `${v as number} bpm`} />
          <FieldMetric label="Acclimatisation" traced={card.medical.acclimatisation} />
          <FieldMetric label="Baseline" traced={card.medical.baseline} />
        </CardColumn>

        <CardColumn heading="Documents">
          <FieldMetric label="Passport" traced={card.documents.passportMasked} />
          <FieldMetric label="Country of origin" traced={card.documents.countryOfOrigin} />
          <FieldMetric label="Nationality on permit" traced={card.documents.nationalityOnPermit} />
          <FieldMetric label="Permit number" traced={card.documents.permitNumber} />
          <ReferenceOrSealed label="Fingerprint" unsealed={unsealed} ref_={card.documents.fingerprintRef} />
          <ReferenceOrSealed label="Dental" unsealed={unsealed} ref_={card.documents.dentalRef} />
          <ReferenceOrSealed label="DNA" unsealed={unsealed} ref_={card.documents.dnaRef} />
        </CardColumn>
      </div>

      <FooterStrip card={card} />
    </div>
  )
}

function CardColumn({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <div style={{ borderLeft: `${BORDER_WIDTH}px solid ${HAIRLINE}`, paddingLeft: SPACE_16 }}>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginBottom: SPACE_16 }}>{heading.toUpperCase()}</p>
      <div className="flex flex-col" style={{ gap: SPACE_16 }}>
        {children}
      </div>
    </div>
  )
}

function FieldMetric<T>({
  label,
  traced,
  format,
  sub,
  conflict,
}: {
  label: string
  traced: TracedValue<T>
  format?: (v: unknown) => string
  sub?: string
  conflict?: Conflict
}) {
  return (
    <div>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>{label}</p>
      <div className="flex items-center" style={{ gap: SPACE_8, marginTop: SPACE_8 }}>
        <Metric traced={traced as TracedValue<unknown>} label={label} format={format} />
        {conflict && <ConflictBadge conflict={conflict} />}
      </div>
      {sub && (
        <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>{sub}</p>
      )}
    </div>
  )
}

function ConflictBadge({ conflict }: { conflict: Conflict }) {
  const { select } = useSelection()
  const { focused, handlers } = useFocusRing()
  return (
    <button
      type="button"
      onClick={() => select({ kind: 'conflict', conflict })}
      {...handlers}
      className="pressable"
      style={{
        ...TYPE_CAPTION,
        color: HUMAN,
        border: `${BORDER_WIDTH}px solid ${HUMAN}`,
        borderRadius: RADIUS_INTERACTIVE,
        padding: `1px ${SPACE_8}px`,
        ...focusRingStyle(focused),
      }}
    >
      CONFLICT
    </button>
  )
}

function ReferenceOrSealed({ label, unsealed, ref_ }: { label: string; unsealed: boolean; ref_: { reference: TracedValue<string>; custodian: TracedValue<string> } }) {
  return (
    <div>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>{label}</p>
      {unsealed ? (
        <>
          <div style={{ marginTop: SPACE_8 }}>
            <Metric traced={ref_.reference} label={`${label} reference`} />
          </div>
          <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
            Held by: {ref_.custodian.value}
          </p>
        </>
      ) : (
        <p style={{ ...TYPE_BODY, color: TEXT_DIM, marginTop: SPACE_8 }}>Sealed — open an incident to view.</p>
      )}
    </div>
  )
}

function FooterStrip({ card }: { card: NonNullable<ReturnType<Dataset['identityCards']['get']>> }) {
  const fixAgeSec = card.footer.fixAgeSec.value
  const fixColor = fixAgeSec > 3600 ? ANOMALY : fixAgeSec > 900 ? WATCH : TEXT_PRIMARY
  return (
    <div className="flex flex-wrap items-center" style={{ gap: SPACE_24, marginTop: SPACE_24, paddingTop: SPACE_16, borderTop: `${BORDER_WIDTH}px solid ${HAIRLINE}` }}>
      <span className="font-mono" style={{ ...TYPE_BODY, color: TEXT_SECONDARY }}>
        <Metric traced={card.footer.latitude} label="Last fix latitude" format={(v) => (v as number).toFixed(4)} />
        {', '}
        <Metric traced={card.footer.longitude} label="Last fix longitude" format={(v) => (v as number).toFixed(4)} />
      </span>
      <Metric traced={card.footer.resolvedPlace} label="Resolved place" />
      <Metric traced={card.footer.altitudeM} label="Altitude" format={(v) => `${v as number}m`} />
      <span style={{ color: fixColor }}>
        <Metric traced={card.footer.fixAgeSec} label="Age of last fix" format={(v) => `${formatFixAge(v as number)} old`} />
      </span>
      <Metric traced={card.footer.fixSource} label="Fix source" />
    </div>
  )
}

function formatFixAge(seconds: number): string {
  if (seconds < 90) return `${seconds}s`
  return `${(seconds / 60).toFixed(1)}m`
}

// -- THE NODE CHART -----------------------------------------------------------

const CHART_WIDTH = 900
const CHART_HEIGHT = 420
const CENTER = { x: CHART_WIDTH / 2, y: CHART_HEIGHT / 2 - 20 }
const ORBIT_RADIUS = 150

function NodeChart({
  card,
  status,
  onSelectPerson,
}: {
  card: NonNullable<ReturnType<Dataset['identityCards']['get']>>
  status: PersonStatus
  onSelectPerson: (climberId: string) => void
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const associates = card.associates
  const n = associates.length || 1

  const positioned = associates.map((a, i) => {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2
    return { ...a, x: CENTER.x + Math.cos(angle) * ORBIT_RADIUS, y: CENTER.y + Math.sin(angle) * ORBIT_RADIUS }
  })

  function dimmed(id: string) {
    return hoveredId !== null && hoveredId !== id
  }

  return (
    <div style={{ marginTop: SPACE_32 }}>
      <div className="flex items-center justify-between">
        <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>KNOWN ASSOCIATES</p>
        <div className="flex items-center" style={{ gap: SPACE_16 }}>
          <Legend swatch="solid" label="Present — this ascent" />
          <Legend swatch="dashed" label="Past — prior expeditions" />
        </div>
      </div>
      <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} width="100%" height={CHART_HEIGHT} role="img" aria-label="Known associates node chart">
        {positioned.map((a) => (
          <line
            key={`edge-${a.id}`}
            x1={CENTER.x}
            y1={CENTER.y}
            x2={a.x}
            y2={a.y}
            stroke={nodeVisual(a.status).fill}
            strokeWidth={1.5}
            strokeDasharray={edgeDashArray(a.when)}
            opacity={dimmed(a.id) ? DEPENDENCY_DIM_OPACITY : 0.6}
            style={{ transition: `opacity ${dimmed(a.id) ? MOTION_DEPENDENCY_DIM_MS : MOTION_DEPENDENCY_RESTORE_MS}ms var(--cr-ease-out)` }}
          />
        ))}
        <SelectedNode status={status} />
        {positioned.map((a) => (
          <AssociateNode
            key={a.id}
            associate={a}
            x={a.x}
            y={a.y}
            dimmed={dimmed(a.id)}
            onHover={(hovered) => setHoveredId(hovered ? a.id : null)}
            onSelectPerson={onSelectPerson}
          />
        ))}
      </svg>
    </div>
  )
}

function Legend({ swatch, label }: { swatch: 'solid' | 'dashed'; label: string }) {
  return (
    <span className="flex items-center" style={{ gap: SPACE_8, ...TYPE_CAPTION, color: TEXT_DIM, textTransform: 'none', letterSpacing: 'normal' }}>
      <svg width={20} height={4} aria-hidden>
        <line x1={0} y1={2} x2={20} y2={2} stroke={TEXT_DIM} strokeWidth={1.5} strokeDasharray={swatch === 'dashed' ? '4 4' : undefined} />
      </svg>
      {label}
    </span>
  )
}

function SelectedNode({ status }: { status: PersonStatus }) {
  const visual = nodeVisual(status)
  const r = 32
  return (
    <g>
      {visual.ring && <circle cx={CENTER.x} cy={CENTER.y} r={r + 5} fill="none" stroke={visual.ring} strokeWidth={3} />}
      <circle cx={CENTER.x} cy={CENTER.y} r={r} fill={visual.fill} opacity={0.9} />
      <text x={CENTER.x} y={CENTER.y + 50} textAnchor="middle" fill={TEXT_PRIMARY} fontSize={11}>
        Selected
      </text>
    </g>
  )
}

function AssociateNode({
  associate,
  x,
  y,
  dimmed,
  onHover,
  onSelectPerson,
}: {
  associate: Associate
  x: number
  y: number
  dimmed: boolean
  onHover: (hovered: boolean) => void
  onSelectPerson: (climberId: string) => void
}) {
  const r = 10 + associate.strength * 18
  const clickable = associate.kind === 'rope_partner' && associate.climberId
  const visual = nodeVisual(associate.status)
  return (
    <g
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onClick={() => clickable && onSelectPerson(associate.climberId!)}
      style={{ cursor: clickable ? 'pointer' : 'default', opacity: dimmed ? DEPENDENCY_DIM_OPACITY : 1, transition: `opacity ${dimmed ? MOTION_DEPENDENCY_DIM_MS : MOTION_DEPENDENCY_RESTORE_MS}ms var(--cr-ease-out)` }}
    >
      {visual.ring && <circle cx={x} cy={y} r={r + 4} fill="none" stroke={visual.ring} strokeWidth={2} />}
      <circle cx={x} cy={y} r={r} fill={visual.fill} opacity={associate.when === 'past' ? 0.5 : 0.85} />
      <text x={x} y={y + r + 14} textAnchor="middle" fill={TEXT_SECONDARY} fontSize={10}>
        {associate.label.length > 18 ? `${associate.label.slice(0, 17)}…` : associate.label}
      </text>
      <title>
        {associate.label} — {associate.kind.replace('_', ' ')} ({associate.when})
      </title>
    </g>
  )
}

// -- MOVEMENT TRAIL -----------------------------------------------------------

function MovementTrail({ card }: { card: NonNullable<ReturnType<Dataset['identityCards']['get']>> }) {
  return (
    <div style={{ marginTop: SPACE_32 }}>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>MOVEMENT TRAIL</p>
      <div className="flex items-start" style={{ marginTop: SPACE_16, gap: SPACE_8 }}>
        {card.trail.map((stop, i) => (
          <div key={stop.camp} className="flex flex-1 flex-col items-center">
            <div className="flex w-full items-center">
              {i > 0 && <div style={{ flex: 1, height: BORDER_WIDTH, background: card.trail[i - 1].reached ? TEXT_SECONDARY : HAIRLINE }} />}
              <span
                aria-hidden
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  flexShrink: 0,
                  background: stop.anomaly ? ANOMALY : stop.reached ? TEXT_PRIMARY : 'transparent',
                  border: `${BORDER_WIDTH * 2}px solid ${stop.anomaly ? ANOMALY : stop.reached ? TEXT_PRIMARY : HAIRLINE}`,
                }}
              />
              {i < card.trail.length - 1 && <div style={{ flex: 1, height: BORDER_WIDTH, background: stop.reached ? TEXT_SECONDARY : HAIRLINE }} />}
            </div>
            <p style={{ ...TYPE_CAPTION, color: stop.isCurrent ? TEXT_PRIMARY : TEXT_DIM, marginTop: SPACE_8, textAlign: 'center' }}>{stop.camp}</p>
            <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal', textAlign: 'center' }}>
              {stop.reached ? `${stop.dateIso} · ${stop.altitudeM}m · ${stop.durationHeld}` : `${stop.altitudeM}m`}
            </p>
            {stop.sharedWithAssociateIds.length > 0 && (
              <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal', textAlign: 'center' }}>
                shared with {stop.sharedWithAssociateIds.length}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
