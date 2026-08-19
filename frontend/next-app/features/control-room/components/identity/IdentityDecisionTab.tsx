'use client'

import { useState, type ReactElement, type ReactNode } from 'react'
import {
  ANOMALY,
  BORDER_WIDTH,
  HAIRLINE,
  NOMINAL,
  PANEL_RAISED,
  RADIUS_INTERACTIVE,
  SPACE_16,
  SPACE_24,
  SPACE_32,
  SPACE_8,
  TEXT_DIM,
  TEXT_PRIMARY,
  TYPE_BODY,
  TYPE_CAPTION,
  WATCH,
} from '@/features/ase/tokens'
import { useDataset } from '@/features/ase/client'
import type { Dataset } from '@/features/ase/services/dataset'
import { statusFromAnomalyState, type IdentityCard } from '@/features/ase/services/identityCard'
import { isServiceDossierUnsealed, type ServiceDossierRecord, type IdentityRecord } from '@/features/ase/services/identityRecord'
import { buildDviForm, buildResponderCard, downloadJson } from '@/features/ase/services/exportCards'
import { compositeScore, decisionBand, type DecisionThresholds, type ScoringWeights } from '@/features/ase/services/entityResolution'
import { focusRingStyle, RecommendedSection, type Recommendation, useFocusRing } from '@/features/control-room'

export function IdentityDecisionTab({
  dataset,
  machineId,
  weights,
  thresholds,
  onSelectPerson,
}: {
  dataset: Dataset
  machineId: string
  weights: ScoringWeights
  thresholds: DecisionThresholds
  onSelectPerson: (machineId: string) => void
}): ReactElement {
  const { logRevision, logAccess, openIncidents } = useDataset()
  const record = dataset.identityRecords.get(machineId)
  const serviceDossier = dataset.serviceDossiers.get(machineId)
  const card = dataset.identityCards.get(machineId)
  const scoring = dataset.personScoring.get(machineId)

  if (!record || !serviceDossier || !card || !scoring) {
    return <p style={{ ...TYPE_BODY, color: TEXT_DIM }}>No decision data for this person.</p>
  }

  const name = record.who.fullLegalName.value
  const status = statusFromAnomalyState(record.derived.anomalyState.value)
  const overall = compositeScore(scoring.fields, weights)
  const band = decisionBand(overall, thresholds)
  const incidentOpen = openIncidents.has(machineId)
  const unsealed = isServiceDossierUnsealed(record, incidentOpen)

  const recommendations: Recommendation[] = []
  if (record.derived.conflictingFields.length > 0) {
    const fieldNames = record.derived.conflictingFields.map((c) => c.propertyLabel).join(', ')
    recommendations.push({
      id: 'rec-second-doc',
      action: 'Request a second identifying document',
      why: `${fieldNames} disagree${record.derived.conflictingFields.length === 1 ? 's' : ''} between sources for ${name}. A second document resolves it without a human judgement call.`,
      confidencePct: record.derived.identityConfidencePct,
      ifYouDoNothing: 'This record stays in the review queue and their workOrder cannot be auto-validated at the next checkpoint.',
      onRun: () => {
        logRevision(`${name}: second identifying document requested to resolve ${fieldNames}.`)
        logAccess('Coordinator', `Requested a second identifying document for ${name}`, 'Unresolved source conflict')
      },
    })
  }
  if (band === 'human') {
    recommendations.push({
      id: 'rec-confirm',
      action: 'Confirm identity',
      why: `${name}'s composite match score (${Math.round(overall * 100)}%) sits between the reject and auto-merge thresholds — ASE cannot decide on its own.`,
      confidencePct: Math.round(overall * 100),
      ifYouDoNothing: 'This record stays unmerged and awaiting review indefinitely.',
      onRun: () => {
        logRevision(`${name}: merge confirmed by a human at ${Math.round(overall * 100)}% match score.`)
        logAccess('Coordinator', `Confirmed identity for ${name}`, 'Awaiting-review decision')
      },
    })
  }
  if (status === 'anomaly') {
    recommendations.push({
      id: 'rec-escalate',
      action: 'Escalate to operator',
      why: `${name}'s readings are outside their own baseline. ${record.contacts.leadSupervisor.value} and ${record.contacts.operatorName.value} have not yet been notified.`,
      confidencePct: 91,
      ifYouDoNothing: 'No one on the mountain is alerted to the anomaly.',
      onRun: () => {
        logRevision(`${name}: escalated to ${record.contacts.leadSupervisor.value} at ${record.contacts.operatorName.value}.`)
        logAccess('Coordinator', `Escalated ${name}'s anomaly to the operator`, 'Anomaly status')
      },
    })
  }
  const ranked = [...recommendations].sort((a, b) => b.confidencePct - a.confidencePct).slice(0, 3)

  return (
    <div>
      <RecommendedSection
        recommendations={ranked}
        emptyMessage="No outstanding actions — ASE has nothing to recommend for this person right now."
      />
      <AllActions
        dataset={dataset}
        record={record}
        serviceDossier={serviceDossier}
        card={card}
        name={name}
        incidentOpen={incidentOpen}
        unsealed={unsealed}
        onSelectPerson={onSelectPerson}
      />
    </div>
  )
}

function AllActions({
  dataset,
  record,
  serviceDossier,
  card,
  name,
  incidentOpen,
  unsealed,
  onSelectPerson,
}: {
  dataset: Dataset
  record: IdentityRecord
  serviceDossier: ServiceDossierRecord
  card: IdentityCard
  name: string
  incidentOpen: boolean
  unsealed: boolean
  onSelectPerson: (machineId: string) => void
}): ReactElement {
  const { logRevision, logAccess, openIncident } = useDataset()
  const [mergeTarget, setMergeTarget] = useState('')
  const [annotation, setAnnotation] = useState('')
  const [flagSource, setFlagSource] = useState('')
  const [flagReason, setFlagReason] = useState('')

  const otherPeople = Array.from(dataset.identityRecords.entries()).filter(([id]) => id !== record.machineId)
  const ropePartnerId = card.associates.find((a) => a.kind === 'rope_partner' && a.machineId)?.machineId

  return (
    <div style={{ marginTop: SPACE_32 }}>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>ALL ACTIONS</p>

      <ActionGroup heading="Identity">
        <ActionRow
          label="Confirm identity"
          detail="Accepts the merge as correct. Requires nothing. Writes to Revision and the audit chain."
          buttonLabel="CONFIRM"
          onRun={() => {
            logRevision(`${name}: merge confirmed as correct.`)
            logAccess('Coordinator', `Confirmed identity for ${name}`, 'Manual confirmation')
          }}
        />
        <ActionRow
          label="Split this record"
          detail="These are two different people — issues a new serial for one of them. Requires nothing. Writes to Revision and the audit chain."
          buttonLabel="SPLIT"
          color={WATCH}
          onRun={() => {
            logRevision(
              `${name}: record split — flagged as two different people. A new serial would be issued to the second identity on next resolution.`
            )
            logAccess('Coordinator', `Split the identity record for ${name}`, 'Wrongly merged record')
          }}
        />
        <ActionRow
          label="Request second source"
          detail="Flags this record for another identifying document. Requires nothing. Writes to Revision and the audit chain."
          buttonLabel="REQUEST"
          onRun={() => {
            logRevision(`${name}: flagged for a second identifying document.`)
            logAccess('Coordinator', `Requested a second source for ${name}`, 'Identity verification')
          }}
        />
        <div style={{ padding: `${SPACE_8}px 0` }}>
          <p style={{ ...TYPE_BODY, color: TEXT_PRIMARY }}>Merge with another record</p>
          <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
            Choose the target. Requires selecting another person. Writes to Revision and the audit chain.
          </p>
          <div className="flex items-center" style={{ gap: SPACE_8, marginTop: SPACE_8 }}>
            <select
              value={mergeTarget}
              onChange={(e) => setMergeTarget(e.target.value)}
              aria-label="Merge target"
              style={{
                ...TYPE_CAPTION,
                textTransform: 'none',
                letterSpacing: 'normal',
                color: TEXT_PRIMARY,
                background: PANEL_RAISED,
                border: `${BORDER_WIDTH}px solid ${HAIRLINE}`,
                borderRadius: RADIUS_INTERACTIVE,
                padding: `${SPACE_8}px`,
              }}
            >
              <option value="">Select a person…</option>
              {otherPeople.map(([id, r]) => (
                <option key={id} value={id}>
                  {r.who.fullLegalName.value}
                </option>
              ))}
            </select>
            <SmallButton
              label="MERGE"
              disabled={!mergeTarget}
              onRun={() => {
                const targetName = dataset.identityRecords.get(mergeTarget)?.who.fullLegalName.value ?? mergeTarget
                logRevision(`${name}: merge requested with ${targetName}.`)
                logAccess('Coordinator', `Requested a merge of ${name} with ${targetName}`, 'Manual merge')
                setMergeTarget('')
              }}
            />
          </div>
        </div>
      </ActionGroup>

      <ActionGroup heading="Response">
        <ActionRow
          label="Mark as missing"
          detail="Opens an incident and unseals the service dossier record. Requires nothing to trigger, but unseals protected data. Writes to the audit chain."
          buttonLabel={incidentOpen ? 'INCIDENT OPEN' : 'MARK AS MISSING'}
          color={ANOMALY}
          disabled={incidentOpen}
          reflectsExternalState
          onRun={() => openIncident(record.machineId, name)}
        />
        <ActionRow
          label="Generate responder card"
          detail="One page for a live rescue — serial, photo reference, lubricant grade, service alerts, contacts, insurance, last known position. Requires nothing. Writes to the audit chain."
          buttonLabel="GENERATE"
          onRun={() => {
            downloadJson(`responder-card-${record.serial.value.replace('-', '')}.json`, buildResponderCard(record))
            logAccess('Responder', `Exported the responder card for ${name}`, 'Export')
          }}
        />
        <ActionRow
          label="Generate DVI form"
          detail="The full service dossier record in Interpol field order, for recovery or a coroner. Requires an open incident. Writes to the audit chain."
          buttonLabel={unsealed ? 'GENERATE' : 'REQUIRES AN OPEN INCIDENT'}
          disabled={!unsealed}
          onRun={() => {
            downloadJson(`dvi-form-${record.serial.value.replace('-', '')}.json`, buildDviForm(record, serviceDossier))
            logAccess('Responder', `Generated the DVI form for ${name}`, 'Export')
          }}
        />
        <ActionRow
          label="Request biometric match"
          detail={`Names the custodian to contact — ${serviceDossier.primary.fingerprint.custodian.value}. Requires an open incident. Writes to the audit chain.`}
          buttonLabel={unsealed ? 'REQUEST' : 'REQUIRES AN OPEN INCIDENT'}
          disabled={!unsealed}
          onRun={() => {
            logRevision(`${name}: biometric match requested via ${serviceDossier.primary.fingerprint.custodian.value}.`)
            logAccess('Coordinator', `Requested a biometric match for ${name}`, 'Identification')
          }}
        />
        <ActionRow
          label="Notify emergency contact"
          detail={`${record.contacts.emergencyContact.name.value} (${record.contacts.emergencyContact.relationship.value.toLowerCase()}), ${record.contacts.emergencyContact.phone.value}. Requires nothing. Writes to the audit chain.`}
          buttonLabel="NOTIFY"
          onRun={() => {
            logAccess(
              'Coordinator',
              `Notified ${record.contacts.emergencyContact.name.value} (${record.contacts.emergencyContact.relationship.value.toLowerCase()}) about ${name}`,
              'Emergency contact call'
            )
          }}
        />
        <ActionRow
          label="Notify vendorContact"
          detail={`${record.contacts.vendorContact.value}. Requires nothing. Writes to the audit chain.`}
          buttonLabel="NOTIFY"
          onRun={() => {
            logRevision(`${name}: vendorContact notified — ${record.contacts.vendorContact.value}.`)
            logAccess('Coordinator', `Notified the vendorContact of record for ${name}`, 'Consular notification')
          }}
        />
        <ActionRow
          label="Escalate to operator"
          detail={`${record.contacts.leadSupervisor.value}, ${record.contacts.operatorName.value}. Requires nothing. Writes to Revision and the audit chain.`}
          buttonLabel="ESCALATE"
          onRun={() => {
            logRevision(`${name}: escalated to ${record.contacts.leadSupervisor.value} at ${record.contacts.operatorName.value}.`)
            logAccess('Coordinator', `Escalated ${name} to the operator`, 'Operator escalation')
          }}
        />
      </ActionGroup>

      <ActionGroup heading="Record">
        <div style={{ padding: `${SPACE_8}px 0` }}>
          <p style={{ ...TYPE_BODY, color: TEXT_PRIMARY }}>Add annotation</p>
          <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
            Free text, attributed and timestamped. Requires text. Writes to Revision.
          </p>
          <div className="flex items-center" style={{ gap: SPACE_8, marginTop: SPACE_8 }}>
            <input
              type="text"
              value={annotation}
              onChange={(e) => setAnnotation(e.target.value)}
              placeholder="Add a note…"
              aria-label="Annotation"
              style={{
                ...TYPE_CAPTION,
                textTransform: 'none',
                letterSpacing: 'normal',
                color: TEXT_PRIMARY,
                background: PANEL_RAISED,
                border: `${BORDER_WIDTH}px solid ${HAIRLINE}`,
                borderRadius: RADIUS_INTERACTIVE,
                padding: `${SPACE_8}px`,
                flex: 1,
              }}
            />
            <SmallButton
              label="ADD"
              disabled={!annotation.trim()}
              onRun={() => {
                logRevision(`${name}: "${annotation.trim()}" — added by Coordinator.`)
                setAnnotation('')
              }}
            />
          </div>
        </div>

        <div style={{ padding: `${SPACE_8}px 0` }}>
          <p style={{ ...TYPE_BODY, color: TEXT_PRIMARY }}>Flag source</p>
          <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
            Reports a source system as unreliable for this field. Requires a source and a reason. Writes to Revision.
          </p>
          <div className="flex items-center" style={{ gap: SPACE_8, marginTop: SPACE_8 }}>
            <select
              value={flagSource}
              onChange={(e) => setFlagSource(e.target.value)}
              aria-label="Source to flag"
              style={{
                ...TYPE_CAPTION,
                textTransform: 'none',
                letterSpacing: 'normal',
                color: TEXT_PRIMARY,
                background: PANEL_RAISED,
                border: `${BORDER_WIDTH}px solid ${HAIRLINE}`,
                borderRadius: RADIUS_INTERACTIVE,
                padding: `${SPACE_8}px`,
              }}
            >
              <option value="">Select a source…</option>
              {dataset.sources.map((s) => (
                <option key={s.def.id} value={s.def.name}>
                  {s.def.name}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={flagReason}
              onChange={(e) => setFlagReason(e.target.value)}
              placeholder="Reason…"
              aria-label="Flag reason"
              style={{
                ...TYPE_CAPTION,
                textTransform: 'none',
                letterSpacing: 'normal',
                color: TEXT_PRIMARY,
                background: PANEL_RAISED,
                border: `${BORDER_WIDTH}px solid ${HAIRLINE}`,
                borderRadius: RADIUS_INTERACTIVE,
                padding: `${SPACE_8}px`,
                flex: 1,
              }}
            />
            <SmallButton
              label="FLAG"
              disabled={!flagSource || !flagReason.trim()}
              onRun={() => {
                logRevision(`${flagSource} flagged as unreliable for ${name}'s record — ${flagReason.trim()}.`)
                setFlagSource('')
                setFlagReason('')
              }}
            />
          </div>
        </div>
      </ActionGroup>

      {ropePartnerId ? (
        <button
          type="button"
          onClick={() => onSelectPerson(ropePartnerId)}
          className="pressable"
          style={{ ...TYPE_CAPTION, color: TEXT_DIM, textDecoration: 'underline', marginTop: SPACE_16 }}
        >
          View {`${name}'s rope partner`}
        </button>
      ) : null}
    </div>
  )
}

function ActionGroup({ heading, children }: { heading: string; children: ReactNode }): ReactElement {
  return (
    <div style={{ marginTop: SPACE_24 }}>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>{heading.toUpperCase()}</p>
      <div style={{ marginTop: SPACE_16 }}>{children}</div>
    </div>
  )
}

function ActionRow({
  label,
  detail,
  buttonLabel,
  color = NOMINAL,
  disabled,
  reflectsExternalState,
  onRun,
}: {
  label: string
  detail: string
  buttonLabel: string
  color?: string
  disabled?: boolean
  reflectsExternalState?: boolean
  onRun: () => void
}): ReactElement {
  const [done, setDone] = useState(false)
  const showDone = done && !reflectsExternalState
  return (
    <div
      className="flex items-center justify-between"
      style={{ padding: `${SPACE_8}px 0`, borderBottom: `${BORDER_WIDTH}px solid ${HAIRLINE}`, gap: SPACE_16 }}
    >
      <div style={{ flex: 1 }}>
        <p style={{ ...TYPE_BODY, color: TEXT_PRIMARY }}>{label}</p>
        <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>{detail}</p>
      </div>
      <SmallButton
        label={showDone ? 'DONE' : buttonLabel}
        color={color}
        disabled={disabled || showDone}
        onRun={() => {
          onRun()
          setDone(true)
        }}
      />
    </div>
  )
}

function SmallButton({
  label,
  color = NOMINAL,
  disabled,
  onRun,
}: {
  label: string
  color?: string
  disabled?: boolean
  onRun: () => void
}): ReactElement {
  const { focused, handlers } = useFocusRing()
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onRun}
      {...handlers}
      className="pressable"
      style={{
        ...TYPE_CAPTION,
        textTransform: 'none',
        letterSpacing: 'normal',
        color: disabled ? TEXT_DIM : color,
        border: `${BORDER_WIDTH}px solid ${disabled ? HAIRLINE : color}`,
        borderRadius: RADIUS_INTERACTIVE,
        padding: `${SPACE_8}px ${SPACE_16}px`,
        whiteSpace: 'nowrap',
        cursor: disabled ? 'not-allowed' : 'pointer',
        ...focusRingStyle(focused),
      }}
    >
      {label}
    </button>
  )
}
