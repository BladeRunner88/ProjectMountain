'use client'

import { useState, type ReactElement } from 'react'
import {
  BORDER_WIDTH,
  HAIRLINE,
  HUMAN,
  NOMINAL,
  PANEL_RAISED,
  RADIUS_INTERACTIVE,
  RADIUS_STATIC,
  SPACE_16,
  SPACE_8,
  TEXT_DIM,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  TYPE_BODY,
  TYPE_CAPTION,
} from '@/features/ase/tokens'
import { useFocusRing } from '../hooks/useFocusRing'
import { focusRingStyle } from '../services/focusRing'

export interface Recommendation {
  id: string
  action: string
  why: string
  confidencePct: number
  ifYouDoNothing: string
  onRun: () => void
  doneLabel?: string
}

export function RecommendationCard({ rec }: { rec: Recommendation }): ReactElement {
  const [done, setDone] = useState(false)
  const { focused, handlers } = useFocusRing()
  return (
    <div
      style={{
        padding: SPACE_16,
        background: PANEL_RAISED,
        borderRadius: RADIUS_STATIC,
        border: `${BORDER_WIDTH}px solid ${HUMAN}`,
        marginBottom: SPACE_16,
      }}
    >
      <p style={{ ...TYPE_BODY, color: TEXT_PRIMARY }}>{rec.action}</p>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_8 }}>WHY</p>
      <p style={{ ...TYPE_BODY, color: TEXT_SECONDARY, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
        {rec.why}
      </p>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_16 }}>CONFIDENCE {rec.confidencePct}%</p>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_16 }}>IF YOU DO NOTHING</p>
      <p style={{ ...TYPE_BODY, color: TEXT_SECONDARY, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
        {rec.ifYouDoNothing}
      </p>
      <button
        type="button"
        disabled={done}
        onClick={() => {
          rec.onRun()
          setDone(true)
        }}
        {...handlers}
        className="pressable"
        style={{
          ...TYPE_CAPTION,
          textTransform: 'none',
          letterSpacing: 'normal',
          color: done ? TEXT_DIM : NOMINAL,
          border: `${BORDER_WIDTH}px solid ${done ? HAIRLINE : NOMINAL}`,
          borderRadius: RADIUS_INTERACTIVE,
          padding: `${SPACE_8}px ${SPACE_16}px`,
          marginTop: SPACE_16,
          cursor: done ? 'default' : 'pointer',
          ...focusRingStyle(focused),
        }}
      >
        {done ? (rec.doneLabel ?? 'DONE — WRITTEN TO REVISION') : rec.action.toUpperCase()}
      </button>
    </div>
  )
}

export function RecommendedSection({
  recommendations,
  emptyMessage,
}: {
  recommendations: Recommendation[]
  emptyMessage: string
}): ReactElement {
  return (
    <div>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>RECOMMENDED</p>
      {recommendations.length === 0 ? (
        <p style={{ ...TYPE_BODY, color: TEXT_DIM, marginTop: SPACE_16 }}>{emptyMessage}</p>
      ) : (
        <div style={{ marginTop: SPACE_16 }}>
          {recommendations.map((r) => (
            <RecommendationCard key={r.id} rec={r} />
          ))}
        </div>
      )}
    </div>
  )
}
