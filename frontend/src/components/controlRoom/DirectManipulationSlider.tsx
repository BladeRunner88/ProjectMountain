import { useEffect, useRef, useState } from 'react'
import { HAIRLINE, PANEL_RAISED, SLIDER_HANDLE_SIZE, SLIDER_RUBBER_BAND_PX, SLIDER_TRACK_HEIGHT, TEXT_DIM, WATCH } from '../../ase/tokens'
import { driveSprings, rubberBand, Spring, SPRING_SETTLE } from './motionPhysics'
import { usePrefersReducedMotion } from '../../ase/useReducedMotion'
import { focusRingStyle, useFocusRing } from './focusRing'

export interface DirectManipulationSliderProps {
  value: number
  min: number
  max: number
  step: number
  /** Called continuously — on every pointer move during a drag AND on every keyboard step. This is the whole point (S9.1h): a slider that only reports on release is a form field, one that reports continuously is a simulation. */
  onChange: (value: number) => void
  ariaLabel: string
  formatValue?: (value: number) => string
  /** Bigger keyboard step with Shift held — defaults to 10x `step`. */
  bigStep?: number
  accentColor?: string
  /** The as-of scrubber's own ask (S9.1h): "project momentum on release — a flick lands where the gesture was going, not where the pointer stopped." Off by default; a plain threshold/weight slider has no reason to overshoot its release point. */
  momentum?: boolean
}

const MOMENTUM_PROJECTION_MS = 180
const MOMENTUM_VELOCITY_SAMPLE_WINDOW_MS = 100

// S9.1h's own "biggest win": direct manipulation, not an `<input>`.
// Responds on pointer-down, tracks 1:1 with the pointer respecting the
// grab offset, rubber-bands past the ends, and settles with a
// critically-damped spring on release — never a hard stop, never
// unbounded travel. Reused by Detection/Tuning's threshold and
// Identity/Method's weights.
export function DirectManipulationSlider({ value, min, max, step, onChange, ariaLabel, formatValue, bigStep, accentColor = WATCH, momentum = false }: DirectManipulationSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [trackWidth, setTrackWidth] = useState(240)
  const { focused, handlers: focusHandlers } = useFocusRing()
  const reducedMotion = usePrefersReducedMotion()

  useEffect(() => {
    const el = trackRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setTrackWidth(entry.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const valueToFraction = (v: number) => (max === min ? 0 : (v - min) / (max - min))
  const fractionToValue = (f: number) => min + f * (max - min)

  // The handle's own VISUAL position, in fraction-of-track units — this is
  // the thing that rubber-bands and springs; `value` (reported to the
  // caller) is always clamped to [min, max] regardless of how far the
  // visual handle has been pulled past an edge.
  const visualFraction = useRef(new Spring(valueToFraction(value), SPRING_SETTLE))
  const draggingRef = useRef(false)
  const grabOffsetPxRef = useRef(0)
  const velocitySamplesRef = useRef<{ fraction: number; t: number }[]>([])
  const [, forceRender] = useState(0)

  function emitFromFraction(fraction: number) {
    const clampedValue = Math.min(max, Math.max(min, fractionToValue(Math.min(1, Math.max(0, fraction)))))
    onChange(Math.round(clampedValue / step) * step)
  }

  // External value changes (not from our own drag) re-target the spring
  // rather than jumping — e.g. another control resetting the threshold.
  useEffect(() => {
    if (!draggingRef.current) {
      visualFraction.current.setTarget(valueToFraction(value))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  useEffect(() => {
    const stop = driveSprings(
      [visualFraction.current],
      () => {
        // Momentum mode reports the value every settling frame, so a flick
        // visibly "travels" toward its projected landing spot — no seam
        // between dragging and animating. Plain sliders don't need this:
        // the drag already committed the real value, and a release-time
        // rubber-band correction returns to that SAME value, not a new one.
        if (momentum && !draggingRef.current) emitFromFraction(visualFraction.current.value)
        forceRender((n) => n + 1)
      },
      () => true
    )
    return stop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [momentum])

  function pxToFraction(clientX: number): number {
    const rect = trackRef.current!.getBoundingClientRect()
    return (clientX - grabOffsetPxRef.current - rect.left) / trackWidth
  }

  function commitFromFraction(rawFraction: number, live: boolean) {
    const rubberBandFraction = rubberBand(rawFraction, 0, 1, 0.55, SLIDER_RUBBER_BAND_PX / trackWidth)
    if (live) {
      visualFraction.current.jumpTo(rubberBandFraction)
    }
    emitFromFraction(rawFraction)
    forceRender((n) => n + 1)
  }

  function onHandlePointerDown(e: React.PointerEvent) {
    ;(e.target as Element).setPointerCapture(e.pointerId)
    const rect = trackRef.current!.getBoundingClientRect()
    const handleCenterX = rect.left + visualFraction.current.value * trackWidth
    grabOffsetPxRef.current = e.clientX - handleCenterX
    draggingRef.current = true
    velocitySamplesRef.current = [{ fraction: visualFraction.current.value, t: performance.now() }]
    forceRender((n) => n + 1)
  }
  function onHandlePointerMove(e: React.PointerEvent) {
    if (!draggingRef.current) return
    const fraction = pxToFraction(e.clientX)
    commitFromFraction(fraction, true)
    if (momentum) {
      const now = performance.now()
      const samples = velocitySamplesRef.current
      samples.push({ fraction: visualFraction.current.value, t: now })
      while (samples.length > 1 && now - samples[0].t > MOMENTUM_VELOCITY_SAMPLE_WINDOW_MS) samples.shift()
    }
  }
  function onHandlePointerUp() {
    draggingRef.current = false
    const restingFraction = Math.min(1, Math.max(0, visualFraction.current.value))

    if (momentum) {
      const samples = velocitySamplesRef.current
      const oldest = samples[0]
      const newest = samples[samples.length - 1]
      const dt = newest.t - oldest.t
      // px/ms-equivalent fraction velocity, projected forward — "a flick
      // lands where the gesture was going, not where the pointer stopped."
      const velocityPerMs = dt > 0 ? (newest.fraction - oldest.fraction) / dt : 0
      const projected = newest.fraction + velocityPerMs * MOMENTUM_PROJECTION_MS
      const target = Math.min(1, Math.max(0, projected))
      visualFraction.current.setTarget(target)
      visualFraction.current.addVelocity(velocityPerMs * 1000) // the spring integrates in seconds; velocityPerMs is fraction-per-millisecond
      emitFromFraction(target)
    } else {
      // release: snap the visual fraction's TARGET back into [0,1] — the
      // spring (already running via driveSprings) carries it there smoothly
      // from wherever the rubber band left it, no bounce (dampingRatio 1).
      visualFraction.current.setTarget(restingFraction)
    }
    driveSprings([visualFraction.current], () => forceRender((n) => n + 1), () => true)
  }

  function onTrackPointerDown(e: React.PointerEvent) {
    if (e.target !== trackRef.current) return
    grabOffsetPxRef.current = 0
    commitFromFraction(pxToFraction(e.clientX), true)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const big = bigStep ?? step * 10
    const delta = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? (e.shiftKey ? big : step) : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -(e.shiftKey ? big : step) : 0
    if (delta === 0) return
    e.preventDefault()
    const next = Math.min(max, Math.max(min, value + delta))
    onChange(Math.round(next / step) * step)
    visualFraction.current.jumpTo(valueToFraction(next)) // no animation on keyboard changes (S9.1h)
    forceRender((n) => n + 1)
  }

  const displayFraction = visualFraction.current.value
  const handleLeftPx = displayFraction * trackWidth
  const fillWidthPx = Math.min(Math.max(handleLeftPx, 0), trackWidth)

  return (
    <div
      ref={trackRef}
      onPointerDown={onTrackPointerDown}
      className="relative"
      style={{ height: Math.max(SLIDER_HANDLE_SIZE, 24), display: 'flex', alignItems: 'center', cursor: 'pointer', touchAction: 'none' }}
    >
      <div className="absolute" style={{ left: 0, right: 0, height: SLIDER_TRACK_HEIGHT, background: HAIRLINE, borderRadius: SLIDER_TRACK_HEIGHT / 2 }} />
      <div className="absolute" style={{ left: 0, width: fillWidthPx, height: SLIDER_TRACK_HEIGHT, background: accentColor, borderRadius: SLIDER_TRACK_HEIGHT / 2, opacity: 0.7 }} />
      <div
        role="slider"
        tabIndex={0}
        aria-label={ariaLabel}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={formatValue ? formatValue(value) : String(value)}
        onPointerDown={onHandlePointerDown}
        onPointerMove={onHandlePointerMove}
        onPointerUp={onHandlePointerUp}
        onKeyDown={onKeyDown}
        {...focusHandlers}
        className="absolute pressable"
        style={{
          left: handleLeftPx - SLIDER_HANDLE_SIZE / 2,
          width: SLIDER_HANDLE_SIZE,
          height: SLIDER_HANDLE_SIZE,
          borderRadius: '50%',
          background: PANEL_RAISED,
          border: `2px solid ${accentColor}`,
          cursor: 'grab',
          boxShadow: draggingRef.current ? `0 0 0 4px ${accentColor}33` : 'none',
          transition: reducedMotion ? 'none' : 'box-shadow 120ms var(--cr-ease-out)',
          ...focusRingStyle(focused),
        }}
      />
      {formatValue && (
        <div
          aria-hidden
          className="absolute font-mono"
          style={{
            left: Math.min(Math.max(handleLeftPx, 20), trackWidth - 20),
            transform: 'translateX(-50%)',
            top: -18,
            fontSize: 11,
            color: TEXT_DIM,
            whiteSpace: 'nowrap',
          }}
        >
          {formatValue(value)}
        </div>
      )}
    </div>
  )
}
