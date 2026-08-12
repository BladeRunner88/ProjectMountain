// S8.7: the segmented control — Network · Strata · Terrain — that decides
// which single view GraphNext.tsx mounts. Reads/writes graphStore.viewMode
// directly rather than page-local state: S8.2 rule 1, "one store", which
// view is showing is graph state like any other.

import { useSyncExternalStore } from 'react'
import { graphStore } from '../../graph/graphStore'
import { CANVAS, HAIRLINE, TEXT_DIM, TEXT_PRIMARY } from '../../ase/tokens'
import type { ViewMode } from '../../graph/types'

const MODES: { mode: ViewMode; label: string }[] = [
  { mode: 'network', label: 'Network' },
  { mode: 'strata', label: 'Strata' },
  { mode: 'terrain', label: 'Terrain' },
]

export function ViewModeSwitch() {
  const snapshot = useSyncExternalStore(graphStore.subscribe, graphStore.getSnapshot)

  return (
    <div className="inline-flex items-center" style={{ border: `1px solid ${HAIRLINE}`, borderRadius: 4, overflow: 'hidden' }}>
      {MODES.map((m) => {
        const active = snapshot.viewMode === m.mode
        return (
          <button
            key={m.mode}
            type="button"
            onClick={() => graphStore.setViewMode(m.mode)}
            className="pressable font-mono"
            style={{
              fontSize: 11,
              letterSpacing: '0.05em',
              padding: '5px 12px',
              background: active ? TEXT_PRIMARY : 'transparent',
              color: active ? CANVAS : TEXT_DIM,
              border: 'none',
              cursor: 'pointer',
            }}
          >
            {m.label.toUpperCase()}
          </button>
        )
      })}
    </div>
  )
}
