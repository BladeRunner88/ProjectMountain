'use client'

import { useMemo, type ReactElement } from 'react'
import { useDataset } from '@/features/ase/client'
import { SPACE_16, SPACE_32, SPACE_8, TEXT_DIM, TEXT_PRIMARY, TYPE_BODY, TYPE_CAPTION } from '@/features/ase/tokens'
import type { Ontology } from '@/features/ase/services/ontology'
import type { TracedValue } from '@/features/ase/services/traced'
import { EvidenceTable, type EvidenceRow } from '@/features/control-room'

export function ModelQuestions({ ontology }: { ontology: Ontology }): ReactElement {
  const { tick } = useDataset()

  const rows: EvidenceRow[] = useMemo(() => {
    void tick
    return ontology.questions.map((q) => ({
      id: q.id,
      traced: q.canAnswer as TracedValue<unknown>,
      label: q.question,
      whatThisIs: 'Whether ASE can answer this question right now, and what it uses to do it.',
      claimSortValue: q.canAnswer.value ? 1 : 0,
      why: q.query(),
      format: (v) => (v ? 'Yes' : 'No'),
    }))
  }, [ontology, tick])

  if (ontology.questions.length === 0) {
    return <p style={{ ...TYPE_BODY, color: TEXT_DIM }}>No competency questions in this model.</p>
  }

  return (
    <div>
      <EvidenceTable rows={rows} />
      <div className="grid grid-cols-3" style={{ gap: SPACE_32, marginTop: SPACE_32 }}>
        <ScopeList heading="In scope" items={ontology.inScope} />
        <ScopeList heading="Out of scope" items={ontology.outOfScope} />
        <ScopeList heading="Planned next" items={ontology.plannedNext} />
      </div>
    </div>
  )
}

function ScopeList({ heading, items }: { heading: string; items: string[] }): ReactElement {
  return (
    <div>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>{heading.toUpperCase()}</p>
      {items.length === 0 ? (
        <p style={{ ...TYPE_BODY, color: TEXT_DIM, marginTop: SPACE_16 }}>None listed.</p>
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
