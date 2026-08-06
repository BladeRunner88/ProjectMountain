import { useEffect, useState } from 'react'
import {
  ACTIVITY_LANE_EXPANDED_MAX_HEIGHT,
  ACTIVITY_LANE_HEIGHT,
  BORDER_WIDTH,
  HAIRLINE,
  PANEL,
  SPACE_8,
  SPACE_16,
  TEXT_DIM,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  TYPE_BODY,
  TYPE_CAPTION,
  Z_ACTIVITY_LANE,
} from '../../ase/tokens'
import { formatElapsed, recentChanges } from '../../ase/activity'
import { allTraced } from '../../ase/graph'
import { focusRingStyle, useFocusRing } from './focusRing'

const EXPANDED_KEY = 'controlRoom.activityLane.expanded'

function readExpanded(): boolean {
  try {
    return localStorage.getItem(EXPANDED_KEY) === '1'
  } catch {
    return false
  }
}

// A persistent strip at the bottom of the Control Room (S1e) — "the thing
// that makes the system feel alive between demo moments." Reads real
// supersession events off the graph; with no live tick feeding the app yet
// (that's 9.1f+), the feed is honestly empty today rather than showing a
// fabricated "most recent change".
export function ActivityLane() {
  const [expanded, setExpanded] = useState(readExpanded)
  const [, forceTick] = useState(0)
  const { focused, handlers } = useFocusRing()

  useEffect(() => {
    const interval = setInterval(() => forceTick((n) => n + 1), 1000)
    return () => clearInterval(interval)
  }, [])

  const changes = recentChanges(allTraced())
  const latest = changes[0]

  function toggle() {
    setExpanded((prev) => {
      const next = !prev
      try {
        localStorage.setItem(EXPANDED_KEY, next ? '1' : '0')
      } catch {
        // best-effort persistence only
      }
      return next
    })
  }

  return (
    <div className="relative shrink-0" style={{ borderTop: `${BORDER_WIDTH}px solid ${HAIRLINE}`, background: PANEL }}>
      {expanded && (
        <div
          className="absolute bottom-full left-0 right-0 overflow-y-auto"
          style={{
            maxHeight: ACTIVITY_LANE_EXPANDED_MAX_HEIGHT,
            background: PANEL,
            borderTop: `${BORDER_WIDTH}px solid ${HAIRLINE}`,
            zIndex: Z_ACTIVITY_LANE,
            padding: SPACE_8,
          }}
        >
          {changes.length === 0 ? (
            <p style={{ ...TYPE_BODY, color: TEXT_DIM, padding: SPACE_8 }}>No changes yet.</p>
          ) : (
            changes.map((c) => (
              <p key={c.oldId} style={{ ...TYPE_BODY, color: TEXT_SECONDARY, padding: SPACE_8 }}>
                <span style={{ color: TEXT_PRIMARY }}>{c.sentence}</span>
                {' — '}
                <span style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>{formatElapsed(c.at)}</span>
              </p>
            ))
          )}
        </div>
      )}

      <button
        type="button"
        onClick={toggle}
        aria-expanded={expanded}
        {...handlers}
        className="pressable flex w-full items-center"
        style={{
          height: ACTIVITY_LANE_HEIGHT,
          padding: `0 ${SPACE_16}px`,
          ...TYPE_BODY,
          color: TEXT_SECONDARY,
          ...focusRingStyle(focused),
        }}
      >
        {latest ? (
          <>
            <span style={{ color: TEXT_PRIMARY }}>{latest.sentence}</span>
            &nbsp;—&nbsp;
            <span style={{ color: TEXT_DIM }}>{formatElapsed(latest.at)}</span>
          </>
        ) : (
          <span style={{ color: TEXT_DIM }}>No changes yet.</span>
        )}
      </button>
    </div>
  )
}
