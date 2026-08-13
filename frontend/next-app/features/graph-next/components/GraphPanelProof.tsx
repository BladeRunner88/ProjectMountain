'use client'

// S8.2 placeholder for the real investigation panel (8.9) — exists only so
// GraphNext.tsx has two independent things to wrap in separate error
// boundaries (rule 7: canvas and panel never take each other down) and to
// prove the panel reads the same store, not a copy of its state.

import { useSyncExternalStore, type ReactElement } from 'react'
import { BORDER_WIDTH, HAIRLINE, PANEL, SPACE_16, TEXT_DIM, TEXT_PRIMARY, TYPE_BODY, TYPE_CAPTION } from '@/features/ase/tokens'
import { graphStore } from '../stores/graphStore'

export function GraphPanelProof(): ReactElement {
  const snapshot = useSyncExternalStore(graphStore.subscribe, graphStore.getSnapshot, graphStore.getServerSnapshot)

  return (
    <div className="h-full w-full" style={{ background: PANEL, borderLeft: `${BORDER_WIDTH}px solid ${HAIRLINE}`, padding: SPACE_16 }}>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>INVESTIGATION PANEL (8.9 PLACEHOLDER)</p>
      <p style={{ ...TYPE_BODY, color: TEXT_PRIMARY, marginTop: 8, textTransform: 'none', letterSpacing: 'normal' }}>
        Selection: {snapshot.selection ?? 'none'}
      </p>
      <p style={{ ...TYPE_BODY, color: TEXT_PRIMARY, marginTop: 8, textTransform: 'none', letterSpacing: 'normal' }}>
        Hover: {snapshot.hover ?? 'none'}
      </p>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: 8 }}>
        View mode: {snapshot.viewMode} · tick {snapshot.tick}
      </p>
    </div>
  )
}
