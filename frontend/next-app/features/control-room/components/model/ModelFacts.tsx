'use client'

import type { ReactElement } from 'react'
import {
  BORDER_WIDTH,
  HAIRLINE,
  SPACE_16,
  SPACE_32,
  SPACE_8,
  STATUS_DOT_SIZE,
  TEXT_DIM,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  TYPE_BODY,
  TYPE_CAPTION,
  VERIFIED,
  WATCH,
} from '@/features/ase/tokens'
import { confidence } from '@/features/ase/services/folds'
import type { Ontology, PropertyFact, RelationshipDef, ThingKind } from '@/features/ase/services/ontology'
import { useFocusRing, focusRingStyle } from '@/features/control-room'

const KIND_LABEL: Record<ThingKind, string> = {
  country: 'Country',
  plant: 'Plant',
  line: 'Line',
  operator: 'Operator',
  machine: 'Machine',
  sensor: 'Sensor',
}

export function ModelFacts({
  ontology,
  selectedKind,
  onSelectKind,
}: {
  ontology: Ontology
  selectedKind: ThingKind
  onSelectKind: (k: ThingKind) => void
}): ReactElement {
  const kinds = ontology.things.map((t) => t.kind)
  if (kinds.length === 0) {
    return <p style={{ ...TYPE_BODY, color: TEXT_DIM }}>No kinds in this model.</p>
  }

  const kind = kinds.includes(selectedKind) ? selectedKind : kinds[0]
  const kindFacts = ontology.facts.filter((f) => f.kind === kind)
  const ownFacts = kindFacts.filter((f) => f.own)
  const relationshipFacts = kindFacts.filter((f) => !f.own)

  return (
    <div>
      <KindPicker things={kinds} selected={kind} onSelect={onSelectKind} />

      <div style={{ marginTop: SPACE_32 }}>
        <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>{KIND_LABEL[kind].toUpperCase()} — ITS OWN FACTS</p>
        <FactTable facts={ownFacts} />
        {kind === 'machine' ? (
          <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
            {ontology.serialCollisionCount} serial{ontology.serialCollisionCount === 1 ? '' : 's'} collided on issue and{' '}
            {ontology.serialCollisionCount === 1 ? 'was' : 'were'} resolved by incrementing BBB.
          </p>
        ) : null}
      </div>

      <div style={{ marginTop: SPACE_32 }}>
        <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>{KIND_LABEL[kind].toUpperCase()} — RELATIONSHIP FACTS</p>
        <FactTable facts={relationshipFacts} />
      </div>

      <div style={{ marginTop: SPACE_32 }}>
        <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>CONNECTION REGISTRY</p>
        <div style={{ marginTop: SPACE_16 }}>
          {ontology.relationships.length === 0 ? (
            <p style={{ ...TYPE_BODY, color: TEXT_DIM }}>No relationships recorded.</p>
          ) : (
            ontology.relationships.map((r) => <RegistryRow key={r.id} relationship={r} />)
          )}
        </div>
        <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_16, textTransform: 'none', letterSpacing: 'normal' }}>
          These are the same colours the graph draws. One language, two screens.
        </p>
      </div>
    </div>
  )
}

function KindPicker({
  things,
  selected,
  onSelect,
}: {
  things: ThingKind[]
  selected: ThingKind
  onSelect: (k: ThingKind) => void
}): ReactElement {
  return (
    <div className="flex" style={{ gap: SPACE_8 }}>
      {things.map((k) => (
        <KindPill key={k} kind={k} active={k === selected} onClick={() => onSelect(k)} />
      ))}
    </div>
  )
}

function KindPill({ kind, active, onClick }: { kind: ThingKind; active: boolean; onClick: () => void }): ReactElement {
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
        color: active ? TEXT_PRIMARY : TEXT_SECONDARY,
        borderBottom: `${BORDER_WIDTH}px solid ${active ? VERIFIED : 'transparent'}`,
        paddingBottom: SPACE_8,
        ...focusRingStyle(focused),
      }}
    >
      {KIND_LABEL[kind]}
    </button>
  )
}

function FactTable({ facts }: { facts: PropertyFact[] }): ReactElement {
  if (facts.length === 0) {
    return <p style={{ ...TYPE_BODY, color: TEXT_DIM, marginTop: SPACE_16 }}>Nothing recorded yet.</p>
  }
  return (
    <div style={{ marginTop: SPACE_16 }}>
      <div
        className="flex"
        style={{ ...TYPE_CAPTION, color: TEXT_DIM, borderBottom: `${BORDER_WIDTH}px solid ${HAIRLINE}`, paddingBottom: SPACE_8 }}
      >
        <span style={{ flex: 2 }}>PROPERTY</span>
        <span style={{ flex: 2 }}>SOURCE</span>
        <span style={{ flex: 2 }}>WHAT WAS DONE</span>
        <span style={{ flex: 1 }}>MISSING</span>
        <span style={{ flex: 1 }}>CONFIDENCE</span>
      </div>
      {facts.map((f) => (
        <FactRow key={f.id} fact={f} />
      ))}
    </div>
  )
}

function FactRow({ fact }: { fact: PropertyFact }): ReactElement {
  const conf = fact.traced ? confidence(fact.traced) : null
  return (
    <div className="flex items-center" style={{ padding: `${SPACE_8}px 0`, borderBottom: `${BORDER_WIDTH}px solid ${HAIRLINE}` }}>
      <span style={{ ...TYPE_BODY, color: TEXT_PRIMARY, flex: 2 }}>
        {fact.property}
        {fact.conflictId ? (
          <span
            aria-hidden
            title="A 9.4 conflict was found for this property"
            style={{
              display: 'inline-block',
              width: STATUS_DOT_SIZE,
              height: STATUS_DOT_SIZE,
              borderRadius: '50%',
              background: WATCH,
              marginLeft: SPACE_8,
            }}
          />
        ) : null}
      </span>
      <span style={{ ...TYPE_BODY, color: TEXT_SECONDARY, flex: 2 }}>{fact.source}</span>
      <span style={{ ...TYPE_BODY, color: TEXT_SECONDARY, flex: 2 }}>{fact.transform}</span>
      <span style={{ ...TYPE_BODY, color: TEXT_SECONDARY, flex: 1 }}>{fact.missingPct}%</span>
      <span style={{ ...TYPE_BODY, color: TEXT_PRIMARY, flex: 1 }}>{conf !== null ? `${Math.round(conf * 100)}%` : '—'}</span>
    </div>
  )
}

function RegistryRow({ relationship }: { relationship: RelationshipDef }): ReactElement {
  const color = relationship.color === 'watch' ? WATCH : VERIFIED
  return (
    <div
      className="flex items-center"
      style={{ gap: SPACE_8, padding: `${SPACE_8}px 0`, borderBottom: `${BORDER_WIDTH}px solid ${HAIRLINE}` }}
    >
      <span
        aria-hidden
        style={{ width: STATUS_DOT_SIZE, height: STATUS_DOT_SIZE, borderRadius: '50%', background: color, display: 'inline-block' }}
      />
      <span style={{ ...TYPE_BODY, color: TEXT_PRIMARY }}>
        {KIND_LABEL[relationship.from]} → {relationship.label} → {KIND_LABEL[relationship.to]}
      </span>
      <span style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>{relationship.cardinality}</span>
      {relationship.note ? <span style={{ ...TYPE_BODY, color: TEXT_DIM }}>— {relationship.note}</span> : null}
    </div>
  )
}
