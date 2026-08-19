'use client'

import { useSyncExternalStore, type ReactElement } from 'react'
import { graphStore } from '../stores/graphStore'
import { CANVAS, HAIRLINE, TEXT_DIM, TEXT_PRIMARY } from '@/features/ase/tokens'
import type { ViewMode } from '../types/graph'

const MODES: { mode: ViewMode; label: string }[] = [
  { mode: 'network', label: 'Network' },
  { mode: 'strata', label: 'Strata' },
  { mode: 'terrain', label: 'Terrain' },
]

export function ViewModeSwitch(): ReactElement {
  const snapshot = useSyncExternalStore(graphStore.subscribe, graphStore.getSnapshot, graphStore.getServerSnapshot)

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
