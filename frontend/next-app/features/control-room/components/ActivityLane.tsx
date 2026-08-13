'use client'

import { useEffect, useState, type ReactElement } from 'react'
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
} from '@/features/ase/tokens'
import { formatElapsed, recentChanges } from '@/features/ase/services/activity'
import { allTraced } from '@/features/ase/services/graph'
import { useDataset } from '@/features/ase/client'
import { useFocusRing } from '../hooks/useFocusRing'
import { focusRingStyle } from '../services/focusRing'
import { useChromeStore } from '../stores/chromeStore'

export function ActivityLane(): ReactElement {
  const expanded = useChromeStore((s) => s.activityLaneExpanded)
  const toggleExpanded = useChromeStore((s) => s.toggleActivityLaneExpanded)
  const { tick } = useDataset()
  const [, forceTick] = useState(0)
  const { focused, handlers } = useFocusRing()

  useEffect(() => {
    const interval = setInterval(() => forceTick((n) => n + 1), 1000)
    return (): void => {
      clearInterval(interval)
    }
  }, [])

  void tick
  const changes = recentChanges(allTraced())
  const latestChange = changes[0]

  return (
    <div className="relative shrink-0" style={{ borderTop: `${BORDER_WIDTH}px solid ${HAIRLINE}`, background: PANEL }}>
      {expanded ? (
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
      ) : null}

      <button
        type="button"
        onClick={toggleExpanded}
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
        {latestChange ? (
          <>
            <span style={{ color: TEXT_PRIMARY }}>{latestChange.sentence}</span>
            &nbsp;—&nbsp;
            <span style={{ color: TEXT_DIM }}>{formatElapsed(latestChange.at)}</span>
          </>
        ) : (
          <span style={{ color: TEXT_DIM }}>No changes yet.</span>
        )}
      </button>
    </div>
  )
}
