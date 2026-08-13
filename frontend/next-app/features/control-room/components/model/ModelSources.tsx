'use client'

import type { ReactElement } from 'react'
import { BORDER_WIDTH, HAIRLINE, SPACE_16, SPACE_8, TEXT_DIM, TEXT_PRIMARY, TEXT_SECONDARY, TYPE_BODY, TYPE_CAPTION } from '@/features/ase/tokens'
import type { Ontology, SourceCitation } from '@/features/ase/services/ontology'

export function ModelSources({ ontology }: { ontology: Ontology }): ReactElement {
  if (ontology.sources.length === 0) {
    return <p style={{ ...TYPE_BODY, color: TEXT_DIM }}>No source citations in this model.</p>
  }

  return (
    <div>
      <p style={{ ...TYPE_BODY, color: TEXT_SECONDARY }}>Reuse first. Extend second. Invent last.</p>
      <div style={{ marginTop: SPACE_16 }}>
        {ontology.sources.map((s) => (
          <SourceRow key={s.id} source={s} />
        ))}
      </div>
    </div>
  )
}

function SourceRow({ source }: { source: SourceCitation }): ReactElement {
  return (
    <div
      className="flex items-start justify-between"
      style={{ padding: `${SPACE_16}px 0`, borderBottom: `${BORDER_WIDTH}px solid ${HAIRLINE}`, gap: SPACE_16 }}
    >
      <div style={{ flex: 1 }}>
        <p style={{ ...TYPE_BODY, color: TEXT_PRIMARY }}>{source.property}</p>
        <p style={{ ...TYPE_BODY, color: TEXT_SECONDARY, marginTop: SPACE_8 }}>{source.note}</p>
      </div>
      <p
        style={{
          ...TYPE_CAPTION,
          color: source.inHouse ? TEXT_PRIMARY : TEXT_DIM,
          textAlign: 'right',
          whiteSpace: 'nowrap',
        }}
      >
        {source.standard}
      </p>
    </div>
  )
}
