'use client'

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactElement } from 'react'
import {
  HAIRLINE,
  PANEL_RAISED,
  SLIDER_HANDLE_SIZE,
  SLIDER_RUBBER_BAND_PX,
  SLIDER_TRACK_HEIGHT,
  TEXT_DIM,
  WATCH,
} from '@/features/ase/tokens'
import { usePrefersReducedMotion } from '@/features/ase/client'
import { driveSprings, rubberBand, Spring, SPRING_SETTLE } from '../services/motionPhysics'
import { useFocusRing } from '../hooks/useFocusRing'
import { focusRingStyle } from '../services/focusRing'

export interface DirectManipulationSliderProps {
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
  ariaLabel: string
  formatValue?: (value: number) => string
  bigStep?: number
  accentColor?: string
  momentum?: boolean
}

const MOMENTUM_PROJECTION_MS = 180
const MOMENTUM_VELOCITY_SAMPLE_WINDOW_MS = 100

export function DirectManipulationSlider({
  value,
  min,
  max,
  step,
  onChange,
  ariaLabel,
  formatValue,
  bigStep,
  accentColor = WATCH,
  momentum = false,
}: DirectManipulationSliderProps): ReactElement {
  const trackRef = useRef<HTMLDivElement>(null)
  const [trackWidth, setTrackWidth] = useState(240)
  const { focused, handlers: focusHandlers } = useFocusRing()
  const reducedMotion = usePrefersReducedMotion()

  useEffect(() => {
    const el = trackRef.current
    if (!el) return undefined
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setTrackWidth(entry.contentRect.width)
    })
    ro.observe(el)
    return (): void => {
      ro.disconnect()
    }
  }, [])

  const valueToFraction = (v: number): number => (max === min ? 0 : (v - min) / (max - min))
  const fractionToValue = (f: number): number => min + f * (max - min)

  const visualFraction = useRef(new Spring(valueToFraction(value), SPRING_SETTLE))
  const draggingRef = useRef(false)
  const grabOffsetPxRef = useRef(0)
  const velocitySamplesRef = useRef<{ fraction: number; t: number }[]>([])
  const [displayFraction, setDisplayFraction] = useState(() => valueToFraction(value))
  const [dragging, setDragging] = useState(false)

  function emitFromFraction(fraction: number): void {
    const clampedValue = Math.min(max, Math.max(min, fractionToValue(Math.min(1, Math.max(0, fraction)))))
    onChange(Math.round(clampedValue / step) * step)
  }

  useEffect(() => {
    if (!draggingRef.current) {
      visualFraction.current.setTarget(valueToFraction(value))
    }
  }, [value, max, min])

  useEffect(() => {
    const stop = driveSprings(
      [visualFraction.current],
      () => {
        if (momentum && !draggingRef.current) emitFromFraction(visualFraction.current.value)
        setDisplayFraction(visualFraction.current.value)
      },
      () => true
    )
    return stop
  }, [momentum])

  function pxToFraction(clientX: number): number {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect) return 0
    return (clientX - grabOffsetPxRef.current - rect.left) / trackWidth
  }

  function commitFromFraction(rawFraction: number, live: boolean): void {
    const rubberBandFraction = rubberBand(rawFraction, 0, 1, 0.55, SLIDER_RUBBER_BAND_PX / trackWidth)
    if (live) {
      visualFraction.current.jumpTo(rubberBandFraction)
    }
    emitFromFraction(rawFraction)
    setDisplayFraction(visualFraction.current.value)
  }

  function onHandlePointerDown(e: PointerEvent<HTMLDivElement>): void {
    ;(e.target as Element).setPointerCapture(e.pointerId)
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect) return
    const handleCenterX = rect.left + visualFraction.current.value * trackWidth
    grabOffsetPxRef.current = e.clientX - handleCenterX
    draggingRef.current = true
    setDragging(true)
    velocitySamplesRef.current = [{ fraction: visualFraction.current.value, t: performance.now() }]
    setDisplayFraction(visualFraction.current.value)
  }

  function onHandlePointerMove(e: PointerEvent<HTMLDivElement>): void {
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

  function onHandlePointerUp(): void {
    draggingRef.current = false
    setDragging(false)
    const restingFraction = Math.min(1, Math.max(0, visualFraction.current.value))

    if (momentum) {
      const samples = velocitySamplesRef.current
      const oldest = samples[0]
      const newest = samples[samples.length - 1]
      if (!oldest || !newest) return
      const dt = newest.t - oldest.t
      const velocityPerMs = dt > 0 ? (newest.fraction - oldest.fraction) / dt : 0
      const projected = newest.fraction + velocityPerMs * MOMENTUM_PROJECTION_MS
      const target = Math.min(1, Math.max(0, projected))
      visualFraction.current.setTarget(target)
      visualFraction.current.addVelocity(velocityPerMs * 1000)
      emitFromFraction(target)
    } else {
      visualFraction.current.setTarget(restingFraction)
    }
    driveSprings([visualFraction.current], () => setDisplayFraction(visualFraction.current.value), () => true)
  }

  function onTrackPointerDown(e: PointerEvent<HTMLDivElement>): void {
    if (e.target !== trackRef.current) return
    grabOffsetPxRef.current = 0
    commitFromFraction(pxToFraction(e.clientX), true)
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>): void {
    const big = bigStep ?? step * 10
    const delta =
      e.key === 'ArrowRight' || e.key === 'ArrowUp'
        ? e.shiftKey
          ? big
          : step
        : e.key === 'ArrowLeft' || e.key === 'ArrowDown'
          ? -(e.shiftKey ? big : step)
          : 0
    if (delta === 0) return
    e.preventDefault()
    const next = Math.min(max, Math.max(min, value + delta))
    onChange(Math.round(next / step) * step)
    visualFraction.current.jumpTo(valueToFraction(next))
    setDisplayFraction(valueToFraction(next))
  }

  const handleLeftPx = displayFraction * trackWidth
  const fillWidthPx = Math.min(Math.max(handleLeftPx, 0), trackWidth)

  return (
    <div
      ref={trackRef}
      onPointerDown={onTrackPointerDown}
      className="relative"
      style={{ height: Math.max(SLIDER_HANDLE_SIZE, 24), display: 'flex', alignItems: 'center', cursor: 'pointer', touchAction: 'none' }}
    >
      <div
        className="absolute"
        style={{ left: 0, right: 0, height: SLIDER_TRACK_HEIGHT, background: HAIRLINE, borderRadius: SLIDER_TRACK_HEIGHT / 2 }}
      />
      <div
        className="absolute"
        style={{
          left: 0,
          width: fillWidthPx,
          height: SLIDER_TRACK_HEIGHT,
          background: accentColor,
          borderRadius: SLIDER_TRACK_HEIGHT / 2,
          opacity: 0.7,
        }}
      />
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
          boxShadow: dragging ? `0 0 0 4px ${accentColor}33` : 'none',
          transition: reducedMotion ? 'none' : 'box-shadow 120ms var(--cr-ease-out)',
          ...focusRingStyle(focused),
        }}
      />
      {formatValue ? (
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
      ) : null}
    </div>
  )
}
