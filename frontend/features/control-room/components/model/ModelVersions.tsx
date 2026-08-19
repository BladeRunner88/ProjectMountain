'use client'

import { useState, type KeyboardEvent, type ReactElement } from 'react'
import {
  ACCENT_INDICATOR_WIDTH,
  ANOMALY,
  BORDER_WIDTH,
  HAIRLINE,
  NOMINAL,
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
  VERIFIED,
  WATCH,
} from '@/features/ase/tokens'
import { exportOntology, type Ontology, type OntologyVersion } from '@/features/ase/services/ontology'
import { useFocusRing, focusRingStyle } from '@/features/control-room'

export function ModelVersions({ ontology }: { ontology: Ontology }): ReactElement {
  const versions = ontology.versions
  const latest = versions[versions.length - 1]
  const [selectedId, setSelectedId] = useState(latest?.id ?? '')
  const selected = versions.find((v) => v.id === selectedId) ?? latest

  if (versions.length === 0 || !selected) {
    return <p style={{ ...TYPE_BODY, color: TEXT_DIM }}>No versions recorded for this model.</p>
  }

  return (
    <div>
      <div
        className="flex"
        style={{ ...TYPE_CAPTION, color: TEXT_DIM, borderBottom: `${BORDER_WIDTH}px solid ${HAIRLINE}`, paddingBottom: SPACE_8 }}
      >
        <span style={{ flex: 1 }}>VERSION</span>
        <span style={{ flex: 1 }}>DATE</span>
        <span style={{ flex: 3 }}>WHAT CHANGED</span>
        <span style={{ flex: 3 }}>WHY</span>
        <span style={{ flex: 1 }}>WHO</span>
        <span style={{ flex: 1 }}>AFFECTED</span>
      </div>
      {versions.map((v) => (
        <VersionRow key={v.id} version={v} selected={v.id === selected.id} onSelect={() => setSelectedId(v.id)} />
      ))}

      <div style={{ marginTop: SPACE_32 }}>
        <DiffPanel version={selected} />
      </div>

      <div style={{ marginTop: SPACE_32 }}>
        <ExportButton ontology={ontology} />
        <p style={{ ...TYPE_BODY, color: TEXT_SECONDARY, marginTop: SPACE_16 }}>
          This model is data. Replace it with a mining, hospital or logistics model and ASE understands a different world. Nothing
          else in the system changes.
        </p>
      </div>
    </div>
  )
}

function VersionRow({
  version,
  selected,
  onSelect,
}: {
  version: OntologyVersion
  selected: boolean
  onSelect: () => void
}): ReactElement {
  const { focused, handlers } = useFocusRing()
  const affected = version.conclusionsAffected()

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>): void {
    if (e.key === 'Enter') onSelect()
  }

  return (
    <div
      role="row"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={onKeyDown}
      {...handlers}
      className="flex cursor-pointer items-center"
      style={{
        padding: `${SPACE_8}px 0`,
        borderBottom: `${BORDER_WIDTH}px solid ${HAIRLINE}`,
        borderLeft: `${ACCENT_INDICATOR_WIDTH}px solid ${selected ? VERIFIED : 'transparent'}`,
        paddingLeft: SPACE_8,
        ...focusRingStyle(focused),
      }}
    >
      <span className="font-mono" style={{ ...TYPE_BODY, color: TEXT_PRIMARY, flex: 1 }}>
        {version.version}
      </span>
      <span style={{ ...TYPE_BODY, color: TEXT_SECONDARY, flex: 1 }}>{version.date}</span>
      <span style={{ ...TYPE_BODY, color: TEXT_PRIMARY, flex: 3, paddingRight: SPACE_16 }}>{version.whatChanged}</span>
      <span style={{ ...TYPE_BODY, color: TEXT_SECONDARY, flex: 3, paddingRight: SPACE_16 }}>{version.why}</span>
      <span style={{ ...TYPE_BODY, color: TEXT_SECONDARY, flex: 1 }}>{version.who}</span>
      <span style={{ ...TYPE_BODY, color: affected > 0 ? WATCH : TEXT_SECONDARY, flex: 1 }}>{affected}</span>
    </div>
  )
}

function DiffPanel({ version }: { version: OntologyVersion }): ReactElement {
  const affected = version.conclusionsAffected()
  return (
    <div style={{ padding: SPACE_16, background: PANEL_RAISED, borderRadius: RADIUS_STATIC }}>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>SCHEMA DIFF — {version.version}</p>
      <div className="grid grid-cols-3" style={{ gap: SPACE_16, marginTop: SPACE_16 }}>
        <DiffColumn heading="Added" items={version.diff.added} color={NOMINAL} />
        <DiffColumn heading="Removed" items={version.diff.removed} color={ANOMALY} />
        <DiffColumn heading="Changed" items={version.diff.changed} color={WATCH} />
      </div>
      <p style={{ ...TYPE_BODY, color: TEXT_SECONDARY, marginTop: SPACE_16 }}>
        {affected} conclusion{affected === 1 ? '' : 's'} currently recompute from this change (via dependents()).
      </p>
    </div>
  )
}

function DiffColumn({ heading, items, color }: { heading: string; items: string[]; color: string }): ReactElement {
  return (
    <div>
      <p style={{ ...TYPE_CAPTION, color }}>{heading.toUpperCase()}</p>
      {items.length === 0 ? (
        <p style={{ ...TYPE_BODY, color: TEXT_DIM, marginTop: SPACE_8 }}>None.</p>
      ) : (
        <ul style={{ marginTop: SPACE_8 }}>
          {items.map((item) => (
            <li key={item} className="font-mono" style={{ ...TYPE_BODY, color: TEXT_PRIMARY, marginBottom: SPACE_8 }}>
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ExportButton({ ontology }: { ontology: Ontology }): ReactElement {
  const { focused, handlers } = useFocusRing()

  function handleExport(): void {
    const json = exportOntology(ontology)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'ase-model.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <button
      type="button"
      onClick={handleExport}
      {...handlers}
      className="pressable"
      style={{
        ...TYPE_CAPTION,
        textTransform: 'none',
        letterSpacing: 'normal',
        color: TEXT_PRIMARY,
        border: `${BORDER_WIDTH}px solid ${TEXT_SECONDARY}`,
        borderRadius: RADIUS_INTERACTIVE,
        padding: `${SPACE_8}px ${SPACE_16}px`,
        ...focusRingStyle(focused),
      }}
    >
      EXPORT MODEL
    </button>
  )
}
