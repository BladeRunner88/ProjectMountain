'use client'

import type { ReactElement } from 'react'
import {
  ACCENT_INDICATOR_WIDTH,
  BORDER_WIDTH,
  HAIRLINE,
  PANEL_RAISED,
  RADIUS_STATIC,
  SPACE_16,
  SPACE_32,
  SPACE_8,
  STATUS_DOT_SIZE,
  TEXT_DIM,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  TYPE_BODY,
  TYPE_CAPTION,
  TYPE_DISPLAY,
  VERIFIED,
  WATCH,
} from '@/features/ase/tokens'
import type { Ontology, RelationshipDef, ThingKind, ThingKindDef } from '@/features/ase/services/ontology'
import { useFocusRing, focusRingStyle } from '@/features/control-room'

export function ModelThings({
  ontology,
  selectedKind,
  onSelectKind,
}: {
  ontology: Ontology
  selectedKind: ThingKind
  onSelectKind: (k: ThingKind) => void
}): ReactElement {
  if (ontology.things.length === 0) {
    return <p style={{ ...TYPE_BODY, color: TEXT_DIM }}>No kinds in this model.</p>
  }

  const selected = ontology.things.find((t) => t.kind === selectedKind) ?? ontology.things[0]
  const connections = ontology.relationships.filter((r) => r.from === selected.kind || r.to === selected.kind)
  const factCount = ontology.facts.filter((f) => f.kind === selected.kind).length

  return (
    <div>
      <div className="grid grid-cols-3" style={{ gap: SPACE_16 }}>
        {ontology.things.map((t) => (
          <ThingCard key={t.kind} thing={t} selected={t.kind === selected.kind} onSelect={() => onSelectKind(t.kind)} />
        ))}
      </div>

      <div style={{ marginTop: SPACE_32 }}>
        <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>{selected.label.toUpperCase()} CONNECT TO</p>
        <div style={{ marginTop: SPACE_16 }}>
          {connections.length === 0 ? (
            <p style={{ ...TYPE_BODY, color: TEXT_DIM }}>Nothing else in the model yet.</p>
          ) : (
            connections.map((r) => <ConnectionLine key={r.id} relationship={r} kind={selected.kind} />)
          )}
        </div>
        <p style={{ ...TYPE_BODY, color: TEXT_SECONDARY, marginTop: SPACE_16 }}>
          {factCount} propert{factCount === 1 ? 'y' : 'ies'} recorded for {selected.label.toLowerCase()} — see FACTS.
        </p>
      </div>

      <div style={{ marginTop: SPACE_32 }}>
        <WhatWeGotWrong items={ontology.whatWeGotWrong} />
      </div>
    </div>
  )
}

function ThingCard({
  thing,
  selected,
  onSelect,
}: {
  thing: ThingKindDef
  selected: boolean
  onSelect: () => void
}): ReactElement {
  const { focused, handlers } = useFocusRing()
  return (
    <button
      type="button"
      onClick={onSelect}
      {...handlers}
      className="pressable text-left"
      style={{
        padding: SPACE_16,
        background: PANEL_RAISED,
        borderRadius: RADIUS_STATIC,
        borderLeft: `${ACCENT_INDICATOR_WIDTH}px solid ${selected ? VERIFIED : 'transparent'}`,
        ...focusRingStyle(focused),
      }}
    >
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>{thing.label.toUpperCase()}</p>
      <p className="font-mono" style={{ ...TYPE_DISPLAY, color: TEXT_PRIMARY, marginTop: SPACE_8 }}>
        {thing.count}
      </p>
      <p style={{ ...TYPE_BODY, color: TEXT_SECONDARY, marginTop: SPACE_8 }}>{thing.line}</p>
    </button>
  )
}

function ConnectionLine({ relationship, kind }: { relationship: RelationshipDef; kind: ThingKind }): ReactElement {
  const forward = relationship.from === kind
  const otherKind = forward ? relationship.to : relationship.from
  const color = relationship.color === 'watch' ? WATCH : TEXT_SECONDARY
  return (
    <div className="flex items-center" style={{ gap: SPACE_8, marginBottom: SPACE_8 }}>
      <span
        aria-hidden
        style={{
          width: STATUS_DOT_SIZE,
          height: STATUS_DOT_SIZE,
          borderRadius: '50%',
          background: relationship.color === 'watch' ? WATCH : VERIFIED,
          display: 'inline-block',
        }}
      />
      <p style={{ ...TYPE_BODY, color }}>
        {forward ? relationship.label : `${relationship.label} (inverse)`} → {otherKind} ({relationship.cardinality})
        {relationship.note ? <span style={{ color: TEXT_DIM }}> — {relationship.note}</span> : null}
      </p>
    </div>
  )
}

function WhatWeGotWrong({ items }: { items: string[] }): ReactElement {
  return (
    <div
      style={{
        padding: SPACE_16,
        background: PANEL_RAISED,
        borderRadius: RADIUS_STATIC,
        border: `${BORDER_WIDTH}px solid ${HAIRLINE}`,
      }}
    >
      <p style={{ ...TYPE_CAPTION, color: WATCH }}>WHAT WE GOT WRONG</p>
      {items.length === 0 ? (
        <p style={{ ...TYPE_BODY, color: TEXT_DIM, marginTop: SPACE_16 }}>Nothing recorded.</p>
      ) : (
        <ul style={{ marginTop: SPACE_16 }}>
          {items.map((item) => (
            <li key={item} style={{ ...TYPE_BODY, color: TEXT_PRIMARY, marginBottom: SPACE_8 }}>
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
