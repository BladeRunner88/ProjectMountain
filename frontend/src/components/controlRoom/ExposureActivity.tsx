import { useMemo } from 'react'
import { BORDER_WIDTH, HAIRLINE, NOMINAL, SPACE_16, SPACE_8, TEXT_DIM, TEXT_PRIMARY, TEXT_SECONDARY, TYPE_BODY, TYPE_CAPTION, WATCH } from '../../ase/tokens'
import { useDataset } from '../../ase/store'

// ACTIVITY — NOT a second audit trail. This is a plain filtered read of
// Revision's own real, seal-chained `auditRecord` — every row here IS a row
// in Record, just narrowed to `fromTab === 'exposure'`. Verified structurally
// in exposure.test.ts and by construction here: nothing in this file ever
// calls anything but `.filter()` on the array Revision already owns.
export function ExposureActivity() {
  const { auditRecord } = useDataset()
  const exposureEntries = useMemo(() => auditRecord.filter((e) => e.fromTab === 'exposure').slice().reverse(), [auditRecord])

  return (
    <div>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, textTransform: 'none', letterSpacing: 'normal' }}>
        This is Revision's own audit chain, filtered to entries raised from Exposure — not a second record. Open Revision → Record for the full chain and
        seal verification.
      </p>

      <div style={{ marginTop: SPACE_16 }}>
        {exposureEntries.length === 0 ? (
          <p style={{ ...TYPE_BODY, color: TEXT_DIM }}>Nothing raised from Exposure yet.</p>
        ) : (
          exposureEntries.map((e) => (
            <div key={e.id} style={{ padding: SPACE_16, borderBottom: `${BORDER_WIDTH}px solid ${HAIRLINE}` }}>
              <div className="flex items-center justify-between">
                <span style={{ ...TYPE_BODY, color: TEXT_PRIMARY }}>
                  {e.who} — {e.actionLabel}
                </span>
                <span className="font-mono" style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>
                  {new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <p style={{ ...TYPE_CAPTION, color: TEXT_SECONDARY, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
                {e.aboutLabel} — {e.whatChanged}
              </p>
              <p className="font-mono" style={{ ...TYPE_CAPTION, color: NOMINAL, marginTop: SPACE_8 }}>
                seal ✓ {e.seal.slice(0, 8)}
              </p>
            </div>
          ))
        )}
      </div>
      <p style={{ ...TYPE_CAPTION, color: WATCH, marginTop: SPACE_16, textTransform: 'none', letterSpacing: 'normal' }}>
        New actions taken from Health, Matrix, or Fragility above appear here immediately — they write into this same chain.
      </p>
    </div>
  )
}
