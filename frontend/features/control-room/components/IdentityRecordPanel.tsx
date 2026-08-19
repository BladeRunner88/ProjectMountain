'use client'

import { useEffect, useState, Children, type CSSProperties, type ReactElement, type ReactNode } from 'react'
import type { Route } from 'next'
import Link from 'next/link'
import {
  BADGE_PADDING_V,
  BORDER_WIDTH,
  HAIRLINE,
  HUMAN,
  ICON_SIZE_SM,
  PANEL_RAISED,
  RADIUS_INTERACTIVE,
  RADIUS_STATIC,
  SPACE_16,
  SPACE_24,
  SPACE_8,
  TEXT_DIM,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  TYPE_BODY,
  TYPE_CAPTION,
  WATCH,
} from '@/features/ase/tokens'
import { useDataset, type AuditEntry } from '@/features/ase/client'
import { confidence } from '@/features/ase/services/folds'
import { maskedSerial } from '@/features/ase/services/serial'
import { buildDviForm, buildResponderCard, downloadJson } from '@/features/ase/services/exportCards'
import { isServiceDossierUnsealed, type ServiceDossierRecord, type ContactInfo, type IdentityRecord } from '@/features/ase/services/identityRecord'
import type { TracedValue } from '@/features/ase/services/traced'
import { tabHref } from '../types/tabs'
import { useFocusRing } from '../hooks/useFocusRing'
import { focusRingStyle } from '../services/focusRing'

export function IdentityRecordPanel({ machineId }: { machineId: string }): ReactElement {
  const { dataset, openIncidents, openIncident, logAccess, auditLog } = useDataset()
  const record = dataset.identityRecords.get(machineId)
  const serviceDossier = dataset.serviceDossiers.get(machineId)
  const isAnomaly = record ? record.derived.anomalyState.value.startsWith('Anomaly') : false
  const incidentOpen = openIncidents.has(machineId)
  const unsealed = record ? isServiceDossierUnsealed(record, incidentOpen) : false
  const fullName = record?.who.fullLegalName.value

  useEffect(() => {
    if (!unsealed || !fullName) return
    logAccess('Responder', `Viewed the service dossier record for ${fullName}`, isAnomaly ? 'Anomaly status' : 'Incident open')
  }, [machineId, unsealed, fullName, isAnomaly, logAccess])

  if (!record || !serviceDossier) {
    return <p style={{ ...TYPE_BODY, color: TEXT_DIM }}>No identity record for this machine.</p>
  }

  return (
    <div>
      <div
        style={{
          marginBottom: SPACE_16,
          paddingBottom: SPACE_16,
          borderBottom: `${BORDER_WIDTH}px solid ${HAIRLINE}`,
        }}
      >
        <div className="flex items-center" style={{ gap: SPACE_8, flexWrap: 'wrap' }}>
          <p style={{ ...TYPE_BODY, color: TEXT_PRIMARY, fontWeight: 600 }}>{record.who.fullLegalName.value}</p>
          <span
            className="font-mono"
            style={{
              ...TYPE_CAPTION,
              color: TEXT_SECONDARY,
              background: PANEL_RAISED,
              border: `${BORDER_WIDTH}px solid ${HAIRLINE}`,
              borderRadius: RADIUS_INTERACTIVE,
              padding: `${BADGE_PADDING_V}px ${SPACE_8}px`,
            }}
          >
            {maskedSerial(record.serial.value)}
          </span>
        </div>
        <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
          This record exists so a person can be identified and treated in an emergency. Full serial required for any lookup,
          merge or export — the last four digits are a shorthand, never a global identifier.
        </p>
        {record.serialCollided ? (
          <p style={{ ...TYPE_CAPTION, color: WATCH, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
            This serial&apos;s BBB collided with another machine&apos;s on issue — resolved by increment. See MODEL / FACTS for the count.
          </p>
        ) : null}
      </div>

      <Section heading="Who this is" defaultOpen>
        <FieldRow label="Serial" traced={record.serial} />
        <FieldRow label="Known as" traced={record.who.knownAs} />
        <FieldRow label="Date of birth" traced={record.who.dateOfBirth} />
        <FieldRow label="Sex" traced={record.who.sex} />
        <FieldRow label="Country of origin" traced={record.who.countryOfOrigin} />
        <FieldRow label="Nationality on workOrder" traced={record.who.nationalityOnWorkOrder} />
        <FieldRow label="Passport" traced={record.who.passportMasked} />
        <FieldRow label="WorkOrder number" traced={record.who.workOrderNumber} />
        <FieldRow label="Photograph reference" traced={record.who.photographReference} />
        <FieldRow label="Languages spoken" traced={record.who.languagesSpoken} />
      </Section>

      <Section heading="What a responder needs" defaultOpen>
        <FieldRow label="Lubricant grade" traced={record.responder.lubricantGrade} accessLogged />
        <FieldRow label="Known allergies" traced={record.responder.knownAllergies} accessLogged />
        <FieldRow label="Service alerts" traced={record.responder.serviceAlerts} accessLogged />
        <FieldRow label="Height" traced={record.responder.heightCm} format={(v) => `${v}cm`} />
        <FieldRow label="Distinguishing features" traced={record.responder.distinguishingFeatures} />
        <FieldRow label="Current station" traced={record.responder.currentStation} />
        <FieldRow label="Last known position" traced={record.responder.lastKnownPosition} />
        <FieldRow label="Insurance policy" traced={record.responder.insurancePolicy} />
        <FieldRow label="Evacuation cover" traced={record.responder.evacuationCover} />
        <FieldRow label="Evacuation preference" traced={record.responder.evacuationPreference} />
        <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
          Lubricant grade and service alerts are health data. In production they&apos;re stored encrypted, visible only to the responder
          role, and every access is written to the audit chain.
        </p>
      </Section>

      <Section heading="Who to contact">
        <ContactBlock heading="Emergency contact" contact={record.contacts.emergencyContact} />
        <ContactBlock heading="Second contact" contact={record.contacts.secondContact} />
        <FieldRow label="Operator" traced={record.contacts.operatorName} />
        <FieldRow label="Lead guide" traced={record.contacts.leadSupervisor} />
        <FieldRow label="Lead guide phone" traced={record.contacts.leadSupervisorPhone} />
        <FieldRow label="Operator phone" traced={record.contacts.operatorPhone} />
        {record.contacts.pairedMachineSerials.map((tv, i) => (
          <FieldRow key={i} label="Rope partner (by serial)" traced={tv} />
        ))}
        <FieldRow label="VendorContact / consulate" traced={record.contacts.vendorContact} />
      </Section>

      <Section heading="Derived, not entered">
        <DerivedRow
          label="Source records merged"
          value={record.derived.sourceRecordsMerged.value}
          href={`${tabHref('identity')}?sub=method`}
        />
        <DerivedRow label="Identity confidence" value={`${record.derived.identityConfidencePct}%`} />
        <DerivedRow label="Conflicting fields (S9.4)" value={record.derived.conflictingFields.length} />
        <DerivedRow label="Prior campaigns" value={record.derived.priorCampaigns.value} />
        <DerivedRow label="Anomaly state" value={record.derived.anomalyState.value} />
      </Section>

      <ServiceDossierSection
        record={record}
        serviceDossier={serviceDossier}
        unsealed={unsealed}
        incidentOpen={incidentOpen}
        onOpenIncident={() => openIncident(machineId, record.who.fullLegalName.value)}
        auditEntries={auditLog.filter((a) => a.what.includes(record.who.fullLegalName.value))}
      />

      <ExportButtons
        record={record}
        serviceDossier={serviceDossier}
        incidentOpen={incidentOpen}
        onExport={(what) => logAccess('Responder', what, 'Export')}
      />
    </div>
  )
}

function Section({ heading, children, defaultOpen = false }: { heading: string; children: ReactNode; defaultOpen?: boolean }): ReactElement {
  const [open, setOpen] = useState(defaultOpen)
  const count = Children.count(children)
  const { focused, handlers } = useFocusRing()

  return (
    <div style={{ marginTop: SPACE_24 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        {...handlers}
        className="pressable flex w-full items-center justify-between"
        style={{ ...TYPE_CAPTION, color: TEXT_DIM, cursor: 'pointer', ...focusRingStyle(focused) }}
      >
        <span className="flex items-center" style={{ gap: SPACE_8 }}>
          {heading.toUpperCase()}
          <span style={{ color: TEXT_DIM, opacity: 0.6 }}>{count}</span>
        </span>
        <Chevron open={open} />
      </button>
      {open ? <div style={{ marginTop: SPACE_8 }}>{children}</div> : null}
    </div>
  )
}

function Badge({ label, color }: { label: string; color: string }): ReactElement {
  return (
    <span
      style={{
        ...TYPE_CAPTION,
        color,
        border: `${BORDER_WIDTH}px solid ${color}`,
        borderRadius: RADIUS_INTERACTIVE,
        padding: `${BADGE_PADDING_V}px ${SPACE_8}px`,
        flexShrink: 0,
      }}
    >
      {label}
    </span>
  )
}

function Chevron({ open }: { open: boolean }): ReactElement {
  return (
    <svg
      viewBox="0 0 20 20"
      width={ICON_SIZE_SM}
      height={ICON_SIZE_SM}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transform: open ? 'rotate(180deg)' : undefined, flexShrink: 0 }}
    >
      <path d="M5 7.5L10 12.5L15 7.5" />
    </svg>
  )
}

function FieldRow<T>({
  label,
  traced,
  format,
  accessLogged,
}: {
  label: string
  traced: TracedValue<T>
  format?: (v: T) => string
  accessLogged?: boolean
}): ReactElement {
  const conf = confidence(traced as TracedValue<unknown>)
  const text = format ? format(traced.value) : String(traced.value)
  return (
    <div style={{ paddingTop: SPACE_8, paddingBottom: SPACE_8, borderBottom: `${BORDER_WIDTH}px solid ${HAIRLINE}` }}>
      <div className="flex items-center justify-between" style={{ gap: SPACE_8 }}>
        <span style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>{label}</span>
        <span className="flex items-center" style={{ gap: SPACE_8, flexShrink: 0 }}>
          <span style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>{Math.round(conf * 100)}%</span>
          {accessLogged ? <Badge label="ACCESS LOGGED" color={HUMAN} /> : null}
        </span>
      </div>
      <p style={{ ...TYPE_BODY, color: TEXT_PRIMARY, marginTop: SPACE_8 }}>{text}</p>
    </div>
  )
}

function DerivedRow({ label, value, href }: { label: string; value: string | number; href?: Route }): ReactElement {
  return (
    <div
      className="flex items-center justify-between"
      style={{ paddingTop: SPACE_8, paddingBottom: SPACE_8, borderBottom: `${BORDER_WIDTH}px solid ${HAIRLINE}` }}
    >
      <span style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>{label}</span>
      {href ? (
        <Link href={href} style={{ ...TYPE_BODY, color: TEXT_PRIMARY, textDecoration: 'underline' }}>
          {value}
        </Link>
      ) : (
        <span style={{ ...TYPE_BODY, color: TEXT_PRIMARY }}>{value}</span>
      )}
    </div>
  )
}

function ContactBlock({ heading, contact }: { heading: string; contact: ContactInfo }): ReactElement {
  return (
    <div style={{ marginBottom: SPACE_16 }}>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, textTransform: 'none', letterSpacing: 'normal', marginBottom: SPACE_8 }}>
        {heading}
      </p>
      <FieldRow label="Name" traced={contact.name} />
      <FieldRow label="Relationship" traced={contact.relationship} />
      <FieldRow label="Phone" traced={contact.phone} />
      <FieldRow label="Country" traced={contact.country} />
    </div>
  )
}

function ServiceDossierSection({
  record,
  serviceDossier,
  unsealed,
  incidentOpen,
  onOpenIncident,
  auditEntries,
}: {
  record: IdentityRecord
  serviceDossier: ServiceDossierRecord
  unsealed: boolean
  incidentOpen: boolean
  onOpenIncident: () => void
  auditEntries: AuditEntry[]
}): ReactElement {
  const { focused, handlers } = useFocusRing()

  return (
    <div
      style={{
        marginTop: SPACE_24,
        padding: SPACE_16,
        background: PANEL_RAISED,
        borderRadius: RADIUS_STATIC,
        border: `${BORDER_WIDTH}px solid ${HAIRLINE}`,
      }}
    >
      <div className="flex items-center justify-between" style={{ gap: SPACE_8 }}>
        <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>ANTE-MORTEM RECORD (INTERPOL DVI)</p>
        <Badge label={unsealed ? 'ACCESS LOGGED' : 'SEALED'} color={unsealed ? HUMAN : WATCH} />
      </div>
      <p style={{ ...TYPE_BODY, color: TEXT_PRIMARY, marginTop: SPACE_8 }}>{record.who.fullLegalName.value}</p>

      {!unsealed ? (
        <div style={{ marginTop: SPACE_8 }}>
          <p style={{ ...TYPE_BODY, color: TEXT_SECONDARY }}>
            Visible only to the responder role, and only when this person&apos;s status is anomaly or missing, or when a coordinator
            opens an incident.
          </p>
          <button
            type="button"
            onClick={onOpenIncident}
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
              marginTop: SPACE_16,
              ...focusRingStyle(focused),
            }}
          >
            OPEN INCIDENT
          </button>
        </div>
      ) : (
        <div style={{ marginTop: SPACE_8 }}>
          {incidentOpen ? (
            <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginBottom: SPACE_8 }}>Incident open by a coordinator.</p>
          ) : null}

          <Section heading="Audit chain (this record)">
            {auditEntries.length === 0 ? (
              <p style={{ ...TYPE_BODY, color: TEXT_DIM }}>No access recorded yet this render.</p>
            ) : (
              auditEntries.map((a) => (
                <p
                  key={a.id}
                  style={{
                    ...TYPE_BODY,
                    color: TEXT_SECONDARY,
                    paddingTop: SPACE_8,
                    paddingBottom: SPACE_8,
                    borderBottom: `${BORDER_WIDTH}px solid ${HAIRLINE}`,
                  }}
                >
                  <span style={{ color: TEXT_PRIMARY }}>{a.who}</span> — {a.what}{' '}
                  <span style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>({a.why})</span>
                </p>
              ))
            )}
          </Section>

          <Section heading="Primary identifiers" defaultOpen>
            <ReferenceRow label="Fingerprint" ref_={serviceDossier.primary.fingerprint} />
            <ReferenceRow label="Dental chart" ref_={serviceDossier.primary.dentalChart} />
            <ReferenceRow label="DNA reference" ref_={serviceDossier.primary.dna} />
            <FieldRow label="Family reference donor" traced={serviceDossier.primary.dna.familyDonor} />
          </Section>

          <Section heading="Secondary identifiers" defaultOpen>
            <FieldRow label="Physical description" traced={serviceDossier.secondary.physicalDescription} />
            <FieldRow label="Distinguishing features" traced={serviceDossier.secondary.distinguishingFeatures} />
            <FieldRow label="Dominant hand" traced={serviceDossier.secondary.dominantHand} />
            <FieldRow label="Corrective lenses" traced={serviceDossier.secondary.correctiveLenses} />
            <FieldRow label="Dentures / orthodontics" traced={serviceDossier.secondary.dentures} />
            <FieldRow label="Clothing and equipment" traced={serviceDossier.secondary.clothingAndEquipment} />
            <FieldRow label="Personal effects" traced={serviceDossier.secondary.personalEffects} />
            <FieldRow label="Last known position" traced={serviceDossier.secondary.lastKnownPosition} />
            <FieldRow label="Last confirmed sighting" traced={serviceDossier.secondary.lastConfirmedSighting} />
          </Section>

          <Section heading="Who was with them">
            {serviceDossier.whoWasWithThem.cellMachineSerials.map((tv, i) => (
              <FieldRow key={i} label="Rope team (by serial)" traced={tv} />
            ))}
            <FieldRow label="Party manifest" traced={serviceDossier.whoWasWithThem.shiftManifest} />
            <FieldRow label="Lead guide" traced={serviceDossier.whoWasWithThem.leadSupervisor} />
            <FieldRow label="Last with, when and where" traced={serviceDossier.whoWasWithThem.lastWithWhenAndWhere} />
            <FieldRow label="Tent assignment" traced={serviceDossier.whoWasWithThem.bayAssignment} />
            <FieldRow label="Support staff" traced={serviceDossier.whoWasWithThem.supportTechnicians} />
          </Section>

          <Section heading="Photographs and family">
            <FieldRow label="Photograph reference" traced={serviceDossier.photoAndFamily.photographReference} />
            <ContactBlock heading="Nominated family contact" contact={serviceDossier.photoAndFamily.familyContact} />
            <FieldRow
              label="Consent to release"
              traced={serviceDossier.photoAndFamily.consentToRelease}
              format={(v) => (v ? 'Authorised' : 'Not authorised')}
            />
          </Section>
        </div>
      )}
    </div>
  )
}

function ReferenceRow({
  label,
  ref_,
}: {
  label: string
  ref_: { reference: TracedValue<string>; custodian: TracedValue<string> }
}): ReactElement {
  return (
    <div style={{ paddingTop: SPACE_8, paddingBottom: SPACE_8, borderBottom: `${BORDER_WIDTH}px solid ${HAIRLINE}` }}>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>{label}</p>
      <p style={{ ...TYPE_BODY, color: TEXT_PRIMARY, marginTop: SPACE_8 }}>{ref_.reference.value}</p>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
        Held by: {ref_.custodian.value}
      </p>
    </div>
  )
}

function ExportButtons({
  record,
  serviceDossier,
  incidentOpen,
  onExport,
}: {
  record: IdentityRecord
  serviceDossier: ServiceDossierRecord
  incidentOpen: boolean
  onExport: (what: string) => void
}): ReactElement {
  const responderHandlers = useFocusRing()
  const dviHandlers = useFocusRing()

  return (
    <div style={{ marginTop: SPACE_24, paddingTop: SPACE_16, borderTop: `${BORDER_WIDTH}px solid ${HAIRLINE}` }}>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>EXPORT</p>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
        These two cards are the only artefacts this record produces.
      </p>
      <div className="flex" style={{ gap: SPACE_8, marginTop: SPACE_8 }}>
        <button
          type="button"
          onClick={() => {
            downloadJson(`responder-card-${record.serial.value.replace('-', '')}.json`, buildResponderCard(record))
            onExport(`Exported the responder card for ${record.who.fullLegalName.value}`)
          }}
          {...responderHandlers.handlers}
          className="pressable"
          style={exportButtonStyle(responderHandlers.focused)}
        >
          RESPONDER CARD
        </button>
        <button
          type="button"
          disabled={!incidentOpen}
          onClick={() => {
            if (!incidentOpen) return
            downloadJson(`dvi-form-${record.serial.value.replace('-', '')}.json`, buildDviForm(record, serviceDossier))
            onExport(`Generated the DVI form for ${record.who.fullLegalName.value}`)
          }}
          {...dviHandlers.handlers}
          className="pressable"
          style={{
            ...exportButtonStyle(dviHandlers.focused),
            opacity: incidentOpen ? 1 : 0.4,
            cursor: incidentOpen ? 'pointer' : 'not-allowed',
          }}
        >
          DVI FORM
        </button>
      </div>
      {!incidentOpen ? (
        <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
          The DVI form requires an open incident.
        </p>
      ) : null}
    </div>
  )
}

function exportButtonStyle(focused: boolean): CSSProperties {
  return {
    ...TYPE_CAPTION,
    textTransform: 'none',
    letterSpacing: 'normal',
    color: TEXT_PRIMARY,
    border: `${BORDER_WIDTH}px solid ${TEXT_SECONDARY}`,
    borderRadius: RADIUS_INTERACTIVE,
    padding: `${SPACE_8}px ${SPACE_16}px`,
    ...focusRingStyle(focused),
  }
}
