// S8.5N: the SVG layer — entities, structural/operational edges, and
// hover/selection interaction. Sits above NetworkCanvasLayer, sharing the
// same viewport. Every entity is now a THREE-layer <g>:
//
//   outer  (ref'd, position via imperative setAttribute transform + hover
//           scale — never touched by a CSS animation, so it never fights
//           the drift loop for the SVG `transform` attribute)
//   mid    (network-parent-pop: the swell/relax while THIS node is
//           budding its own children — graph/spawnStages.ts's
//           parentPopEpisodes)
//   inner  (network-pop-a for countries / network-bud-child for everyone
//           else: this node's OWN arrival)
//
// Nested <g> transforms multiply, so a node that is simultaneously still
// settling from its own arrival (inner) and already swelling to bud its
// next litter (mid) — S8.5N deliberately overlaps routes landing with
// operators budding — composes correctly with no two animations racing
// over the same element's `transform`. This was the real reason the old
// single-<g>-per-node shape (S8.4b/8.5R) couldn't be reused: a CSS
// transform animation on an element always overrides that element's own
// `transform` XML attribute, so position (set imperatively every drift
// frame) and a pop/swell animation (set via CSS) can never safely share
// one <g>.
//
// RINGS: only two things ever draw one — the selected node (a white ring,
// sibling of the inner arrival <g> so it's unaffected by the pop/bud scale)
// and an anomaly (a soft blurred glow, not a hard ring). Keyboard focus
// used to draw a third custom ring; it's now a native :focus-visible
// outline (index.css) instead — see that file's own comment.
//
// TEXT ON THE CANVAS: only the five country names (always visible, fading
// in 200ms after their node lands) and the hovered entity's name (the
// existing EntityTooltip, a DOM overlay near the cursor, not SVG text).
// Environment nodes carry no reading, no label, ever — that's now in the
// panel only.

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { graphStore } from '../../graph/graphStore'
import { buildColorResolver, darkenColor } from '../../graph/color'
import { buildEdgeAppearanceResolver, ENVIRONMENT_EDGE_WIDTH } from '../../graph/edgeAppearance'
import { computeQuadraticCurve, quadraticSvgPath } from '../../graph/edgeGeometry'
import {
  ANOMALY_FLUSH_HOPS,
  ANOMALY_FLUSH_TOTAL_MS,
  BUD_CHILD_MIGRATE_EASING,
  BUD_CHILD_MIGRATE_MS,
  BUD_CHILD_TOTAL_MS,
  BUD_PARENT_RELAX_MS,
  BUD_PARENT_SWELL_MS,
  type ParentPopEpisode,
  type SpawnPlan,
} from '../../graph/spawnStages'
import { isFilterVisible, resolveEdgeOpacity, resolveOpacity, type EmphasisContext } from '../../graph/emphasis'
import { siblingInTier } from '../../graph/keyboardNav'
import { TIER_RADIUS_PX, ENVIRONMENT_RADIUS_PX } from '../../graph/sizes'
import { ANOMALY_RED, CLIMBER_WHITE, ENVIRONMENT_TEAL } from '../../graph/tokens'
import { TEXT_SECONDARY } from '../../ase/tokens'
import { EntityTooltip } from './EntityTooltip'
import type { EnvironmentReading } from '../../graph/environmentStore'
import type { HoverChain } from '../../graph/hoverChain'
import type { TooltipInfo } from '../../graph/tooltipInfo'
import type { DomainDataset, EntityTier } from '../../graph/domain'
import type { GraphId, Point, Size } from '../../graph/types'

const HOVER_SCALE = 1.6
const SELECTION_RING_GAP_PX = 4
const SELECTION_RING_WIDTH_PX = 2
const ANOMALY_GLOW_SCALE = 2.4
const ANOMALY_FLUSH_HOP_MS = ANOMALY_FLUSH_TOTAL_MS / ANOMALY_FLUSH_HOPS

interface StaticEntity {
  id: GraphId
  tier: EntityTier
  isCountry: boolean
  color: string
  normalColor: string
  ring: string
  radius: number
  isAnomalous: boolean
  /** undefined for countries (PRIMITIVE A never migrates). */
  fromParentId: GraphId | undefined
  arrivalDelayMs: number
  parentPopStyle: React.CSSProperties
  /** Only set for the 9 anomalous climbers. */
  turnRedDelayMs: number | undefined
}
interface StaticEdge {
  key: string
  sourceId: GraphId
  targetId: GraphId
  color: string
  normalColor: string
  width: number
  budStartMs: number
  flushDelayMs: number | null
}
interface StaticEnvironment {
  id: GraphId
  regionId: GraphId
  color: string
  normalColor: string
  budStartMs: number
  parentPopStyle: React.CSSProperties
}
interface StaticCountryLabel {
  id: GraphId
  label: string
  nameDelayMs: number
}

function buildParentPopStyle(episodes: readonly ParentPopEpisode[]): React.CSSProperties {
  if (episodes.length === 0) return {}
  const names: string[] = []
  const durations: string[] = []
  const delays: string[] = []
  for (const ep of episodes) {
    names.push('network-parent-swell', 'network-parent-relax')
    durations.push(`${BUD_PARENT_SWELL_MS}ms`, `${BUD_PARENT_RELAX_MS}ms`)
    delays.push(`${ep.swellStart}ms`, `${ep.relaxStart}ms`)
  }
  return { animationName: names.join(', '), animationDuration: durations.join(', '), animationDelay: delays.join(', ') }
}

export function NetworkSvgLayer({
  dataset,
  size,
  reduced,
  spawnPlan,
  renderFinal,
  filterVisible,
  emphasisCtx,
  hoverChainIndex,
  tooltipIndex,
  watchIds,
  environmentReadings,
  onFocusEntity,
}: {
  dataset: DomainDataset
  size: Size
  reduced: boolean
  spawnPlan: SpawnPlan
  /** hasEverSpawned || reduced || skip-clicked — render the finished picture with no delays, no animation classes, no flush. */
  renderFinal: boolean
  filterVisible: ReadonlySet<GraphId> | null
  emphasisCtx: EmphasisContext
  /** S8.10: the SAME precomputed index NetworkView already builds `emphasisCtx.hoverChain` from — handed down raw too, so a pointer event here can look up the new hover's chain and paint it ITSELF, synchronously, without waiting on React's state->re-render->effect round trip. */
  hoverChainIndex: ReadonlyMap<GraphId, HoverChain>
  tooltipIndex: ReadonlyMap<GraphId, TooltipInfo>
  watchIds: ReadonlySet<GraphId>
  environmentReadings: ReadonlyMap<GraphId, EnvironmentReading>
  onFocusEntity: (id: GraphId) => void
}) {
  const groupRefs = useRef(new Map<GraphId, SVGGElement>())
  const pathRefs = useRef(new Map<string, SVGPathElement>())
  const envPathRefs = useRef(new Map<string, SVGPathElement>())
  const labelRefs = useRef(new Map<GraphId, SVGTextElement>())
  const snapshot = useSyncExternalStore(graphStore.subscribe, graphStore.getSnapshot)
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null)

  const { entities, edges, environments, countryLabels } = useMemo(() => {
    const colors = buildColorResolver(dataset)
    const appearanceFor = buildEdgeAppearanceResolver(dataset, colors)
    const byId = new Map(dataset.domainEntities.map((e) => [e.id, e]))

    const entities: StaticEntity[] = dataset.domainEntities.map((e) => {
      const isCountry = e.tier === 'country'
      const color = colors.colorFor(e.id)
      return {
        id: e.id,
        tier: e.tier,
        isCountry,
        color,
        normalColor: colors.normalColorFor(e.id),
        ring: darkenColor(color),
        radius: TIER_RADIUS_PX[e.tier],
        isAnomalous: e.status === 'anomaly',
        fromParentId: isCountry ? undefined : (spawnPlan.budParentId.get(e.id) ?? (e.parentId ?? undefined)),
        arrivalDelayMs: isCountry ? (spawnPlan.countryPopDelayMs.get(e.id) ?? 0) : (spawnPlan.budStartMs.get(e.id) ?? 0),
        parentPopStyle: buildParentPopStyle(spawnPlan.parentPopEpisodes.get(e.id) ?? []),
        turnRedDelayMs: spawnPlan.anomalyTurnRedMs.get(e.id),
      }
    })

    const domainEdges = dataset.edges.filter((e) => e.kind === 'structural' || e.kind === 'operational' || (e.kind === 'anomaly' && byId.has(e.target)))
    const edges: StaticEdge[] = domainEdges.map((e) => {
      const a = appearanceFor(e.source, e.target, e.kind)
      const key = `${e.source}->${e.target}`
      return {
        key,
        sourceId: e.source,
        targetId: e.target,
        color: a.color,
        normalColor: colors.normalColorFor(e.target),
        width: a.width,
        budStartMs: spawnPlan.budStartMs.get(e.target) ?? 0,
        flushDelayMs: spawnPlan.anomalyFlushDelayMs.get(key) ?? null,
      }
    })

    const environments: StaticEnvironment[] = dataset.environmentNodes.map((env) => ({
      id: env.id,
      regionId: env.regionId,
      color: colors.colorFor(env.id),
      normalColor: colors.normalColorFor(env.id),
      budStartMs: spawnPlan.budStartMs.get(env.id) ?? 0,
      parentPopStyle: {},
    }))

    const countryLabels: StaticCountryLabel[] = dataset.domainEntities
      .filter((e) => e.tier === 'country')
      .map((c) => ({ id: c.id, label: c.label, nameDelayMs: spawnPlan.countryNameDelayMs.get(c.id) ?? 0 }))

    return { entities, edges, environments, countryLabels }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset, spawnPlan])

  // The migration's own start offset — parent's RESOLVED layout position
  // minus this node's own, in local SVG units (independent of any live
  // drift, which is applied identically to both endpoints by the shared
  // imperative transform on the outer <g>). Recomputes once layout is
  // actually populated (empty on the very first render, before
  // graphStore.setDataset() has run) — budStartMs values start at 2000ms+,
  // comfortably after that first, real layout-bearing render.
  const budFromOffset = useMemo(() => {
    const layout = snapshot.layout
    const offsets = new Map<GraphId, { dx: number; dy: number }>()
    function set(id: GraphId, parentId: GraphId | undefined) {
      if (!parentId) return
      const own = layout.get(id)
      const parent = layout.get(parentId)
      if (!own || !parent) return
      offsets.set(id, { dx: parent.x - own.x, dy: parent.y - own.y })
    }
    for (const e of entities) set(e.id, e.fromParentId)
    for (const env of environments) set(env.id, env.regionId)
    return offsets
  }, [entities, environments, snapshot.layout])

  function fromOffset(id: GraphId): { dx: number; dy: number } {
    return budFromOffset.get(id) ?? { dx: 0, dy: 0 }
  }

  function groupRef(id: GraphId) {
    return (el: SVGGElement | null) => {
      if (el) groupRefs.current.set(id, el)
      else groupRefs.current.delete(id)
    }
  }
  function pathRef(key: string) {
    return (el: SVGPathElement | null) => {
      if (el) pathRefs.current.set(key, el)
      else pathRefs.current.delete(key)
    }
  }
  function envPathRef(id: GraphId) {
    return (el: SVGPathElement | null) => {
      if (el) envPathRefs.current.set(id, el)
      else envPathRefs.current.delete(id)
    }
  }
  function labelRef(id: GraphId) {
    return (el: SVGTextElement | null) => {
      if (el) labelRefs.current.set(id, el)
      else labelRefs.current.delete(id)
    }
  }

  // Read fresh every drift frame via a ref, not an effect dep — hover
  // changes far more often than the drift loop should be torn down and
  // rebuilt for. Written synchronously from the pointer handlers below for
  // a local hover; this effect is the fallback path for a hover set some
  // OTHER way (keyboard focus already writes it directly too).
  const hoveredIdRef = useRef<GraphId | null>(null)
  useEffect(() => {
    hoveredIdRef.current = snapshot.hover
  }, [snapshot.hover])

  useEffect(() => {
    function currentPos(layout: ReadonlyMap<GraphId, Point>, offsets: ReadonlyMap<GraphId, Point>, id: GraphId): Point | null {
      const base = layout.get(id)
      if (!base) return null
      const off = offsets.get(id)
      return off ? { x: base.x + off.x, y: base.y + off.y } : base
    }

    function apply(layout: ReadonlyMap<GraphId, Point>, offsets: ReadonlyMap<GraphId, Point>) {
      for (const [id, g] of groupRefs.current) {
        const p = currentPos(layout, offsets, id)
        if (!p) continue
        const scale = id === hoveredIdRef.current ? HOVER_SCALE : 1
        g.setAttribute('transform', `translate(${p.x}, ${p.y}) scale(${scale})`)
      }
      for (const e of edges) {
        const a = currentPos(layout, offsets, e.sourceId)
        const b = currentPos(layout, offsets, e.targetId)
        const path = pathRefs.current.get(e.key)
        if (a && b && path) path.setAttribute('d', quadraticSvgPath(computeQuadraticCurve(e.key, a, b)))
      }
      for (const env of environments) {
        const envPos = currentPos(layout, offsets, env.id)
        const regionPos = currentPos(layout, offsets, env.regionId)
        const path = envPathRefs.current.get(env.id)
        if (envPos && regionPos && path) path.setAttribute('d', quadraticSvgPath(computeQuadraticCurve(`env:${env.id}`, envPos, regionPos)))
      }
      for (const c of countryLabels) {
        const p = currentPos(layout, offsets, c.id)
        const label = labelRefs.current.get(c.id)
        if (p && label) label.setAttribute('transform', `translate(${p.x}, ${p.y})`)
      }
    }

    apply(graphStore.getSnapshot().layout, graphStore.getOffsets())
    if (reduced) return
    return graphStore.subscribeFrame((offsets) => apply(graphStore.getSnapshot().layout, offsets))
  }, [edges, environments, countryLabels, reduced, snapshot.hover])

  // Precomputed once per dataset — the effect below (and the synchronous
  // pointer-driven path) both need each edge's TARGET tier.
  const targetTierByEdgeKey = useMemo(() => {
    const byId = new Map(dataset.domainEntities.map((e) => [e.id, e.tier]))
    const map = new Map<string, EntityTier>()
    for (const e of edges) map.set(e.key, byId.get(e.targetId) ?? 'climber')
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset, edges])

  function applyEmphasis(ctx: EmphasisContext) {
    for (const e of entities) {
      const g = groupRefs.current.get(e.id)
      if (!g) continue
      g.style.display = isFilterVisible(e.id, filterVisible) ? '' : 'none'
      g.style.opacity = String(resolveOpacity(e.id, e.tier, ctx))
    }
    for (const e of edges) {
      const path = pathRefs.current.get(e.key)
      if (!path) continue
      path.style.display = isFilterVisible(e.sourceId, filterVisible) && isFilterVisible(e.targetId, filterVisible) ? '' : 'none'
      path.style.opacity = String(resolveEdgeOpacity(e.key, e.targetId, targetTierByEdgeKey.get(e.key) ?? 'climber', ctx))
    }
  }

  // Handles every emphasis source that ISN'T a direct pointer event on this
  // component's own entities — search, filters, focus mode, a hoveredTier
  // set from STRATA's band labels, a selection made elsewhere. Local hover
  // enter/leave below bypasses this entirely and paints synchronously.
  useEffect(() => {
    applyEmphasis(emphasisCtx)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entities, edges, emphasisCtx, filterVisible, dataset])

  return (
    <>
      <svg data-graph-view="network" width="100%" height="100%" viewBox={`0 0 ${size.width} ${size.height}`} className="pointer-events-none absolute left-0 top-0">
        {/* environment edges to their region — behind everything else visually (thin, dim) */}
        {environments.map((env) => (
          <path
            key={`env-edge-${env.id}`}
            ref={envPathRef(env.id)}
            fill="none"
            stroke={renderFinal ? env.color : env.normalColor}
            strokeWidth={ENVIRONMENT_EDGE_WIDTH}
            pathLength={1}
            strokeDasharray={renderFinal ? undefined : 1}
            strokeDashoffset={renderFinal ? 0 : 1}
            style={renderFinal ? undefined : { transition: `stroke-dashoffset ${BUD_CHILD_MIGRATE_MS}ms ${BUD_CHILD_MIGRATE_EASING}`, transitionDelay: `${env.budStartMs}ms` }}
          />
        ))}

        {edges.map((e) => {
          const isFlush = !renderFinal && e.flushDelayMs !== null
          return (
            <path
              key={e.key}
              ref={pathRef(e.key)}
              fill="none"
              stroke={renderFinal ? e.color : isFlush ? e.normalColor : e.color}
              strokeWidth={e.width}
              pathLength={1}
              strokeDasharray={renderFinal ? undefined : 1}
              strokeDashoffset={renderFinal ? 0 : 1}
              className={isFlush ? 'network-edge-flush' : undefined}
              style={
                renderFinal
                  ? undefined
                  : ({
                      transition: `stroke-dashoffset ${BUD_CHILD_MIGRATE_MS}ms ${BUD_CHILD_MIGRATE_EASING}`,
                      transitionDelay: `${e.budStartMs}ms`,
                      animationName: isFlush ? 'network-edge-flush' : undefined,
                      animationDelay: isFlush ? `${e.flushDelayMs}ms` : undefined,
                      animationDuration: isFlush ? `${ANOMALY_FLUSH_HOP_MS}ms` : undefined,
                      animationFillMode: isFlush ? 'forwards' : undefined,
                      animationTimingFunction: isFlush ? 'linear' : undefined,
                      '--flush-from': isFlush ? e.normalColor : undefined,
                      '--flush-to': isFlush ? ANOMALY_RED : undefined,
                    } as React.CSSProperties)
              }
            />
          )
        })}

        {environments.map((env) => {
          const reading = environmentReadings.get(env.id)
          const breached = reading?.breached ?? false
          const color = breached ? ANOMALY_RED : ENVIRONMENT_TEAL
          return (
            <g key={env.id} ref={groupRef(env.id)} data-environment-id={env.id}>
              <g className={renderFinal ? undefined : 'network-parent-pop'} style={renderFinal ? undefined : env.parentPopStyle}>
                <g
                  className={renderFinal ? undefined : 'network-bud-child'}
                  style={
                    renderFinal
                      ? { opacity: 1 }
                      : ({
                          '--from-dx': `${fromOffset(env.id).dx}px`,
                          '--from-dy': `${fromOffset(env.id).dy}px`,
                          '--color-from': env.normalColor,
                          '--color-to': color,
                          animationDelay: `${env.budStartMs}ms`,
                        } as React.CSSProperties)
                  }
                >
                  <circle
                    r={ENVIRONMENT_RADIUS_PX}
                    fill={renderFinal ? color : undefined}
                    stroke={darkenColor(color)}
                    strokeWidth={1}
                    className={reduced ? undefined : 'environment-pulse'}
                    // "Its pulse begins the moment it settles" — delayed to
                    // land exactly when its own bud finishes, not at mount.
                    style={reduced || renderFinal ? undefined : { animationDelay: `${env.budStartMs + BUD_CHILD_TOTAL_MS}ms` }}
                  />
                </g>
              </g>
            </g>
          )
        })}

        {entities.map((e) => {
          const isSelected = snapshot.selection === e.id
          const selectionRingRadius = e.radius + SELECTION_RING_GAP_PX + SELECTION_RING_WIDTH_PX / 2
          const isAnomalyFlush = !renderFinal && e.turnRedDelayMs !== undefined
          return (
            <g
              key={e.id}
              ref={groupRef(e.id)}
              tabIndex={0}
              data-entity-id={e.id}
              className="pointer-events-auto cursor-pointer"
              onPointerEnter={(evt) => {
                graphStore.setHover(e.id)
                hoveredIdRef.current = e.id
                applyEmphasis({ ...emphasisCtx, hoverChain: hoverChainIndex.get(e.id) ?? null })
                setTooltipPos({ x: evt.clientX, y: evt.clientY })
              }}
              onPointerMove={(evt) => setTooltipPos({ x: evt.clientX, y: evt.clientY })}
              onPointerLeave={() => {
                if (graphStore.getSnapshot().hover === e.id) {
                  graphStore.setHover(null)
                  hoveredIdRef.current = null
                  const fallbackId = snapshot.selection
                  applyEmphasis({ ...emphasisCtx, hoverChain: fallbackId ? (hoverChainIndex.get(fallbackId) ?? null) : null })
                }
                setTooltipPos(null)
              }}
              onFocus={() => {
                graphStore.setHover(e.id, true)
                hoveredIdRef.current = e.id
                applyEmphasis({ ...emphasisCtx, hoverChain: hoverChainIndex.get(e.id) ?? null })
              }}
              onClick={(evt) => {
                evt.stopPropagation()
                graphStore.setSelection(snapshot.selection === e.id ? null : e.id)
              }}
              onDoubleClick={(evt) => {
                evt.stopPropagation()
                onFocusEntity(e.id)
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
                if (nextId) groupRefs.current.get(nextId)?.focus()
              }}
            >
              <g className={renderFinal ? undefined : 'network-parent-pop'} style={renderFinal ? undefined : e.parentPopStyle}>
                {isSelected && <circle r={selectionRingRadius} fill="none" stroke={CLIMBER_WHITE} strokeWidth={SELECTION_RING_WIDTH_PX} />}
                {e.isAnomalous && <circle r={e.radius * ANOMALY_GLOW_SCALE} fill={ANOMALY_RED} opacity={0.28} style={{ filter: 'blur(2.5px)' }} />}

                {e.isCountry ? (
                  <>
                    <g className={renderFinal ? undefined : 'network-pop-a'} style={renderFinal ? { opacity: 1 } : { animationDelay: `${e.arrivalDelayMs}ms` }}>
                      <circle r={e.radius} fill={e.color} stroke={e.ring} strokeWidth={1} />
                    </g>
                    {!renderFinal && (
                      <circle
                        className="network-arrival-ring"
                        r={1}
                        fill="none"
                        stroke={CLIMBER_WHITE}
                        strokeWidth={1}
                        style={{ animationDelay: `${e.arrivalDelayMs}ms` }}
                      />
                    )}
                  </>
                ) : (
                  <g
                    className={renderFinal ? undefined : 'network-bud-child'}
                    style={
                      renderFinal
                        ? { opacity: 1 }
                        : ({
                            '--from-dx': `${fromOffset(e.id).dx}px`,
                            '--from-dy': `${fromOffset(e.id).dy}px`,
                            '--color-from': e.normalColor,
                            '--color-to': e.isAnomalous ? e.normalColor : e.color,
                            animationDelay: `${e.arrivalDelayMs}ms`,
                          } as React.CSSProperties)
                    }
                  >
                    <circle
                      r={e.radius}
                      fill={renderFinal ? e.color : undefined}
                      stroke={e.ring}
                      strokeWidth={1}
                      className={isAnomalyFlush ? 'network-node-flush' : undefined}
                      style={
                        isAnomalyFlush
                          ? ({
                              animationName: 'network-node-flush',
                              animationDelay: `${e.turnRedDelayMs}ms`,
                              animationDuration: '200ms',
                              animationFillMode: 'forwards',
                              animationTimingFunction: 'ease-out',
                              '--flush-from': e.normalColor,
                              '--flush-to': ANOMALY_RED,
                            } as React.CSSProperties)
                          : undefined
                      }
                    />
                  </g>
                )}
              </g>
            </g>
          )
        })}

        {/* country names — always visible, never anything else on the canvas */}
        {countryLabels.map((c) => (
          <g key={`label-${c.id}`} ref={labelRef(c.id)} className="pointer-events-none">
            <text
              y={TIER_RADIUS_PX.country + 14}
              textAnchor="middle"
              fontSize={10}
              className={renderFinal ? 'font-mono' : 'font-mono network-country-label'}
              fill={TEXT_SECONDARY}
              style={renderFinal ? undefined : { animationDelay: `${c.nameDelayMs}ms` }}
              opacity={renderFinal ? 1 : undefined}
            >
              {c.label}
            </text>
          </g>
        ))}
      </svg>
      {tooltipPos && snapshot.hover && (
        <EntityTooltip info={tooltipIndex.get(snapshot.hover) ?? null} x={tooltipPos.x} y={tooltipPos.y} watch={watchIds.has(snapshot.hover)} />
      )}
    </>
  )
}
