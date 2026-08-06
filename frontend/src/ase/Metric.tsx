import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  BORDER_WIDTH,
  DEPENDENCY_DIM_OPACITY,
  HAIRLINE,
  MOTION_DEPENDENCY_DIM_MS,
  MOTION_DEPENDENCY_RESTORE_MS,
  MOTION_VALUE_FADE_MS,
  MOTION_VALUE_FLASH_MS,
  PANEL_RAISED,
  RADIUS_INTERACTIVE,
  SPACE_8,
  SPACE_12,
  TEXT_DIM,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  TOOLTIP_MAX_WIDTH_PX,
  TYPE_BODY,
  TYPE_CAPTION,
  TYPE_DISPLAY,
  Z_TOOLTIP,
} from './tokens'
import { confidence, dependents, firstUngroundedPath, provenance, renderProvenance } from './folds'
import { isDimmed, useHover } from './hover'
import { meaningBand, meaningColor, type MeaningBand } from './meaning'
import { useSelection } from './selection'
import { usePrefersReducedMotion } from './useReducedMotion'
import type { TracedValue } from './traced'

export interface MetricProps<T> {
  traced: TracedValue<T>
  label: string
  format?: (value: T) => string
  /** display = headline numerals only; body (default) = everything else (S1c's type scale — no third size). */
  size?: 'display' | 'body'
  /**
   * S1f rule 3: "every number is two links" — click the number selects it,
   * click the label navigates to the tab that owns it. Plain string (a
   * Control Room URL segment), not the shell's TabId type — ase/ doesn't
   * depend on components/controlRoom, that dependency only runs the other
   * way. Omit it and the label stays invisible, exactly like before this
   * block (most call sites, e.g. EvidenceTable rows, already show the claim
   * in context and don't need a second, redundant label).
   */
  ownerTab?: string
}

// The only legal path from a TracedValue to pixels. There is no sibling
// component that takes a raw number/string — a tab with a fact to show has
// a TracedValue for it, or it has no business rendering it yet (S1b).

function findProvenanceProblem<T>(traced: TracedValue<T>, label: string): string | null {
  if (!traced.derivation) {
    return `Metric "${label}" (${traced.id}): no derivation — every displayed fact must carry one`
  }
  const hops = provenance(traced)
  if (hops.length === 0) {
    return `Metric "${label}" (${traced.id}): provenance walk produced zero hops`
  }
  const badPath = firstUngroundedPath(traced)
  if (badPath) {
    return `Metric "${label}" (${traced.id}): ungrounded provenance — path ${badPath.join(' → ')} does not terminate in an observed/asserted derivation`
  }
  return null
}

export function Metric<T>({ traced, label, format, size = 'body', ownerTab }: MetricProps<T>) {
  const [tooltipOpen, setTooltipOpen] = useState(false)
  const [fadeIn, setFadeIn] = useState(true)
  const [flashing, setFlashing] = useState(false)
  const prevIdRef = useRef<string | undefined>(undefined)
  const prevBandRef = useRef<MeaningBand | undefined>(undefined)
  const { select, selection } = useSelection()
  const { cone, setHovered } = useHover()
  const reducedMotion = usePrefersReducedMotion()
  const problem = findProvenanceProblem(traced, label)

  // S9.6 fix: a Metric that unmounts while hovered (e.g. a List row's own
  // name, hovered right before the click that navigates away and unmounts
  // the whole table) never fires onMouseLeave — the hover cone was staying
  // stuck, dimming every other Metric on the page to 12% forever. Tracked
  // with a ref (not state) so this cleanup never fires on an ordinary
  // re-render, only on the real unmount.
  const isHoveredRef = useRef(false)
  useEffect(() => {
    return () => {
      if (isHoveredRef.current) setHovered(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // S1e: "when the underlying value changes" — a TracedValue is immutable,
  // so a new `id` arriving for the same Metric IS the change event. The
  // cross-fade always plays on a value change; the flash is S9.1h's own
  // correction — it fires ONLY when the meaning band actually crosses a
  // threshold (nominal→watch, watch→anomaly, ...), not on every routine
  // re-observation. A flash on every tick is noise; a flash on a real
  // state change is signal.
  useEffect(() => {
    const prevId = prevIdRef.current
    const prevBand = prevBandRef.current
    const currentBand = meaningBand(traced)
    prevIdRef.current = traced.id
    prevBandRef.current = currentBand
    if (prevId === undefined || prevId === traced.id) return
    setFadeIn(false)
    const raf = requestAnimationFrame(() => setFadeIn(true))
    if (prevBand !== undefined && prevBand !== currentBand) {
      setFlashing(true)
      const flashTimer = setTimeout(() => setFlashing(false), MOTION_VALUE_FLASH_MS)
      return () => {
        cancelAnimationFrame(raf)
        clearTimeout(flashTimer)
      }
    }
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [traced.id])

  if (problem) {
    if (import.meta.env.DEV) {
      throw new Error(problem)
    }
    // Production: never crash the screen over a bad trace — log it and
    // render a visibly-dim placeholder so the gap is honest, not hidden.
    console.error(problem)
    return (
      <span aria-label={label} data-metric-id={traced.id} style={{ color: TEXT_DIM }}>
        —
      </span>
    )
  }

  const text = format ? format(traced.value) : String(traced.value)
  const conf = confidence(traced)
  const dependentCount = dependents(traced.id).length
  const sentence = renderProvenance(provenance(traced))
  const type = size === 'display' ? TYPE_DISPLAY : TYPE_BODY
  const isSelected = selection?.kind === 'value' && selection.traced.id === traced.id
  const dimmed = isDimmed(cone, traced.id)

  function activate() {
    select({ kind: 'value', traced, label })
  }

  return (
    <span className="inline-flex flex-col items-start">
      {ownerTab && (
        <Link
          to={`/app/control-room/${ownerTab}`}
          style={{ ...TYPE_CAPTION, color: TEXT_DIM, display: 'block', marginBottom: SPACE_8 }}
          onClick={(e) => e.stopPropagation()}
        >
          {label}
        </Link>
      )}
      <span
        className="relative inline-block cursor-pointer"
        role="button"
        tabIndex={0}
        onMouseEnter={() => {
          isHoveredRef.current = true
          setTooltipOpen(true)
          setHovered(traced.id)
        }}
        onMouseLeave={() => {
          isHoveredRef.current = false
          setTooltipOpen(false)
          setHovered(null)
        }}
        onFocus={() => {
          isHoveredRef.current = true
          setTooltipOpen(true)
          setHovered(traced.id)
        }}
        onBlur={() => {
          isHoveredRef.current = false
          setTooltipOpen(false)
          setHovered(null)
        }}
        onClick={activate}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            activate()
          }
        }}
        aria-label={`${label}: ${text}, confidence ${Math.round(conf * 100)} percent`}
        aria-pressed={isSelected}
        data-metric-id={traced.id}
        style={{
          opacity: dimmed ? DEPENDENCY_DIM_OPACITY : 1,
          // S9.1h: the dim itself is meaningful and must still happen under
          // reduced motion — only the animated transition drops to instant.
          transition: `opacity ${reducedMotion ? 1 : dimmed ? MOTION_DEPENDENCY_DIM_MS : MOTION_DEPENDENCY_RESTORE_MS}ms var(--cr-ease-out)`,
        }}
      >
        <span
          className="font-mono"
          style={{
            fontSize: type.fontSize,
            fontWeight: type.fontWeight,
            letterSpacing: type.letterSpacing,
            color: TEXT_PRIMARY,
            opacity: fadeIn ? 1 : 0,
            // S9.1h: the cross-fade is pure decoration and is disabled under
            // reduced motion (instant opacity snap); the flash is meaningful
            // (a real threshold crossing) and still happens, just instantly.
            transition: `opacity ${reducedMotion ? 1 : MOTION_VALUE_FADE_MS}ms var(--cr-ease-out), background-color ${reducedMotion ? 1 : MOTION_VALUE_FLASH_MS}ms var(--cr-ease-out)`,
            backgroundColor: flashing ? meaningColor(traced) : 'transparent',
          }}
        >
          {text}
        </span>
        {tooltipOpen && (
          <span
            role="tooltip"
            className="absolute left-0 top-full whitespace-normal text-left"
            style={{
              zIndex: Z_TOOLTIP,
              marginTop: SPACE_8,
              width: 'max-content',
              maxWidth: TOOLTIP_MAX_WIDTH_PX,
              padding: `${SPACE_8}px ${SPACE_12}px`,
              background: PANEL_RAISED,
              border: `${BORDER_WIDTH}px solid ${HAIRLINE}`,
              borderRadius: RADIUS_INTERACTIVE,
              fontSize: TYPE_CAPTION.fontSize,
            }}
          >
            <span className="block" style={{ color: TEXT_PRIMARY, fontWeight: 400, letterSpacing: 'normal' }}>
              {label}
            </span>
            <span className="block" style={{ marginTop: SPACE_8, color: TEXT_SECONDARY, fontWeight: 400, letterSpacing: 'normal' }}>
              confidence {Math.round(conf * 100)}%
            </span>
            <span className="block" style={{ marginTop: SPACE_8, color: TEXT_SECONDARY, fontWeight: 400, letterSpacing: 'normal' }}>
              {sentence}
            </span>
            <span className="block" style={{ marginTop: SPACE_8, color: TEXT_DIM, fontWeight: 400, letterSpacing: 'normal' }}>
              {dependentCount} value{dependentCount === 1 ? '' : 's'} depend on this
            </span>
          </span>
        )}
      </span>
    </span>
  )
}
