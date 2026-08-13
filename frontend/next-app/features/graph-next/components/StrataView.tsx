'use client'

// S8.6: STRATA — the same 127 domain entities as NETWORK, read as six fixed
// horizontal bands instead of a radiating tree. No drift, no spawn travel:
// hierarchy is calm on purpose, the contrast is deliberate against
// NETWORK's organism motion. Sub-nodes are never drawn here (S8.6: "3,000
// points in a 60px band is noise") — each entity carries a small count
// badge of its attached records instead.
//
// S8.8: dimming now goes through ONE shared policy (graph/emphasis.ts) —
// hover chain, hovered tier, dbl-click focus mode and search all resolve to
// the same 8% floor, in the same priority order NETWORK uses. Filtering is
// NOT part of that policy (per S8.8: "changes what is drawn, never the
// dataset") — a filtered-out entity is skipped from the render entirely,
// checked before opacity is even asked about.

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactElement } from 'react'
import { GRAPH_BLACK } from '../types/tokens'
import { graphStore } from '../stores/graphStore'
import { buildColorResolver, darkenColor } from '../services/color'
import { buildHoverChainIndex } from '../services/hoverChain'
import { isFilterVisible, resolveEdgeOpacity, resolveOpacity } from '../services/emphasis'
import { computeFilterVisible } from '../services/filters'
import { buildSearchIndex, computeSearchMatches } from '../services/search'
import { buildTooltipIndex } from '../services/tooltipInfo'
import { computeWatchIds } from '../services/watchStatus'
import { siblingInTier } from '../services/keyboardNav'
import { EntityTooltip } from './EntityTooltip'
import { BAND_HEIGHT, BAND_LABEL, BAND_ORDER, computeBandStats, computeDensityStrip, computeStrataLayout, pluralizeTier, STRATA_TOTAL_HEIGHT } from '../services/strataLayout'
import { ANOMALY_RED, GUTTER_TRACK } from '../types/tokens'
import { HAIRLINE, NOMINAL, TEXT_DIM, TEXT_SECONDARY } from '@/features/ase/tokens'
import type { DomainDataset, EntityTier } from '../types/domain'
import type { GraphId } from '../types/graph'

const GUTTER_WIDTH = 5
const LABEL_COLUMN_WIDTH = 130
const HOVER_SCALE = 1.5

function cubicFlowPath(x1: number, y1: number, x2: number, y2: number): string {
  const my = (y1 + y2) / 2
  return `M ${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}`
}

export function StrataView({ dataset }: { dataset: DomainDataset }): ReactElement {
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null)
  const snapshot = useSyncExternalStore(graphStore.subscribe, graphStore.getSnapshot, graphStore.getServerSnapshot)

  // S8.8: NO self-declared setViewMode('strata') here — unlike NETWORK and
  // TERRAIN, StrataView can be mounted WITHOUT being the active tab (as
  // GraphSplitPane's bottom pane while NETWORK is active). A real bug,
  // caught live: this used to call setViewMode('strata') unconditionally
  // on mount, which — since it mounts alongside NetworkView inside the
  // split pane — clobbered viewMode back to 'strata' right after
  // ViewModeSwitch set it to 'network', making GraphNext immediately
  // unmount NetworkView and fall back to bare StrataView. viewMode is
  // ViewModeSwitch's (and GraphNext's) job alone now.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const bandWidth = Math.max(0, width - LABEL_COLUMN_WIDTH - GUTTER_WIDTH * 3)

  const { layout, colors, subNodeCountById, bandStats, densityByTier, hoverChainIndex, searchIndex, tooltipIndex, watchIds } = useMemo(() => {
    const colors = buildColorResolver(dataset)
    const layout = computeStrataLayout(dataset, Math.max(1, bandWidth))
    const subNodeCountById = new Map<GraphId, number>()
    for (const s of dataset.subNodes) {
      subNodeCountById.set(s.parentId, (subNodeCountById.get(s.parentId) ?? 0) + 1)
    }
    const bandStats = computeBandStats(dataset)
    const densityByTier = new Map<EntityTier, number[]>(BAND_ORDER.map((tier) => [tier, computeDensityStrip(dataset, layout, tier, Math.max(1, bandWidth))]))
    return {
      layout,
      colors,
      subNodeCountById,
      bandStats,
      densityByTier,
      hoverChainIndex: buildHoverChainIndex(dataset),
      searchIndex: buildSearchIndex(dataset),
      tooltipIndex: buildTooltipIndex(dataset),
      watchIds: computeWatchIds(dataset),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset.version, bandWidth])

  const hoverChain = hoverChainIndex.get(snapshot.hover ?? snapshot.selection ?? '') ?? null
  const searchMatches = useMemo(() => computeSearchMatches(searchIndex, snapshot.searchQuery), [searchIndex, snapshot.searchQuery])
  const filterVisible = useMemo(() => computeFilterVisible(dataset, snapshot.filter), [dataset, snapshot.filter])
  const emphasisCtx = { hoverChain, hoveredTier: snapshot.hoveredTier, focusChain: snapshot.focusChain, searchMatches }

  const edges = useMemo(() => {
    const isEntity = new Set(dataset.domainEntities.map((e) => e.id))
    return dataset.edges.filter((e) => isEntity.has(e.source) && isEntity.has(e.target) && (e.kind === 'structural' || e.kind === 'operational' || e.kind === 'anomaly'))
  }, [dataset])

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-y-auto" style={{ background: GRAPH_BLACK }} onClick={() => graphStore.setSelection(null)}>
      <svg
        data-graph-view="strata"
        width="100%"
        height={STRATA_TOTAL_HEIGHT}
        viewBox={`0 0 ${Math.max(1, width)} ${STRATA_TOTAL_HEIGHT}`}
        preserveAspectRatio="none"
        style={{ display: 'block' }}
      >
        {/* band hairlines */}
        {BAND_ORDER.map((tier, i) => (
          <line key={`rule-${tier}`} x1={0} y1={i * BAND_HEIGHT} x2={width} y2={i * BAND_HEIGHT} stroke={HAIRLINE} strokeWidth={1} />
        ))}

        {/* edges, offset into the band area (past the label column) */}
        {edges.map((e) => {
          if (!isFilterVisible(e.source, filterVisible) || !isFilterVisible(e.target, filterVisible)) return null
          const a = layout.positions.get(e.source)
          const b = layout.positions.get(e.target)
          const targetEntity = dataset.domainEntities.find((d) => d.id === e.target)
          if (!a || !b || !targetEntity) return null
          const color = e.kind === 'anomaly' ? ANOMALY_RED : colors.colorFor(e.target)
          const width_ = e.kind === 'structural' ? 1.2 : 1
          const key = `${e.source}->${e.target}`
          return (
            <path
              key={key}
              d={cubicFlowPath(a.x + LABEL_COLUMN_WIDTH, a.y, b.x + LABEL_COLUMN_WIDTH, b.y)}
              fill="none"
              stroke={color}
              strokeWidth={width_}
              opacity={resolveEdgeOpacity(key, e.target, targetEntity.tier, emphasisCtx)}
            />
          )
        })}

        {/* nodes + badges */}
        {dataset.domainEntities.map((e) => {
          if (!isFilterVisible(e.id, filterVisible)) return null
          const p = layout.positions.get(e.id)
          if (!p) return null
          const r = layout.radius.get(e.id) ?? 3
          const color = colors.colorFor(e.id)
          const subCount = subNodeCountById.get(e.id) ?? 0
          const opacity = resolveOpacity(e.id, e.tier, emphasisCtx)
          const isHovered = snapshot.hover === e.id
          const isKeyboardFocus = isHovered && snapshot.keyboardActive
          return (
            <g
              key={e.id}
              tabIndex={0}
              data-entity-id={e.id}
              transform={`translate(${p.x + LABEL_COLUMN_WIDTH}, ${p.y}) scale(${isHovered ? HOVER_SCALE : 1})`}
              opacity={opacity}
              className="cursor-pointer"
              style={{ transition: 'transform 120ms ease-out' }}
              onPointerEnter={(evt) => {
                graphStore.setHover(e.id)
                setTooltipPos({ x: evt.clientX, y: evt.clientY })
              }}
              onPointerLeave={() => {
                if (graphStore.getSnapshot().hover === e.id) graphStore.setHover(null)
                setTooltipPos(null)
              }}
              onFocus={() => graphStore.setHover(e.id, true)}
              onClick={(evt) => {
                evt.stopPropagation()
                graphStore.setSelection(snapshot.selection === e.id ? null : e.id)
              }}
              onKeyDown={(evt) => {
                if (evt.key === 'Enter') {
                  evt.preventDefault()
                  graphStore.setSelection(e.id)
                  return
                }
                const direction = evt.key === 'ArrowRight' || evt.key === 'ArrowDown' ? 1 : evt.key === 'ArrowLeft' || evt.key === 'ArrowUp' ? -1 : null
                if (direction === null) return
                evt.preventDefault()
                const nextId = siblingInTier(dataset, e.id, direction)
                const nextEl = nextId ? containerRef.current?.querySelector<SVGGElement>(`[data-entity-id="${nextId}"]`) : null
                nextEl?.focus()
              }}
            >
              {isKeyboardFocus && <circle r={r + 4} fill="none" stroke={NOMINAL} strokeWidth={1.5} />}
              <circle r={r} fill={color} stroke={darkenColor(color)} strokeWidth={1} />
              {subCount > 0 && (
                <text x={r + 3} y={3} fontSize={8} className="font-mono" fill={TEXT_DIM}>
                  {subCount}
                </text>
              )}
            </g>
          )
        })}
      </svg>

      {tooltipPos && snapshot.hover && (
        <EntityTooltip info={tooltipIndex.get(snapshot.hover) ?? null} x={tooltipPos.x} y={tooltipPos.y} watch={watchIds.has(snapshot.hover)} />
      )}

      {/* left column: band label + count/anomaly text, and per-band density strip + anomaly gutter — an HTML overlay, simpler than fighting SVG text layout for this */}
      {bandStats.map((stat, i) => {
        const density = densityByTier.get(stat.tier) ?? []
        const anomalyFrac = stat.total > 0 ? stat.anomalyCount / stat.total : 0
        return (
          <div key={stat.tier} className="absolute left-0 flex items-center" style={{ top: i * BAND_HEIGHT, height: BAND_HEIGHT, width: '100%' }}>
            <button
              type="button"
              className="pointer-events-auto flex h-full flex-col justify-center pl-3 text-left"
              style={{ width: LABEL_COLUMN_WIDTH, background: 'transparent', border: 'none' }}
              onMouseEnter={() => graphStore.setHoveredTier(stat.tier)}
              onMouseLeave={() => graphStore.setHoveredTier(null)}
            >
              <span className="font-mono" style={{ fontSize: 11, letterSpacing: '0.08em', color: TEXT_SECONDARY }}>
                {BAND_LABEL[stat.tier]}
              </span>
              <span className="font-mono" style={{ fontSize: 10, color: TEXT_DIM, marginTop: 2 }}>
                {stat.total} {pluralizeTier(stat.tier, stat.total)} {stat.anomalyCount > 0 ? `· ${stat.anomalyCount} in anomaly` : ''}
              </span>
            </button>

            {/* density strip along the bottom of the band */}
            <div className="pointer-events-none absolute bottom-0" style={{ left: LABEL_COLUMN_WIDTH, right: GUTTER_WIDTH * 2, height: 4, display: 'flex' }}>
              {density.map((d, bi) => (
                <div key={bi} style={{ flex: 1, background: colors.colorFor(dataset.domainEntities.find((e) => e.tier === stat.tier)?.id ?? ''), opacity: 0.15 + d * 0.55 }} />
              ))}
            </div>

            {/* anomaly gutter on the right */}
            <div
              className="pointer-events-none absolute right-0 flex flex-col justify-end"
              style={{ top: 4, bottom: 4, width: GUTTER_WIDTH, background: GUTTER_TRACK }}
              title={`${Math.round(anomalyFrac * 100)}% of ${BAND_LABEL[stat.tier].toLowerCase()} in anomaly`}
            >
              <div style={{ width: '100%', height: `${anomalyFrac * 100}%`, background: ANOMALY_RED }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
