'use client'

import type { ReactElement } from 'react'
import {
  BORDER_WIDTH,
  HAIRLINE,
  PANEL_RAISED,
  RADIUS_STATIC,
  SPACE_8,
  SPACE_16,
  SPACE_24,
  SPACE_32,
  TEXT_DIM,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  TYPE_BODY,
  TYPE_CAPTION,
  TYPE_DISPLAY,
} from '@/features/ase/tokens'
import { perSourceCoverage, readingCoverage, systemWideCoverage, type ContextEngineState, type Reading } from '@/features/ase/services/contextEngine'

export function MeaningCoverage({
  engine,
  selectedReading,
}: {
  engine: ContextEngineState
  selectedReading: Reading | null
}): ReactElement {
  const system = systemWideCoverage(engine)
  const perSource = perSourceCoverage(engine)

  return (
    <div>
      <div className="grid grid-cols-2" style={{ gap: SPACE_16 }}>
        <ScopeCard
          label="ACROSS ALL SOURCES"
          pct={system.pct}
          detail={`${system.boundFields} of ${system.totalFields} distinct incoming fields are bound`}
        />
        {selectedReading ? (
          <ScopeCard
            label="THIS READING"
            pct={readingCoverage(selectedReading).pct}
            detail={`${readingCoverage(selectedReading).boundFields} of ${readingCoverage(selectedReading).totalFields} fields in the selected reading were bound`}
          />
        ) : (
          <div
            style={{
              padding: SPACE_16,
              background: PANEL_RAISED,
              borderRadius: RADIUS_STATIC,
              border: `${BORDER_WIDTH}px solid ${HAIRLINE}`,
            }}
          >
            <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>THIS READING</p>
            <p style={{ ...TYPE_BODY, color: TEXT_DIM, marginTop: SPACE_16 }}>Select a reading in List to compare its own coverage.</p>
          </div>
        )}
      </div>

      <div style={{ marginTop: SPACE_32 }}>
        <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>PER SOURCE</p>
        <div style={{ marginTop: SPACE_16 }}>
          {perSource.length === 0 ? (
            <p style={{ ...TYPE_BODY, color: TEXT_DIM }}>No sources have sent readings.</p>
          ) : (
            <>
              <div
                className="flex"
                style={{ ...TYPE_CAPTION, color: TEXT_DIM, borderBottom: `${BORDER_WIDTH}px solid ${HAIRLINE}`, paddingBottom: SPACE_8 }}
              >
                <span style={{ flex: 1.5 }}>SOURCE</span>
                <span style={{ flex: 1 }}>RECEIVED</span>
                <span style={{ flex: 1 }}>BOUND</span>
                <span style={{ flex: 1 }}>COVERAGE</span>
                <span style={{ flex: 3 }}>STILL UNBOUND</span>
              </div>
              {perSource.map((row) => (
                <div
                  key={row.source}
                  className="flex items-center"
                  style={{ padding: `${SPACE_8}px 0`, borderBottom: `${BORDER_WIDTH}px solid ${HAIRLINE}` }}
                >
                  <span style={{ ...TYPE_BODY, color: TEXT_PRIMARY, flex: 1.5 }}>{row.source}</span>
                  <span className="font-mono" style={{ ...TYPE_BODY, color: TEXT_SECONDARY, flex: 1 }}>
                    {row.received}
                  </span>
                  <span className="font-mono" style={{ ...TYPE_BODY, color: TEXT_SECONDARY, flex: 1 }}>
                    {row.boundCount}
                  </span>
                  <span className="font-mono" style={{ ...TYPE_BODY, color: TEXT_PRIMARY, flex: 1 }}>
                    {row.pct}%
                  </span>
                  <span className="font-mono" style={{ ...TYPE_BODY, color: TEXT_DIM, flex: 3 }}>
                    {row.stillUnbound.length > 0 ? row.stillUnbound.join(', ') : '—'}
                  </span>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_24, textTransform: 'none', letterSpacing: 'normal' }}>
        A system claiming to understand 100% of every payload is not credible. One that measures its own coverage is.
      </p>
    </div>
  )
}

function ScopeCard({ label, pct, detail }: { label: string; pct: number; detail: string }): ReactElement {
  return (
    <div
      style={{
        padding: SPACE_16,
        background: PANEL_RAISED,
        borderRadius: RADIUS_STATIC,
        border: `${BORDER_WIDTH}px solid ${HAIRLINE}`,
      }}
    >
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>{label}</p>
      <p className="font-mono" style={{ ...TYPE_DISPLAY, color: TEXT_PRIMARY, marginTop: SPACE_8 }}>
        {pct}%
      </p>
      <p style={{ ...TYPE_BODY, color: TEXT_SECONDARY, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>{detail}</p>
    </div>
  )
}
