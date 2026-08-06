import { BORDER_WIDTH, HAIRLINE, SPACE_16, SPACE_8, TEXT_DIM, TEXT_PRIMARY, TEXT_SECONDARY, TYPE_BODY, TYPE_CAPTION } from '../../ase/tokens'
import type { Ontology, SourceCitation } from '../../ase/ontology'

// SOURCES: where each definition came from. "Reuse first. Extend second.
// Invent last." — one row breaks that order (In-house), and it says why.
export function ModelSources({ ontology }: { ontology: Ontology }) {
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

function SourceRow({ source }: { source: SourceCitation }) {
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
