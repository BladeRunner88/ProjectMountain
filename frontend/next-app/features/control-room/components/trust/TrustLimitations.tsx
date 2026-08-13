'use client'

import type { ReactElement } from 'react'
import { useRouter } from 'next/navigation'
import { BORDER_WIDTH, PANEL_RAISED, RADIUS_STATIC, SPACE_8, SPACE_16, TEXT_DIM, TEXT_PRIMARY, TEXT_SECONDARY, TYPE_BODY, TYPE_CAPTION, WATCH } from '@/features/ase/tokens'
import { useDataset } from '@/features/ase/client'
import type { TrustPill } from './Trust'

// KNOWN LIMITATIONS — not a disclaimer. Six real things this product
// cannot do, each linking to where the limitation is actually visible —
// per the spec, "the most valuable section on the tab."
export function TrustLimitations({ onNavigate }: { onNavigate: (pill: TrustPill) => void }): ReactElement {
  const { dataset } = useDataset()
  const router = useRouter()
  const t = dataset.trust

  return (
    <div>
      <p style={{ ...TYPE_BODY, color: TEXT_SECONDARY, textTransform: 'none', letterSpacing: 'normal' }}>
        An evaluator who reads this section trusts the rest of the tab more, not less.
      </p>
      <div style={{ marginTop: SPACE_16 }}>
        {t.knownLimitations.map((l, i) => (
          <div key={l.id} style={{ padding: SPACE_16, marginBottom: SPACE_8, background: PANEL_RAISED, borderRadius: RADIUS_STATIC, border: `${BORDER_WIDTH}px solid ${WATCH}` }}>
            <div className="flex items-start" style={{ gap: SPACE_8 }}>
              <span className="font-mono" style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>
                {i + 1}
              </span>
              <p style={{ ...TYPE_BODY, color: TEXT_PRIMARY, textTransform: 'none', letterSpacing: 'normal', flex: 1 }}>{l.text}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                if (l.linkTabId === 'trust') {
                  if (l.linkLabel.includes('Security')) onNavigate('security')
                  else if (l.linkLabel.includes('Quality')) onNavigate('quality')
                  else if (l.linkLabel.includes('Connections')) onNavigate('connections')
                } else if (l.linkTabId) {
                  router.push(`/app/control-room/${l.linkTabId}`)
                }
              }}
              className="pressable"
              style={{ ...TYPE_CAPTION, color: TEXT_SECONDARY, textDecoration: 'underline', marginTop: SPACE_8, marginLeft: 20, textTransform: 'none', letterSpacing: 'normal' }}
            >
              → {l.linkLabel}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
