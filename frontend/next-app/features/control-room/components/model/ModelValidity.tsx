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
  TEXT_DIM,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  TYPE_BODY,
  TYPE_CAPTION,
  WATCH,
} from '@/features/ase/tokens'
import type { Ontology, ValidityCheckPlace } from '@/features/ase/services/ontology'

const PLACE_LABEL: Record<ValidityCheckPlace['place'], string> = {
  code: 'Code',
  arrival: 'Arrival',
  storage: 'Storage',
}

export function ModelValidity({ ontology }: { ontology: Ontology }): ReactElement {
  if (ontology.validityRules.length === 0 && ontology.validityChecks.length === 0) {
    return <p style={{ ...TYPE_BODY, color: TEXT_DIM }}>No validity rules in this model.</p>
  }

  return (
    <div>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>RULES</p>
      {ontology.validityRules.length === 0 ? (
        <p style={{ ...TYPE_BODY, color: TEXT_DIM, marginTop: SPACE_16 }}>No rules recorded.</p>
      ) : (
        <ul style={{ marginTop: SPACE_16 }}>
          {ontology.validityRules.map((r) => (
            <li key={r.id} style={{ ...TYPE_BODY, color: TEXT_PRIMARY, marginBottom: SPACE_8 }}>
              {r.rule}
            </li>
          ))}
        </ul>
      )}

      <div style={{ marginTop: SPACE_32 }}>
        <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>THE THREE-PLACE CHECK</p>
        <div className="grid grid-cols-3" style={{ gap: SPACE_16, marginTop: SPACE_16 }}>
          {ontology.validityChecks.map((c) => (
            <div key={c.place} style={{ padding: SPACE_16, background: PANEL_RAISED, borderRadius: RADIUS_STATIC }}>
              <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>{PLACE_LABEL[c.place].toUpperCase()}</p>
              <p style={{ ...TYPE_BODY, color: TEXT_SECONDARY, marginTop: SPACE_8 }}>{c.description}</p>
            </div>
          ))}
        </div>

        <div
          style={{
            marginTop: SPACE_16,
            padding: SPACE_16,
            background: PANEL_RAISED,
            borderRadius: RADIUS_STATIC,
            border: `${BORDER_WIDTH}px solid ${HAIRLINE}`,
            borderLeft: `${ACCENT_INDICATOR_WIDTH}px solid ${WATCH}`,
          }}
        >
          <p style={{ ...TYPE_CAPTION, color: WATCH }}>MISMATCH</p>
          <p style={{ ...TYPE_BODY, color: TEXT_PRIMARY, marginTop: SPACE_8 }}>{ontology.validityMismatch}</p>
        </div>
      </div>
    </div>
  )
}
