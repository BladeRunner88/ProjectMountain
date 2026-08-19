'use client'

import { useLayoutEffect, useMemo, useRef, useState, type MutableRefObject, type ReactElement } from 'react'
import { useRouter } from 'next/navigation'
import {
  BORDER_WIDTH,
  HAIRLINE,
  PANEL_RAISED,
  RADIUS_INTERACTIVE,
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
import { Metric, useSelection } from '@/features/ase/client'
import { meaningBand, meaningColor } from '@/features/ase/services/meaning'
import { maskedSerial } from '@/features/ase/services/serial'
import { formatElapsed } from '@/features/ase/services/activity'
import type { BoundStatement, Reading } from '@/features/ase/services/contextEngine'
import type { TracedValue } from '@/features/ase/services/traced'
import { focusRingStyle, tabHref, useFocusRing } from '@/features/control-room'

type RefMap = MutableRefObject<Record<string, HTMLElement | null>>

export function MeaningReading({ reading, onBindField }: { reading: Reading; onBindField: (fieldKey: string) => void }): ReactElement {
  const [rawOpen, setRawOpen] = useState(false)
  const [hoveredField, setHoveredField] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const boundRowRefs = useRef<Record<string, HTMLElement | null>>({})
  const rawLineRefs = useRef<Record<string, HTMLElement | null>>({})
  const [lines, setLines] = useState<{ key: string; x1: number; y1: number; x2: number; y2: number }[]>([])
  const rawKeys = useMemo(() => Object.keys(reading.raw), [reading])

  useLayoutEffect(() => {
    if (!rawOpen) return undefined
    function measure(): void {
      const container = containerRef.current
      if (!container) return
      const containerRect = container.getBoundingClientRect()
      const next: { key: string; x1: number; y1: number; x2: number; y2: number }[] = []
      for (const key of rawKeys) {
        const top = boundRowRefs.current[key]
        const bottom = rawLineRefs.current[key]
        if (!top || !bottom) continue
        const t = top.getBoundingClientRect()
        const b = bottom.getBoundingClientRect()
        next.push({
          key,
          x1: t.left - containerRect.left + 8,
          y1: t.bottom - containerRect.top,
          x2: b.left - containerRect.left + 8,
          y2: b.top - containerRect.top,
        })
      }
      setLines(next)
    }
    const raf = requestAnimationFrame(measure)
    window.addEventListener('resize', measure)
    const ro = new ResizeObserver(measure)
    if (containerRef.current) ro.observe(containerRef.current)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', measure)
      ro.disconnect()
    }
  }, [rawOpen, rawKeys])

  return (
    <div ref={containerRef} className="relative">
      <ReadingHeader reading={reading} />
      <WhatAseUnderstood reading={reading} hoveredField={hoveredField} onHoverField={setHoveredField} boundRowRefs={boundRowRefs} />
      {reading.unbound.length > 0 ? <NotUnderstood reading={reading} onBindField={onBindField} /> : null}
      <RawPayloadDisclosure
        reading={reading}
        open={rawOpen}
        onToggle={() => setRawOpen((v) => !v)}
        hoveredField={hoveredField}
        onHoverField={setHoveredField}
        rawLineRefs={rawLineRefs}
      />
      {rawOpen ? (
        <svg className="pointer-events-none absolute left-0 top-0" width="100%" height="100%" style={{ overflow: 'visible' }} aria-hidden>
          {lines.map((l) => (
            <path
              key={l.key}
              d={`M ${l.x1} ${l.y1} C ${l.x1} ${(l.y1 + l.y2) / 2}, ${l.x2} ${(l.y1 + l.y2) / 2}, ${l.x2} ${l.y2}`}
              fill="none"
              stroke={TEXT_DIM}
              strokeWidth={1}
              opacity={0.3}
            />
          ))}
        </svg>
      ) : null}
    </div>
  )
}

function ReadingHeader({ reading }: { reading: Reading }): ReactElement {
  const { select } = useSelection()
  const router = useRouter()
  const { about } = reading

  function activateAbout(): void {
    if (about.kind !== 'machine') return
    select({ kind: 'identity', machineId: about.machineId })
    const params = new URLSearchParams({ sub: 'source-records', machineId: about.machineId })
    router.push(`${tabHref('identity')}?${params.toString()}`)
  }

  return (
    <div style={{ marginBottom: SPACE_24 }}>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>ABOUT</p>
      {about.kind === 'machine' ? (
        <button type="button" onClick={activateAbout} className="pressable" style={{ marginTop: SPACE_8 }}>
          <span style={{ ...TYPE_DISPLAY, color: TEXT_PRIMARY }}>{about.label}</span>{' '}
          <span className="font-mono" style={{ ...TYPE_BODY, color: TEXT_DIM }}>
            {maskedSerial(about.serial)}
          </span>
          <span style={{ ...TYPE_BODY, color: TEXT_SECONDARY }}> · {about.extra}</span>
        </button>
      ) : (
        <p style={{ ...TYPE_DISPLAY, color: TEXT_PRIMARY, marginTop: SPACE_8 }}>{about.label}</p>
      )}
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_16 }}>SOURCE</p>
      <p style={{ ...TYPE_BODY, color: TEXT_SECONDARY, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
        {reading.source} · arrived {formatElapsed(reading.arrivedAt)}
        {reading.takenAt ? <> · reading taken {formatElapsed(reading.takenAt)}</> : null}
      </p>
    </div>
  )
}

function WhatAseUnderstood({
  reading,
  hoveredField,
  onHoverField,
  boundRowRefs,
}: {
  reading: Reading
  hoveredField: string | null
  onHoverField: (key: string | null) => void
  boundRowRefs: RefMap
}): ReactElement {
  return (
    <div>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>WHAT ASE UNDERSTOOD</p>
      <div style={{ marginTop: SPACE_16 }}>
        {reading.bound.length === 0 ? (
          <p style={{ ...TYPE_BODY, color: TEXT_DIM }}>Nothing bound on this reading.</p>
        ) : (
          reading.bound.map((b) => (
            <BoundRow key={b.fieldKey} reading={reading} b={b} hovered={hoveredField === b.fieldKey} onHover={onHoverField} rowRef={boundRowRefs} />
          ))
        )}
      </div>
    </div>
  )
}

function BoundRow({
  reading,
  b,
  hovered,
  onHover,
  rowRef,
}: {
  reading: Reading
  b: BoundStatement
  hovered: boolean
  onHover: (key: string | null) => void
  rowRef: RefMap
}): ReactElement {
  const tracedUnknown = b.traced as TracedValue<unknown>
  const band = meaningBand(tracedUnknown)
  const highlight = band !== 'nominal'
  return (
    <div
      ref={(el) => {
        rowRef.current[b.fieldKey] = el
      }}
      onMouseEnter={() => onHover(b.fieldKey)}
      onMouseLeave={() => onHover(null)}
      style={{
        padding: `${SPACE_8}px 0`,
        borderBottom: `${BORDER_WIDTH}px solid ${HAIRLINE}`,
        borderLeft: `2px solid ${hovered ? TEXT_SECONDARY : 'transparent'}`,
        paddingLeft: hovered ? SPACE_8 - 2 : SPACE_8,
        transition: 'border-color 120ms var(--cr-ease-out)',
      }}
    >
      <span style={{ display: 'inline-block', color: highlight ? meaningColor(tracedUnknown) : undefined }}>
        <Metric traced={b.traced} label={`${b.fieldKey} — ${b.ruleId}`} />
      </span>
      <p
        className="font-mono"
        style={{
          ...TYPE_CAPTION,
          color: TEXT_DIM,
          marginTop: SPACE_8,
          textTransform: 'none',
          letterSpacing: 'normal',
          opacity: hovered ? 1 : 0,
          height: hovered ? 'auto' : 0,
          overflow: 'hidden',
          transition: 'opacity 120ms var(--cr-ease-out)',
        }}
      >
        {b.fieldKey} · rule {b.ruleId} · {reading.about.kind}
      </p>
    </div>
  )
}

function NotUnderstood({ reading, onBindField }: { reading: Reading; onBindField: (fieldKey: string) => void }): ReactElement {
  const total = reading.bound.length + reading.unbound.length
  const pct = total === 0 ? 0 : Math.round((reading.unbound.length / total) * 100)
  return (
    <div style={{ marginTop: SPACE_24 }}>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>NOT UNDERSTOOD</p>
      <p style={{ ...TYPE_BODY, color: TEXT_DIM, marginTop: SPACE_8 }}>
        {reading.unbound.length} field{reading.unbound.length === 1 ? '' : 's'} not understood, {pct}% of this payload.
      </p>
      <div style={{ marginTop: SPACE_8 }}>
        {reading.unbound.map((u) => (
          <div key={u.key} className="flex items-center" style={{ gap: SPACE_16, paddingTop: SPACE_8, paddingBottom: SPACE_8 }}>
            <p className="font-mono" style={{ ...TYPE_BODY, color: TEXT_DIM, opacity: 0.6 }}>
              {u.key} {JSON.stringify(u.rawValue)}
            </p>
            <BindThisFieldButton onClick={() => onBindField(u.key)} />
          </div>
        ))}
      </div>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_16, textTransform: 'none', letterSpacing: 'normal' }}>
        A system claiming to understand 100% of every payload is not credible. One that measures its own coverage is.
      </p>
    </div>
  )
}

function BindThisFieldButton({ onClick }: { onClick: () => void }): ReactElement {
  const { focused, handlers } = useFocusRing()
  return (
    <button
      type="button"
      onClick={onClick}
      {...handlers}
      className="pressable"
      style={{
        ...TYPE_CAPTION,
        textTransform: 'none',
        letterSpacing: 'normal',
        color: TEXT_SECONDARY,
        border: `${BORDER_WIDTH}px solid ${HAIRLINE}`,
        borderRadius: RADIUS_INTERACTIVE,
        padding: `1px ${SPACE_8}px`,
        cursor: 'pointer',
        ...focusRingStyle(focused),
      }}
    >
      BIND THIS FIELD
    </button>
  )
}

function RawPayloadDisclosure({
  reading,
  open,
  onToggle,
  hoveredField,
  onHoverField,
  rawLineRefs,
}: {
  reading: Reading
  open: boolean
  onToggle: () => void
  hoveredField: string | null
  onHoverField: (key: string | null) => void
  rawLineRefs: RefMap
}): ReactElement {
  const { focused, handlers } = useFocusRing()
  const keys = Object.keys(reading.raw)

  return (
    <div style={{ marginTop: SPACE_32 }}>
      <button
        type="button"
        onClick={onToggle}
        {...handlers}
        className="pressable flex items-center"
        style={{ ...TYPE_CAPTION, color: TEXT_SECONDARY, gap: SPACE_8, ...focusRingStyle(focused) }}
      >
        <span>{open ? '▾' : '▸'}</span>
        <span style={{ textTransform: 'none', letterSpacing: 'normal' }}>Show what the connector actually sent</span>
      </button>

      {open ? (
        <div
          className="font-mono"
          style={{
            marginTop: SPACE_16,
            padding: SPACE_16,
            background: PANEL_RAISED,
            borderRadius: RADIUS_STATIC,
            border: `${BORDER_WIDTH}px solid ${HAIRLINE}`,
            ...TYPE_BODY,
            color: TEXT_SECONDARY,
          }}
        >
          <div>{'{'}</div>
          {keys.map((key, i) => (
            <div
              key={key}
              ref={(el) => {
                rawLineRefs.current[key] = el
              }}
              onMouseEnter={() => onHoverField(key)}
              onMouseLeave={() => onHoverField(null)}
              style={{ paddingLeft: SPACE_16, background: hoveredField === key ? HAIRLINE : 'transparent' }}
            >
              <span style={{ color: TEXT_PRIMARY }}>&quot;{key}&quot;</span>
              <span style={{ color: TEXT_DIM }}>: </span>
              <span style={{ color: TEXT_SECONDARY }}>{JSON.stringify(reading.raw[key])}</span>
              {i < keys.length - 1 ? <span style={{ color: TEXT_DIM }}>,</span> : null}
            </div>
          ))}
          <div>{'}'}</div>
        </div>
      ) : null}

      {open ? (
        <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
          The proof, not the pitch — everything above was read from exactly this.
        </p>
      ) : null}
    </div>
  )
}
