import { useEffect, useRef, useState } from 'react'
import {
  BORDER_WIDTH,
  HAIRLINE,
  NOMINAL,
  PANEL_RAISED,
  RADIUS_INTERACTIVE,
  SCRUBBER_MARK_SIZE,
  SCRUBBER_TRACK_MARGIN,
  SCRUBBER_WIDTH,
  SPACE_8,
  SPACE_12,
  SPACE_16,
  TEXT_DIM,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  TYPE_BODY,
  TYPE_CAPTION,
  WATCH,
  Z_SCRUBBER,
} from '../../ase/tokens'
import { formatHistoricalMoment } from '../../ase/bitemporal'
import { useAsOf } from '../../ase/asOfContext'
import type { Instant } from '../../ase/traced'
import { focusRingStyle, useFocusRing } from './focusRing'
import { DirectManipulationSlider } from './DirectManipulationSlider'

const WINDOW_MINUTES = 24 * 60

function instantToMinutesAgo(t: Instant): number {
  return Math.round((Date.now() - new Date(t).getTime()) / 60000)
}
function minutesAgoToInstant(m: number): Instant {
  return new Date(Date.now() - m * 60000).toISOString() as Instant
}

// The [ ⏱ Now ▾ ] control from S1d, finally wired (S3, corrected by S9.1h):
// drag to any point in the last 24h and the whole Control Room re-renders
// from that transaction-time view. Committing the drag is debounced to a
// single animation frame — never a timer (S9.1h: "debounce the expensive
// recompute to one frame") — so the slider's own position updates
// instantly for responsiveness while `setAt` (which every tab re-resolves
// its facts against) fires at most once per frame during a fast drag.
export function Scrubber({ onClose }: { onClose: () => void }) {
  const { at, setAt, returnToLive, changePoints } = useAsOf()
  const [minutesAgo, setMinutesAgo] = useState(() => (at === 'now' ? 0 : instantToMinutesAgo(at)))
  const rafRef = useRef<number | null>(null)
  const { focused: liveFocused, handlers: liveHandlers } = useFocusRing()

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  function commit(next: number) {
    setMinutesAgo(next)
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      setAt(next === 0 ? 'now' : minutesAgoToInstant(next))
    })
  }

  function handleReturnToLive() {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    setMinutesAgo(0)
    returnToLive()
  }

  const label = minutesAgo === 0 ? 'Now' : formatHistoricalMoment(minutesAgoToInstant(minutesAgo))

  return (
    <>
      <div className="fixed inset-0" style={{ zIndex: Z_SCRUBBER - 1 }} onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-label="As-of scrubber"
        className="absolute right-0"
        style={{
          top: '100%',
          zIndex: Z_SCRUBBER,
          width: SCRUBBER_WIDTH,
          marginTop: SPACE_8,
          background: PANEL_RAISED,
          border: `${BORDER_WIDTH}px solid ${HAIRLINE}`,
          borderRadius: RADIUS_INTERACTIVE,
          padding: SPACE_16,
        }}
      >
        <div className="flex items-center justify-between">
          <p style={{ ...TYPE_BODY, color: TEXT_PRIMARY }}>{label}</p>
          {minutesAgo !== 0 && (
            <button
              type="button"
              onClick={handleReturnToLive}
              {...liveHandlers}
              className="pressable"
              style={{ ...TYPE_CAPTION, color: NOMINAL, textTransform: 'none', letterSpacing: 'normal', ...focusRingStyle(liveFocused) }}
            >
              Return to Now
            </button>
          )}
        </div>

        <div className="relative" style={{ marginTop: SPACE_16 }}>
          <DirectManipulationSlider
            min={0}
            max={WINDOW_MINUTES}
            step={1}
            // The track reads left (24h ago) to right (now), so the slider
            // value is "minutes ago counting down" — invert for this
            // component's own left-to-right-increasing semantics.
            value={WINDOW_MINUTES - minutesAgo}
            onChange={(v) => commit(WINDOW_MINUTES - v)}
            ariaLabel="As-of time"
            formatValue={() => label}
            accentColor={minutesAgo === 0 ? NOMINAL : WATCH}
            momentum
          />
          <div
            className="pointer-events-none absolute top-1/2"
            style={{ left: SCRUBBER_TRACK_MARGIN, right: SCRUBBER_TRACK_MARGIN }}
          >
            {changePoints.map((t) => {
              const ageMin = instantToMinutesAgo(t)
              if (ageMin < 0 || ageMin > WINDOW_MINUTES) return null
              const percentFromLeft = ((WINDOW_MINUTES - ageMin) / WINDOW_MINUTES) * 100
              return (
                <span
                  key={t}
                  aria-hidden
                  className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
                  style={{
                    left: `${percentFromLeft}%`,
                    width: SCRUBBER_MARK_SIZE,
                    height: SCRUBBER_MARK_SIZE,
                    background: TEXT_DIM,
                  }}
                />
              )
            })}
          </div>
        </div>

        <div className="flex items-center justify-between" style={{ marginTop: SPACE_12 }}>
          <span style={{ ...TYPE_CAPTION, color: TEXT_SECONDARY }}>24H AGO</span>
          <span style={{ ...TYPE_CAPTION, color: TEXT_SECONDARY }}>NOW</span>
        </div>
      </div>
    </>
  )
}
