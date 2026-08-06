import { useMemo } from 'react'
import { useDataset } from '../../ase/store'
import { SPACE_16, SPACE_32, SPACE_8, TEXT_DIM, TEXT_PRIMARY, TYPE_BODY, TYPE_CAPTION } from '../../ase/tokens'
import { EvidenceTable, type EvidenceRow } from './EvidenceTable'
import type { Ontology } from '../../ase/ontology'

// QUESTIONS: ten competency questions as an EvidenceTable. Every YES row's
// WHY column is the live query result itself (a real number computed fresh
// on every render, via `tick`) — not a static description, so a YES with no
// working query genuinely cannot appear here.
export function ModelQuestions({ ontology }: { ontology: Ontology }) {
  const { tick } = useDataset()

  const rows: EvidenceRow[] = useMemo(() => {
    // `tick` isn't read directly — it's the signal that the live graph may
    // have moved, which is exactly when q.query()'s embedded numbers need
    // recomputing (same pattern as asOfContext's changePoints).
    void tick
    return ontology.questions.map((q) => ({
      id: q.id,
      traced: q.canAnswer,
      label: q.question,
      whatThisIs: 'Whether ASE can answer this question right now, and what it uses to do it.',
      claimSortValue: q.canAnswer.value ? 1 : 0,
      why: q.query(),
      format: (v) => (v ? 'Yes' : 'No'),
    }))
  }, [ontology, tick])

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

function ScopeList({ heading, items }: { heading: string; items: string[] }) {
  return (
    <div>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>{heading.toUpperCase()}</p>
      <ul style={{ marginTop: SPACE_16 }}>
        {items.map((item) => (
          <li key={item} style={{ ...TYPE_BODY, color: TEXT_PRIMARY, marginBottom: SPACE_8 }}>
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}
