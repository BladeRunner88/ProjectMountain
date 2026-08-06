import { useState } from 'react'
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
} from '../../ase/tokens'
import { focusRingStyle, useFocusRing } from './focusRing'

// S9.6b convention #3: "THE RECOMMENDATION PATTERN." 9.6's Decision tab
// established this shape; every actionable surface (9.9 Detection, 9.10
// Prediction, 9.11 Revision, 9.12 Exposure) reuses this exact component
// rather than re-implementing the card.
export interface Recommendation {
  id: string
  action: string
  why: string
  confidencePct: number
  ifYouDoNothing: string
  onRun: () => void
  /** What the button reads once it's been run — defaults to a Revision-writing confirmation, since that's true of most of 9.6's own recommendations. Override for a surface where the consequence of running it is different (e.g. "DONE — RULE RETUNED"). */
  doneLabel?: string
}

export function RecommendationCard({ rec }: { rec: Recommendation }) {
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
      <p style={{ ...TYPE_BODY, color: TEXT_SECONDARY, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>{rec.why}</p>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_16 }}>CONFIDENCE {rec.confidencePct}%</p>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_16 }}>IF YOU DO NOTHING</p>
      <p style={{ ...TYPE_BODY, color: TEXT_SECONDARY, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>{rec.ifYouDoNothing}</p>
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

export function RecommendedSection({ recommendations, emptyMessage }: { recommendations: Recommendation[]; emptyMessage: string }) {
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
