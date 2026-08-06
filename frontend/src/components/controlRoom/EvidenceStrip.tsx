import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
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
  TYPE_CAPTION,
  WATCH,
} from '../../ase/tokens'
import { dependents } from '../../ase/folds'
import { useAsOf } from '../../ase/asOfContext'
import { useHover } from '../../ase/hover'
import { Metric } from '../../ase/Metric'
import { focusRingStyle, useFocusRing } from './focusRing'
import type { SourceRuntime } from '../../ase/dataset'

const OUTPUT_LINKS: { label: string; to: string }[] = [
  { label: 'Connected graph', to: '/app/graph' },
  { label: 'Live dashboard', to: '/app/dashboard' },
  { label: 'Root-cause answers', to: '/app/control-room/reasoning' },
]

// ZONE 1 (S1f): "YOUR SYSTEMS → ASE → WHAT YOU GET". SVG draws the flow —
// straight lines only, no library — HTML renders the interactive chips
// (Metric needs real DOM/mouse/focus behaviour a foreignObject would make
// fragile). Both share one pixel-measured coordinate system so a chip's
// position and its connector line can never drift apart.
export function EvidenceStrip({ sources }: { sources: SourceRuntime[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

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
        {width > 0 && (
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
        )}
        <div className="absolute left-0 top-0 flex flex-col" style={{ width: SOURCE_CHIP_WIDTH, height }}>
          {sources.map((s) => (
            <SourceChip key={s.def.id} source={s} height={chipGap} />
          ))}
        </div>
        {width > 0 && (
          <div
            className="absolute top-0 flex flex-col justify-center"
            style={{ left: outputX + SPACE_16, right: 0, height }}
          >
            <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginBottom: SPACE_8 }}>WHAT YOU GET</p>
            <div className="flex flex-col" style={{ gap: SPACE_8 }}>
              {OUTPUT_LINKS.map((link) => (
                <OutputChip key={link.to} label={link.label} to={link.to} />
              ))}
            </div>
          </div>
        )}
      </div>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_16, textTransform: 'none', letterSpacing: 'normal' }}>
        Your systems generate data. Your connectors move it. ASE turns it into understanding.
      </p>
    </div>
  )
}

function OutputChip({ label, to }: { label: string; to: string }) {
  const { focused, handlers } = useFocusRing()
  return (
    <Link
      to={to}
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

function SourceChip({ source, height }: { source: SourceRuntime; height: number }) {
  const { setHovered } = useHover()
  const { view } = useAsOf()
  // S3: reads through the shared as-of view, not a fallback to "current" —
  // scrubbed far enough back, a source's own stats genuinely haven't been
  // recorded yet, and showing them anyway would be exactly the authored
  // dishonesty this whole block exists to rule out. `undefined` renders as
  // an explicit "not yet observed", never a silently-live number.
  const reliabilityAsOf = view.resolve(source.reliabilityPct.id) as typeof source.reliabilityPct | undefined
  const lastSyncAsOf = view.resolve(source.lastSyncAgeSec.id) as typeof source.lastSyncAgeSec | undefined

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

function NotYetObserved() {
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
