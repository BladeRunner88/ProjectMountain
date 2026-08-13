'use client'

import { useEffect, useRef, useState, type ReactElement } from 'react'
import Link from 'next/link'
import {
  EVIDENCE_STRIP_HEIGHT,
  FLOW_LINE_MAX_WIDTH,
  FLOW_LINE_MIN_WIDTH,
  HAIRLINE,
  NOMINAL,
  OUTPUT_ZONE_WIDTH,
  PANEL,
  SOURCE_CHIP_NAME_MAX_WIDTH,
  SOURCE_CHIP_WIDTH,
  SPACE_8,
  SPACE_16,
  TEXT_DIM,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  TYPE_BODY,
  TYPE_CAPTION,
  WATCH,
} from '@/features/ase/tokens'
import { dependents } from '@/features/ase/services/folds'
import { Metric, useAsOf, useHover } from '@/features/ase/client'
import type { SourceRuntime } from '@/features/ase/services/dataset'
import type { TracedValue } from '@/features/ase/services/traced'
import { tabHref } from '../types/tabs'
import { useFocusRing } from '../hooks/useFocusRing'
import { focusRingStyle } from '../services/focusRing'

const OUTPUT_LINKS: { label: string; href: string }[] = [
  { label: 'Connected graph', href: '/app/graph' },
  { label: 'Live dashboard', href: '/app/dashboard' },
  { label: 'Root-cause answers', href: tabHref('reasoning') },
]

export function EvidenceStrip({ sources }: { sources: SourceRuntime[] }): ReactElement {
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return undefined
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width)
    })
    ro.observe(el)
    return (): void => {
      ro.disconnect()
    }
  }, [])

  if (sources.length === 0) {
    return (
      <div>
        <p style={{ ...TYPE_BODY, color: TEXT_DIM }}>No sources connected.</p>
        <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_16, textTransform: 'none', letterSpacing: 'normal' }}>
          Your systems generate data. Your connectors move it. ASE turns it into understanding.
        </p>
      </div>
    )
  }

  const height = EVIDENCE_STRIP_HEIGHT
  const chipGap = height / sources.length
  const aseX = SOURCE_CHIP_WIDTH + Math.max(120, (width - SOURCE_CHIP_WIDTH - 2 * OUTPUT_ZONE_WIDTH) * 0.45)
  const aseY = height / 2
  const outputX = Math.max(aseX + OUTPUT_ZONE_WIDTH, width - OUTPUT_ZONE_WIDTH)

  const dependentCounts = sources.map((s) => dependents(s.reliabilityPct.id).length + dependents(s.lastSyncAgeSec.id).length)
  const maxDependents = Math.max(1, ...dependentCounts)

  return (
    <div>
      <div ref={containerRef} className="relative w-full" style={{ height }}>
        {width > 0 ? (
          <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="absolute left-0 top-0">
            {sources.map((s, i) => {
              const y = chipGap * i + chipGap / 2
              const strokeWidth =
                FLOW_LINE_MIN_WIDTH + (FLOW_LINE_MAX_WIDTH - FLOW_LINE_MIN_WIDTH) * (dependentCounts[i] / maxDependents)
              const stroke = s.degraded ? WATCH : NOMINAL
              return (
                <path
                  key={s.def.id}
                  d={`M ${SOURCE_CHIP_WIDTH} ${y} C ${(SOURCE_CHIP_WIDTH + aseX) / 2} ${y}, ${(SOURCE_CHIP_WIDTH + aseX) / 2} ${aseY}, ${aseX} ${aseY}`}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={strokeWidth}
                  opacity={0.7}
                />
              )
            })}
            <circle cx={aseX} cy={aseY} r={26} fill={PANEL} stroke={HAIRLINE} strokeWidth={1} />
            <text x={aseX} y={aseY} textAnchor="middle" dominantBaseline="middle" fill={TEXT_PRIMARY} style={{ ...TYPE_CAPTION }}>
              ASE
            </text>
            <path
              d={`M ${aseX + 26} ${aseY} L ${outputX} ${aseY}`}
              fill="none"
              stroke={NOMINAL}
              strokeWidth={FLOW_LINE_MAX_WIDTH}
              opacity={0.7}
            />
          </svg>
        ) : null}
        <div className="absolute left-0 top-0 flex flex-col" style={{ width: SOURCE_CHIP_WIDTH, height }}>
          {sources.map((s) => (
            <SourceChip key={s.def.id} source={s} height={chipGap} />
          ))}
        </div>
        {width > 0 ? (
          <div className="absolute top-0 flex flex-col justify-center" style={{ left: outputX + SPACE_16, right: 0, height }}>
            <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginBottom: SPACE_8 }}>WHAT YOU GET</p>
            <div className="flex flex-col" style={{ gap: SPACE_8 }}>
              {OUTPUT_LINKS.map((link) => (
                <OutputChip key={link.href} label={link.label} href={link.href} />
              ))}
            </div>
          </div>
        ) : null}
      </div>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_16, textTransform: 'none', letterSpacing: 'normal' }}>
        Your systems generate data. Your connectors move it. ASE turns it into understanding.
      </p>
    </div>
  )
}

function OutputChip({ label, href }: { label: string; href: string }): ReactElement {
  const { focused, handlers } = useFocusRing()
  return (
    <Link
      href={href}
      {...handlers}
      style={{
        ...TYPE_CAPTION,
        color: TEXT_SECONDARY,
        textTransform: 'none',
        letterSpacing: 'normal',
        ...focusRingStyle(focused),
      }}
    >
      {label}
    </Link>
  )
}

function asNumberTraced(tv: TracedValue<unknown> | undefined): TracedValue<number> | undefined {
  if (!tv || typeof tv.value !== 'number') return undefined
  return tv as TracedValue<number>
}

function SourceChip({ source, height }: { source: SourceRuntime; height: number }): ReactElement {
  const { setHovered } = useHover()
  const { view } = useAsOf()
  const reliabilityAsOf = asNumberTraced(view.resolve(source.reliabilityPct.id))
  const lastSyncAsOf = asNumberTraced(view.resolve(source.lastSyncAgeSec.id))

  return (
    <div
      className="flex items-center whitespace-nowrap"
      style={{ height, gap: SPACE_8 }}
      onMouseEnter={() => setHovered([source.reliabilityPct.id, source.lastSyncAgeSec.id])}
      onMouseLeave={() => setHovered(null)}
    >
      <p
        className="truncate"
        style={{
          ...TYPE_CAPTION,
          color: TEXT_PRIMARY,
          textTransform: 'none',
          letterSpacing: 'normal',
          maxWidth: SOURCE_CHIP_NAME_MAX_WIDTH,
        }}
      >
        {source.def.name}
      </p>
      {reliabilityAsOf ? (
        <Metric traced={reliabilityAsOf} label={`${source.def.name} reliability`} format={(v) => `${v}%`} />
      ) : (
        <NotYetObserved />
      )}
      {lastSyncAsOf ? (
        <Metric traced={lastSyncAsOf} label={`${source.def.name} last sync`} format={formatAge} />
      ) : (
        <NotYetObserved />
      )}
    </div>
  )
}

function NotYetObserved(): ReactElement {
  return (
    <span className="font-mono" style={{ ...TYPE_CAPTION, textTransform: 'none', letterSpacing: 'normal', color: TEXT_DIM }}>
      not yet observed
    </span>
  )
}

function formatAge(seconds: number): string {
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`
  return `${Math.round(seconds / 3600)}h ago`
}
